from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas as S
from ..db import get_db
from ..engine import analysis
from ..models import Entity, User
from ..security import analyst_user, viewer_user
from ..services import analysis_service as svc
from ..services.common import write_audit
from ._common import resolve_brand

router = APIRouter(prefix="/api/entities", tags=["entities"])
NEW_STATUS = {"confirm": "confirmed", "dismiss": "dismissed", "reopen": "new"}


@router.get("", response_model=list[S.EntityRow])
def list_entities(brand_id: int | None = None, min_score: float = 30, status: str | None = None, db: Session = Depends(get_db),
                  user: User = Depends(viewer_user)):
    b = resolve_brand(db, brand_id)
    q = select(Entity).where(Entity.brand_id == b.id, Entity.score >= min_score)
    if status:
        q = q.where(Entity.status == status)
    out = []
    for e in db.scalars(q.order_by(Entity.score.desc(), Entity.id)):
        d = svc.entity_dict(e)
        out.append(analysis.member_summary(d) | {"brand_id": e.brand_id, "state_code": e.state_code, "sample": e.source == "sample"})
    return out


@router.get("/{eid}", response_model=S.EntityDetail)
def get_entity(eid: int, db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    d = svc.entity_detail(db, eid)
    if not d:
        raise HTTPException(404, "Entity not found")
    return d


@router.post("/{eid}/action", response_model=S.EntityActionOut)
def entity_action(eid: int, body: S.EntityActionIn, db: Session = Depends(get_db), user: User = Depends(analyst_user)):
    """confirm | dismiss | reopen. Dismissed entities leave clustering, so the analysis is re-run."""
    e = db.get(Entity, eid)
    if not e:
        raise HTTPException(404, "Entity not found")
    if e.status == "reported" and body.action != "reopen":
        raise HTTPException(409, "This entity was already reported through an approved report")
    old = e.status
    e.status = NEW_STATUS[body.action]
    db.commit()
    svc.run_analysis(db, e.brand_id, user)
    write_audit(db, user, f"entity {body.action}", f"{e.type}:{e.key}", f"{old} -> {e.status}")
    db.refresh(e)
    return S.EntityActionOut(ok=True, id=e.id, status=e.status, campaigns=svc.campaign_ids(db, e.brand_id))
