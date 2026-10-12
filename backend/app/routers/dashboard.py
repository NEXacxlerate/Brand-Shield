from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import schemas as S
from ..db import get_db
from ..models import User
from ..security import viewer_user
from ..services import dashboard_service
from ._common import resolve_brand

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard", response_model=S.DashboardOut)
def get_dashboard(brand_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    b = resolve_brand(db, brand_id)
    return dashboard_service.dashboard(db, b.id)
