"""Round 2 investigation API.

Read-only with respect to Round 1 data.  All state writes go to r2_* tables.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.common import own_brand
from app.config.deps import get_current_user, require_writer
from app.db.session import get_db
from app.models.r2 import R2Alert, R2Investigation
from app.models.user import User
from app.services import r2 as svc

router = APIRouter(prefix="/r2", tags=["round2"])


def _get_inv(db: Session, inv_id: int, brand_id: int) -> R2Investigation:
    inv = db.get(R2Investigation, inv_id)
    if inv is None or inv.brand_id != brand_id:
        raise HTTPException(404, "Investigation not found.")
    return inv


# ---------------------------------------------------------------------------
# Sync & List
# ---------------------------------------------------------------------------

@router.post("/investigations/sync")
def sync_investigations(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Import all active Round 1 detections that don't yet have a Round 2 record."""
    brand = own_brand(db, user)
    return svc.sync_brand(db, brand.id)


@router.get("/investigations")
def list_investigations(
    status: str | None = None,
    risk_level: str | None = None,
    platform: str | None = None,
    category: str | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    brand = own_brand(db, user)
    return svc.list_investigations(
        db, brand.id,
        status=status, risk_level=risk_level, platform=platform,
        category=category, q=q, limit=limit, offset=offset,
    )


@router.get("/investigations/{inv_id}")
def get_investigation(
    inv_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    brand = own_brand(db, user)
    inv = _get_inv(db, inv_id, brand.id)
    return svc.get_investigation_detail(db, inv)


# ---------------------------------------------------------------------------
# Status transitions
# ---------------------------------------------------------------------------

class NoteBody(BaseModel):
    note: str = ""


@router.post("/investigations/{inv_id}/start")
def start_investigation(
    inv_id: int,
    body: NoteBody = NoteBody(),
    user: User = Depends(require_writer),
    db: Session = Depends(get_db),
) -> dict:
    brand = own_brand(db, user)
    inv = _get_inv(db, inv_id, brand.id)
    try:
        return svc._inv_row(svc.change_status(db, inv, user, "under_review", body.note))
    except svc.ActionError as e:
        raise HTTPException(e.status_code, e.message) from e


@router.post("/investigations/{inv_id}/confirm")
def confirm_investigation(
    inv_id: int,
    body: NoteBody = NoteBody(),
    user: User = Depends(require_writer),
    db: Session = Depends(get_db),
) -> dict:
    brand = own_brand(db, user)
    inv = _get_inv(db, inv_id, brand.id)
    try:
        return svc._inv_row(svc.change_status(db, inv, user, "confirmed", body.note))
    except svc.ActionError as e:
        raise HTTPException(e.status_code, e.message) from e


@router.post("/investigations/{inv_id}/false-positive")
def mark_false_positive(
    inv_id: int,
    body: NoteBody = NoteBody(),
    user: User = Depends(require_writer),
    db: Session = Depends(get_db),
) -> dict:
    brand = own_brand(db, user)
    inv = _get_inv(db, inv_id, brand.id)
    try:
        return svc._inv_row(svc.change_status(db, inv, user, "false_positive", body.note))
    except svc.ActionError as e:
        raise HTTPException(e.status_code, e.message) from e


@router.post("/investigations/{inv_id}/close")
def close_investigation(
    inv_id: int,
    body: NoteBody = NoteBody(),
    user: User = Depends(require_writer),
    db: Session = Depends(get_db),
) -> dict:
    brand = own_brand(db, user)
    inv = _get_inv(db, inv_id, brand.id)
    try:
        return svc._inv_row(svc.change_status(db, inv, user, "closed", body.note))
    except svc.ActionError as e:
        raise HTTPException(e.status_code, e.message) from e


@router.post("/investigations/{inv_id}/reopen")
def reopen_investigation(
    inv_id: int,
    body: NoteBody = NoteBody(),
    user: User = Depends(require_writer),
    db: Session = Depends(get_db),
) -> dict:
    brand = own_brand(db, user)
    inv = _get_inv(db, inv_id, brand.id)
    try:
        note = f"Reopened. {body.note}".strip()
        return svc._inv_row(svc.change_status(db, inv, user, "under_review", note))
    except svc.ActionError as e:
        raise HTTPException(e.status_code, e.message) from e


@router.post("/investigations/{inv_id}/note")
def add_note(
    inv_id: int,
    body: NoteBody,
    user: User = Depends(require_writer),
    db: Session = Depends(get_db),
) -> dict:
    brand = own_brand(db, user)
    inv = _get_inv(db, inv_id, brand.id)
    try:
        return svc._inv_row(svc.add_note(db, inv, user, body.note))
    except svc.ActionError as e:
        raise HTTPException(e.status_code, e.message) from e


class AssignBody(BaseModel):
    analyst: str


@router.post("/investigations/{inv_id}/assign")
def assign_analyst(
    inv_id: int,
    body: AssignBody,
    user: User = Depends(require_writer),
    db: Session = Depends(get_db),
) -> dict:
    brand = own_brand(db, user)
    inv = _get_inv(db, inv_id, brand.id)
    try:
        return svc._inv_row(svc.assign_analyst(db, inv, user, body.analyst))
    except svc.ActionError as e:
        raise HTTPException(e.status_code, e.message) from e


@router.get("/investigations/{inv_id}/takedown")
def get_takedown_report(
    inv_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    brand = own_brand(db, user)
    inv = _get_inv(db, inv_id, brand.id)
    return svc.generate_takedown_report(db, inv)


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

@router.get("/alerts")
def list_alerts(
    include_dismissed: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    brand = own_brand(db, user)
    items = svc.list_alerts(db, brand.id, include_dismissed=include_dismissed)
    return {"items": items, "total": len(items)}


@router.post("/alerts/{alert_id}/dismiss")
def dismiss_alert(
    alert_id: int,
    user: User = Depends(require_writer),
    db: Session = Depends(get_db),
) -> dict:
    brand = own_brand(db, user)
    alert = db.get(R2Alert, alert_id)
    if alert is None or alert.brand_id != brand.id:
        raise HTTPException(404, "Alert not found.")
    return svc._alert_row(svc.dismiss_alert(db, alert, user))
