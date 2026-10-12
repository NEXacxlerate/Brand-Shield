import re
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import schemas as S
from ..config import settings
from ..db import get_db
from ..engine import similarity as sim
from ..engine.ids import domain_of
from ..models import Brand, Entity, User
from ..security import admin_user, limiter, viewer_user
from ..services import dashboard_service
from ..services.common import write_audit

router = APIRouter(prefix="/api/brands", tags=["brands"])
LOGO_MAGIC = {b"\x89PNG\r\n\x1a\n": "png", b"\xff\xd8\xff": "jpg", b"GIF8": "gif"}


def _split(s: str | None) -> list[str]:
    return [x.strip() for x in re.split(r"[\n,]+", s or "") if x.strip()]


def _handles(s: str | None) -> dict:
    out = {}
    for line in _split(s):
        if ":" in line:
            p, h = line.split(":", 1)
            out[p.strip().lower()] = h.strip().lstrip("@").lower()
    return out


def _out(db: Session, b: Brand) -> S.BrandOut:
    n = db.scalar(select(func.count(Entity.id)).where(Entity.brand_id == b.id)) or 0
    return S.BrandOut(id=b.id, name=b.name, aliases=b.aliases or [], domains=b.domains or [], handles=b.handles or {}, app_ids=b.app_ids or [],
                      developers=b.developers or [], cert_sha256=b.cert_sha256 or "", permissions=b.permissions or [], phones=b.phones or [],
                      official_text=b.official_text or "", logo_path=b.logo_path, logo_hash=b.logo_hash, is_demo=b.is_demo, entities=n)


def save_logo(raw: bytes, brand_id: int) -> tuple[str, str]:
    """Validate magic bytes and size, compute the 64-bit dHash, store outside the web root. Returns (file name, hash hex)."""
    if len(raw) > settings.max_logo_mb * 1024 * 1024:
        raise HTTPException(400, f"Logo is larger than {settings.max_logo_mb} MB")
    ext = next((e for m, e in LOGO_MAGIC.items() if raw.startswith(m)), None)
    if ext is None and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        ext = "webp"
    if ext is None:
        raise HTTPException(400, "Logo must be a PNG, JPEG, GIF or WebP image")
    try:
        h = sim.dhash(raw)
    except Exception:
        raise HTTPException(400, "Could not read that image")
    name = f"brand_{brand_id}_{uuid.uuid4().hex[:8]}.{ext}"
    (settings.logo_dir / name).write_bytes(raw)
    return name, f"{h:016x}"


@router.get("", response_model=list[S.BrandOut])
def list_brands(db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    return [_out(db, b) for b in db.scalars(select(Brand).order_by(Brand.id))]


@router.get("/{brand_id}", response_model=S.BrandOut)
def get_brand(brand_id: int, db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    b = db.get(Brand, brand_id)
    if not b:
        raise HTTPException(404, "Brand not found")
    return _out(db, b)


@router.post("", response_model=S.BrandOut, status_code=201)
@limiter.limit("10/minute")
async def create_brand(request: Request, name: str = Form(...), domains: str = Form(...), aliases: str = Form(""), handles: str = Form(""),
                       app_ids: str = Form(""), developers: str = Form(""), phones: str = Form(""), permissions: str = Form(""),
                       cert_sha256: str = Form(""), official_text: str = Form(""), logo: UploadFile | None = File(None),
                       db: Session = Depends(get_db), user: User = Depends(admin_user)):
    """Create a brand digital twin. `handles` is one 'platform:handle' per line."""
    doms = [domain_of(d) for d in _split(domains)]
    if not name.strip() or not doms:
        raise HTTPException(422, "Brand name and at least one official domain are required")
    if db.scalar(select(Brand).where(Brand.name == name.strip())):
        raise HTTPException(409, "A brand with that name already exists")
    raw = await logo.read(settings.max_logo_mb * 1024 * 1024 + 1) if logo and logo.filename else None
    b = Brand(name=name.strip(), aliases=_split(aliases), domains=doms, handles=_handles(handles), app_ids=_split(app_ids), developers=_split(developers),
              phones=_split(phones), permissions=_split(permissions), cert_sha256=cert_sha256.strip().lower(), official_text=official_text or name, is_demo=False)
    db.add(b)
    db.flush()
    if raw:
        b.logo_path, b.logo_hash = save_logo(raw, b.id)
    db.commit()
    write_audit(db, user, "brand created", b.name)
    return _out(db, b)


@router.put("/{brand_id}", response_model=S.BrandOut)
@limiter.limit("10/minute")
async def update_brand(request: Request, brand_id: int, name: str | None = Form(None), domains: str | None = Form(None), aliases: str | None = Form(None),
                       handles: str | None = Form(None), app_ids: str | None = Form(None), developers: str | None = Form(None),
                       phones: str | None = Form(None), permissions: str | None = Form(None), cert_sha256: str | None = Form(None),
                       official_text: str | None = Form(None), logo: UploadFile | None = File(None),
                       db: Session = Depends(get_db), user: User = Depends(admin_user)):
    b = db.get(Brand, brand_id)
    if not b:
        raise HTTPException(404, "Brand not found")
    if name is not None and name.strip():
        b.name = name.strip()
    if domains is not None:
        doms = [domain_of(d) for d in _split(domains)]
        if not doms:
            raise HTTPException(422, "At least one official domain is required")
        b.domains = doms
    if aliases is not None:
        b.aliases = _split(aliases)
    if handles is not None:
        b.handles = _handles(handles)
    if app_ids is not None:
        b.app_ids = _split(app_ids)
    if developers is not None:
        b.developers = _split(developers)
    if phones is not None:
        b.phones = _split(phones)
    if permissions is not None:
        b.permissions = _split(permissions)
    if cert_sha256 is not None:
        b.cert_sha256 = cert_sha256.strip().lower()
    if official_text is not None:
        b.official_text = official_text
    if logo and logo.filename:
        b.logo_path, b.logo_hash = save_logo(await logo.read(settings.max_logo_mb * 1024 * 1024 + 1), b.id)
    db.commit()
    from ..services import analysis_service
    analysis_service.run_analysis(db, b.id, user)               # the digital twin changed: re-score what we already know
    write_audit(db, user, "brand updated", b.name)
    return _out(db, b)


@router.get("/{brand_id}/monitor", response_model=S.MonitorOut)
def brand_monitor(brand_id: int, db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    if not db.get(Brand, brand_id):
        raise HTTPException(404, "Brand not found")
    return dashboard_service.monitor(db, brand_id)
