import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas as S
from ..db import get_db
from ..engine import evolution
from ..models import User
from ..security import viewer_user
from ..services import analysis_service as svc

router = APIRouter(prefix="/api", tags=["simulator"])


@router.post("/simulator", response_model=S.SimOut)
def simulate(body: S.SimIn, db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    """Read-only what-if projection (no data is written), so any signed-in role may run it."""
    members = svc._members(db, body.campaign_id)
    if not members:
        raise HTTPException(404, "Campaign not found")
    out = evolution.simulate(members, time.time(), body.horizon_days, body.assumption, body.assumed_drop_pct)
    return S.SimOut(**out, actions=body.actions, campaign_id=body.campaign_id)
