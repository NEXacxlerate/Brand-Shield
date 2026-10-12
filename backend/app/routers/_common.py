from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Brand, User
from ..services.common import iso


def resolve_brand(db: Session, brand_id: int | None) -> Brand:
    """The requested brand, or the first brand when none is given."""
    b = db.get(Brand, brand_id) if brand_id else db.scalar(select(Brand).order_by(Brand.id).limit(1))
    if not b:
        raise HTTPException(404, "Brand not found. Create a brand first.")
    return b


def user_name(db: Session, user_id: int | None) -> str | None:
    if not user_id:
        return None
    u = db.get(User, user_id)
    return u.name if u else None


def paginate(page: int, size: int = 20):
    page = max(1, page)
    return (page - 1) * size, size
