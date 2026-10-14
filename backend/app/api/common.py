import hashlib

from fastapi import HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.pipeline.scan_pipeline import ScanContext
from app.db.request_cache import memo
from app.models import Brand, User
from app.services import data_mode


def file_response(data: bytes, media_type: str, headers: dict[str, str]) -> Response:
    """Serve stored bytes (from either file store). Files are content-addressed, so the hash is a stable ETag."""
    return Response(content=data, media_type=media_type, headers={**headers, "ETag": f'"{hashlib.sha256(data).hexdigest()[:32]}"'})


def get_ctx(request: Request) -> ScanContext:
    return request.app.state.scan_ctx


def get_brand_or_404(db: Session, brand_id: int, user: User, include_archived: bool = False) -> Brand:
    """The brand with this id, only when `user` owns it. Another account's brand is a plain 404 (never 403), so its existence does not leak."""
    brand = memo(db, ("brand", user.id, brand_id), lambda: db.get(Brand, brand_id))
    if brand is None or brand.owner_id != user.id or (brand.archived_at is not None and not include_archived):
        raise HTTPException(404, "Brand not found")
    return brand


def own_brand(db: Session, user: User) -> Brand | None:
    """The user's own non-archived brand (the oldest if several), or None."""
    return memo(
        db,
        ("brand", user.id, None),
        lambda: db.scalars(select(Brand).where(Brand.owner_id == user.id, Brand.archived_at.is_(None)).order_by(Brand.id)).first(),
    )


def resolve_brand(db: Session, brand_id: int | None, user: User) -> Brand:
    """`brand_id` is optional everywhere: it defaults to the signed-in user's own brand. Never returns another account's brand."""
    if brand_id:
        return get_brand_or_404(db, brand_id, user)
    brand = own_brand(db, user)
    if brand is None:
        raise HTTPException(404, "No brand profile yet. Create one first.")
    return brand


def owns_brand(db: Session, brand_id: int | None, user: User) -> bool:
    """Does `user` own the brand an object (detection, scan, report, image) belongs to? Callers answer 404 'X not found' when not."""
    if not brand_id:
        return False
    brand = memo(db, ("brand", user.id, brand_id), lambda: db.get(Brand, brand_id))
    return brand is not None and brand.owner_id == user.id


def mode_of(db: Session, request: Request) -> str:
    return data_mode.effective_mode(db, request.app.state.settings)
