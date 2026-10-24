from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config.deps import require_admin
from app.config.time import utcnow
from app.db.session import get_db
from app.models import Brand, User
from app.schemas.auth import OkResponse
from app.services import audit

router = APIRouter(prefix="/admin/brands")


class AdminBrandRow(BaseModel):
    id: int
    name: str
    industry: str
    domains: list[str]
    owner_id: int | None
    owner_name: str | None
    owner_email: str | None
    owner_role: str | None
    created_at: datetime
    archived: bool


@router.get("", response_model=list[AdminBrandRow])
def list_all_brands(user: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[AdminBrandRow]:
    """Admin only: every brand registered by any account (admin or user), newest first. Deleted brands are not listed."""
    rows = db.execute(
        select(Brand, User).outerjoin(User, Brand.owner_id == User.id).where(Brand.archived_at.is_(None)).order_by(Brand.id.desc())
    ).all()
    return [
        AdminBrandRow(
            id=b.id,
            name=b.name,
            industry=b.industry or "",
            domains=list(b.domains or []),
            owner_id=b.owner_id,
            owner_name=u.name if u else None,
            owner_email=u.email if u else None,
            owner_role=u.role if u else None,
            created_at=b.created_at,
            archived=False,
        )
        for b, u in rows
    ]


@router.delete("/{brand_id}", response_model=OkResponse)
def delete_any_brand(brand_id: int, confirm: str = "", user: User = Depends(require_admin), db: Session = Depends(get_db)) -> OkResponse:
    """Admin only: delete any account's brand. It leaves lists and scans at once (soft delete: records are kept for the audit trail).
    `confirm` must be the exact brand name."""
    brand = db.get(Brand, brand_id)
    if brand is None or brand.archived_at is not None:
        raise HTTPException(404, "Brand not found")
    if confirm != brand.name:
        raise HTTPException(409, "Type the exact brand name to confirm the deletion")
    brand.archived_at = utcnow()
    if brand.owner_id is not None:
        owner = db.get(User, brand.owner_id)
        if owner is not None and owner.active_brand_id == brand.id:
            owner.active_brand_id = None
    audit.record(db, user, "brand.deleted_by_admin", brand.name, f"owner_id={brand.owner_id}")
    db.commit()
    return OkResponse(detail="Brand deleted.")
