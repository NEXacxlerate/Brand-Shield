from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas as S
from ..db import get_db
from ..models import Alert, User, WatchItem
from ..security import analyst_user, viewer_user
from ..services import watch_service
from ..services.common import ago, iso, write_audit
from ._common import resolve_brand

router = APIRouter(prefix="/api", tags=["watchlist"])


def _out(w: WatchItem) -> S.WatchOut:
    return S.WatchOut(id=w.id, brand_id=w.brand_id, kind=w.kind, value=w.value, rules=w.rules or {}, status=w.status, last_checked=iso(w.last_checked),
                      created_at=iso(w.created_at))


def _alert_out(a: Alert) -> S.AlertOut:
    return S.AlertOut(id=a.id, brand_id=a.brand_id, kind=a.kind, severity=a.severity, title=a.title, detail=a.detail, entity_id=a.entity_id,
                      read=a.read, sample=a.is_sample, ago=ago(a.created_at), created_at=iso(a.created_at))


@router.get("/watchlist", response_model=list[S.WatchOut])
def list_watch(brand_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    q = select(WatchItem).order_by(WatchItem.created_at.desc(), WatchItem.id.desc())
    if brand_id:
        q = q.where(WatchItem.brand_id == brand_id)
    return [_out(w) for w in db.scalars(q)]


@router.post("/watchlist", response_model=S.WatchOut, status_code=201)
def add_watch(body: S.WatchCreate, db: Session = Depends(get_db), user: User = Depends(analyst_user)):
    b = resolve_brand(db, body.brand_id)
    value = watch_service.normalise_value(body.kind, body.value)
    if db.scalar(select(WatchItem).where(WatchItem.brand_id == b.id, WatchItem.kind == body.kind, WatchItem.value == value)):
        raise HTTPException(409, "Already on the watchlist")
    w = WatchItem(brand_id=b.id, kind=body.kind, value=value, rules={**watch_service.DEFAULT_RULES, **body.rules})
    db.add(w)
    db.commit()
    write_audit(db, user, "watchlist add", f"{w.kind}:{w.value}")
    return _out(w)


@router.patch("/watchlist/{wid}", response_model=S.WatchOut)
def patch_watch(wid: int, body: S.WatchPatch, db: Session = Depends(get_db), user: User = Depends(analyst_user)):
    w = db.get(WatchItem, wid)
    if not w:
        raise HTTPException(404, "Watch item not found")
    if body.rules is not None:
        w.rules = {**watch_service.DEFAULT_RULES, **body.rules}
    if body.status is not None:
        w.status = body.status                    # e.g. an analyst acknowledges a change by setting it back to stable
    db.commit()
    if body.check_now:
        watch_service.check_item(db, w)
    write_audit(db, user, "watchlist update", f"{w.kind}:{w.value}", f"status={w.status}")
    return _out(w)


@router.delete("/watchlist/{wid}", response_model=S.Ok)
def delete_watch(wid: int, db: Session = Depends(get_db), user: User = Depends(analyst_user)):
    w = db.get(WatchItem, wid)
    if not w:
        raise HTTPException(404, "Watch item not found")
    label = f"{w.kind}:{w.value}"
    db.delete(w)
    db.commit()
    write_audit(db, user, "watchlist delete", label)
    return S.Ok(detail="Removed")


@router.get("/alerts", response_model=list[S.AlertOut])
def list_alerts(unread: bool = False, brand_id: int | None = None, limit: int = 50, db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    q = select(Alert).order_by(Alert.created_at.desc(), Alert.id.desc()).limit(min(max(limit, 1), 200))
    if unread:
        q = q.where(Alert.read == False)  # noqa: E712
    if brand_id:
        q = q.where(Alert.brand_id == brand_id)
    return [_alert_out(a) for a in db.scalars(q)]


@router.post("/alerts/{aid}/read", response_model=S.AlertOut)
def mark_read(aid: int, db: Session = Depends(get_db), user: User = Depends(analyst_user)):
    a = db.get(Alert, aid)
    if not a:
        raise HTTPException(404, "Alert not found")
    a.read = True
    db.commit()
    write_audit(db, user, "alert read", f"alert {aid}")
    return _alert_out(a)
