from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .. import schemas as S
from ..db import get_db
from ..engine import explain
from ..models import Entity, User
from ..security import analyst_user, viewer_user
from ..services import analysis_service as svc, report_service
from ..services.common import write_audit
from ._common import resolve_brand

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


def _or_404(x):
    if x is None:
        raise HTTPException(404, "Campaign not found")
    return x


@router.get("", response_model=list[S.CampaignOut])
def list_campaigns(brand_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    return svc.list_campaigns(db, resolve_brand(db, brand_id).id)


@router.get("/{cid}", response_model=S.CampaignDetail)
def get_campaign(cid: int, db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    c = _or_404(svc.get_campaign(db, cid, full=True))
    brand = svc.brand_dict(resolve_brand(db, c["brand_id"]))
    c["summary"] = explain.campaign_summary(c, brand)
    c["recommended_actions"] = explain.recommended_actions(c, c["members"])
    c["timeline"] = c["timeline"]
    return c


@router.get("/{cid}/graph", response_model=S.GraphOut)
def get_graph(cid: int, db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    return _or_404(svc.campaign_graph(db, cid))


@router.get("/{cid}/evolution", response_model=S.EvolutionOut)
def get_evolution(cid: int, db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    return _or_404(svc.campaign_evolution(db, cid))


@router.get("/{cid}/dna", response_model=S.DnaOut)
def get_dna(cid: int, db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    return _or_404(svc.campaign_dna(db, cid))


@router.get("/{cid}/report", response_class=HTMLResponse)
def campaign_report_preview(cid: int, scope: str = "all", db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    """The on-screen dossier preview (the PDF is rendered from this same HTML)."""
    return HTMLResponse(_or_404(report_service.campaign_dossier_html(db, cid, scope)))


@router.post("/{cid}/confirm", response_model=S.ConfirmOut)
def confirm_campaign(cid: int, db: Session = Depends(get_db), user: User = Depends(analyst_user)):
    """Learning loop: confirm the campaign, add its wording to the knowledge base, then re-run the analysis."""
    members = svc._members(db, cid)
    if not members:
        raise HTTPException(404, "Campaign not found")
    brand_id = members[0]["brand_id"]
    for m in members:
        e = db.get(Entity, m["id"])
        if e.status == "new":
            e.status = "confirmed"
    db.commit()
    learned = svc.learn_campaign(db, cid)
    summary = svc.run_analysis(db, brand_id, user)
    write_audit(db, user, "campaign confirm", f"C-{cid}", f"wording added to knowledge base; re-analysed: {summary}")
    return S.ConfirmOut(ok=True, campaign_id=cid, learned=learned, campaigns=summary["campaigns"])
