import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.deps import get_current_user, get_settings_dep, get_url_checker, require_writer
from app.core.time import utcnow
from app.db.session import get_db
from app.models import Brand, OfficialAccount, OfficialApp, User
from app.schemas.auth import OkResponse
from app.schemas.brand import (
    AccountCreate,
    AccountList,
    AccountOut,
    AllowlistOut,
    AppCreate,
    AppList,
    AppOut,
    BrandIdentity,
    BrandOut,
    BrandSummary,
    LogoOut,
    ProfileHealthOut,
)
from app.services import audit
from app.services import validators as v
from app.services.detections import sync_with_allowlist
from app.services.logo import LogoError, process_logo, save_logo
from app.services.profile_health import compute_profile_health
from app.services.url_safety import UrlChecker

router = APIRouter(prefix="/brands")
log = logging.getLogger("app.brands")


def get_brand_or_404(db: Session, brand_id: int) -> Brand:
    brand = db.get(Brand, brand_id)
    if brand is None:
        raise HTTPException(404, "Brand not found")
    return brand


def account_out(a: OfficialAccount, warning: str | None = None) -> AccountOut:
    return AccountOut(
        id=a.id,
        platform=a.platform,
        handle=v.display_handle(a.platform, a.handle),
        url=a.url,
        status=a.status,
        last_checked_at=a.last_checked_at,
        source=a.source,
        warning=warning,
    )


def app_out(a: OfficialApp) -> AppOut:
    return AppOut(
        id=a.id,
        name=a.name,
        package_id=a.package_id,
        publisher=a.publisher,
        stores=a.stores,
        status=a.status,
        source=a.source,
    )


def logo_out(b: Brand) -> LogoOut | None:
    if not b.logo_path:
        return None
    return LogoOut(
        url=f"/api/brands/{b.id}/logo",
        format=b.logo_format or "",
        width=b.logo_width or 0,
        height=b.logo_height or 0,
        size_bytes=b.logo_size_bytes or 0,
        sha256=b.logo_sha256 or "",
    )


def brand_out(b: Brand) -> BrandOut:
    return BrandOut(
        id=b.id,
        name=b.name,
        industry=b.industry,
        aliases=b.aliases,
        keywords=b.keywords,
        domains=b.domains,
        logo=logo_out(b),
        official_accounts=[account_out(a) for a in b.accounts],
        official_apps=[app_out(a) for a in b.apps],
        profile_health=ProfileHealthOut(**compute_profile_health(b)),
        allowlist=AllowlistOut(accounts=len(b.accounts), apps=len(b.apps), domains=len(b.domains)),
        official_assets=len(b.accounts) + len(b.apps),
        updated_at=b.updated_at,
        source=b.source,
    )


def _touch(b: Brand) -> None:
    b.updated_at = utcnow()


# ---------------------------------------------------------------- brands


@router.get("", response_model=list[BrandSummary])
def list_brands(_: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[Brand]:
    return list(db.scalars(select(Brand).order_by(Brand.id)))


@router.post("", response_model=BrandOut, status_code=201)
def create_brand(body: BrandIdentity, user: User = Depends(require_writer), db: Session = Depends(get_db)) -> BrandOut:
    # Single brand per organisation for now; the table keeps brands separate for later.
    if db.scalar(select(func.count()).select_from(Brand)):
        raise HTTPException(409, "A brand already exists. Edit it instead.")
    brand = Brand(**body.model_dump())
    db.add(brand)
    db.flush()
    audit.record(db, user, "brand.created", brand.name)
    db.commit()
    return brand_out(brand)


@router.get("/{brand_id}", response_model=BrandOut)
def get_brand(brand_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)) -> BrandOut:
    return brand_out(get_brand_or_404(db, brand_id))


@router.put("/{brand_id}", response_model=BrandOut)
def update_brand(
    brand_id: int, body: BrandIdentity, user: User = Depends(require_writer), db: Session = Depends(get_db)
) -> BrandOut:
    brand = get_brand_or_404(db, brand_id)
    changed = [k for k, val in body.model_dump().items() if getattr(brand, k) != val]
    for k, val in body.model_dump().items():
        setattr(brand, k, val)
    _touch(brand)
    audit.record(db, user, "brand.updated", brand.name, "changed: " + (", ".join(changed) or "nothing"))
    db.commit()
    return brand_out(brand)


# ---------------------------------------------------------------- logo


@router.post("/{brand_id}/logo", response_model=LogoOut)
def upload_logo(
    brand_id: int,
    file: UploadFile = File(...),
    user: User = Depends(require_writer),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
) -> LogoOut:
    brand = get_brand_or_404(db, brand_id)
    data = file.file.read(settings.logo_max_bytes + 1)  # never read more than the cap + 1 byte
    try:
        logo = process_logo(data, settings.logo_max_bytes)
    except LogoError as exc:
        raise HTTPException(exc.status_code, exc.message) from exc
    old = brand.logo_path
    rel = save_logo(settings.data_dir, brand.id, logo)
    brand.logo_path = rel
    brand.logo_format = logo.format
    brand.logo_width, brand.logo_height = logo.width, logo.height
    brand.logo_size_bytes = len(logo.data)
    brand.logo_sha256 = logo.sha256
    _touch(brand)
    audit.record(db, user, "logo.replaced", brand.name, f"{logo.format} {logo.width}x{logo.height} sha256={logo.sha256[:12]}")
    db.commit()
    if old and old != rel:
        (settings.data_dir / old).unlink(missing_ok=True)
    out = logo_out(brand)
    assert out is not None
    return out


@router.get("/{brand_id}/logo")
def get_logo(
    brand_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
) -> FileResponse:
    brand = get_brand_or_404(db, brand_id)
    if not brand.logo_path:
        raise HTTPException(404, "No logo uploaded")
    root = Path(settings.data_dir).resolve()
    path = (root / brand.logo_path).resolve()
    if root not in path.parents or not path.is_file():
        raise HTTPException(404, "Logo file is missing")
    media = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}[brand.logo_format or "png"]
    return FileResponse(path, media_type=media, headers={"X-Content-Type-Options": "nosniff"})


# ---------------------------------------------------------------- official accounts


@router.get("/{brand_id}/accounts", response_model=AccountList)
def list_accounts(brand_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)) -> AccountList:
    brand = get_brand_or_404(db, brand_id)
    return AccountList(total=len(brand.accounts), items=[account_out(a) for a in brand.accounts])


@router.post("/{brand_id}/accounts", response_model=AccountOut, status_code=201)
def add_account(
    brand_id: int,
    body: AccountCreate,
    user: User = Depends(require_writer),
    db: Session = Depends(get_db),
    checker: UrlChecker = Depends(get_url_checker),
) -> AccountOut:
    brand = get_brand_or_404(db, brand_id)
    key = body.handle.lower()
    exists = db.scalar(
        select(OfficialAccount.id).where(
            OfficialAccount.brand_id == brand.id,
            OfficialAccount.platform == body.platform,
            OfficialAccount.handle_key == key,
        )
    )
    if exists:
        raise HTTPException(409, f"{body.handle} is already an official {body.platform} account")
    url = v.build_account_url(body.platform, body.handle)
    result = checker.check(url)  # never raises; failure becomes status=unreachable plus a warning
    account = OfficialAccount(
        brand_id=brand.id,
        platform=body.platform,
        handle=body.handle,
        handle_key=key,
        url=url,
        status=result.status,
        check_message=result.message,
        last_checked_at=utcnow(),
    )
    db.add(account)
    db.flush()
    _touch(brand)
    audit.record(db, user, "account.added", f"{v.display_handle(body.platform, body.handle)} on {body.platform}", result.status)
    db.expire(brand, ["accounts"])
    sync_with_allowlist(db, brand, user)  # an existing detection for exactly this handle leaves the detection lists
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, f"{body.handle} is already an official {body.platform} account") from exc
    return account_out(account, None if result.ok else result.message)


@router.delete("/{brand_id}/accounts/{account_id}", response_model=OkResponse)
def remove_account(
    brand_id: int, account_id: int, user: User = Depends(require_writer), db: Session = Depends(get_db)
) -> OkResponse:
    brand = get_brand_or_404(db, brand_id)
    account = db.get(OfficialAccount, account_id)
    if account is None or account.brand_id != brand.id:
        raise HTTPException(404, "Account not found")
    audit.record(db, user, "account.removed", f"{v.display_handle(account.platform, account.handle)} on {account.platform}")
    db.delete(account)
    _touch(brand)
    db.commit()
    return OkResponse()


# ---------------------------------------------------------------- official apps


@router.get("/{brand_id}/apps", response_model=AppList)
def list_apps(brand_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)) -> AppList:
    brand = get_brand_or_404(db, brand_id)
    return AppList(total=len(brand.apps), items=[app_out(a) for a in brand.apps])


@router.post("/{brand_id}/apps", response_model=AppOut, status_code=201)
def add_app(
    brand_id: int, body: AppCreate, user: User = Depends(require_writer), db: Session = Depends(get_db)
) -> AppOut:
    brand = get_brand_or_404(db, brand_id)
    key = body.package_id.lower()
    if db.scalar(select(OfficialApp.id).where(OfficialApp.brand_id == brand.id, OfficialApp.package_key == key)):
        raise HTTPException(409, f"{body.package_id} is already an official app")
    app = OfficialApp(
        brand_id=brand.id,
        name=body.name,
        package_id=body.package_id,
        package_key=key,
        publisher=body.publisher,
        stores=body.stores,
    )
    db.add(app)
    db.flush()
    _touch(brand)
    audit.record(db, user, "app.added", f"{body.name} ({body.package_id})", ", ".join(body.stores))
    db.expire(brand, ["apps"])
    sync_with_allowlist(db, brand, user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, f"{body.package_id} is already an official app") from exc
    return app_out(app)


@router.delete("/{brand_id}/apps/{app_id}", response_model=OkResponse)
def remove_app(
    brand_id: int, app_id: int, user: User = Depends(require_writer), db: Session = Depends(get_db)
) -> OkResponse:
    brand = get_brand_or_404(db, brand_id)
    app = db.get(OfficialApp, app_id)
    if app is None or app.brand_id != brand.id:
        raise HTTPException(404, "App not found")
    audit.record(db, user, "app.removed", f"{app.name} ({app.package_id})")
    db.delete(app)
    _touch(brand)
    db.commit()
    return OkResponse()
