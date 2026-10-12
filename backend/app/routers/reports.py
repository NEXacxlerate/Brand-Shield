from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas as S
from ..db import get_db
from ..models import Investigation, Report, User
from ..security import analyst_user, viewer_user
from ..services import report_service
from ..services.common import iso, write_audit
from ._common import user_name

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _out(db: Session, r: Report) -> S.ReportOut:
    sample = False
    if r.campaign_id:
        from ..services import analysis_service as svc
        c = svc.get_campaign(db, r.campaign_id, full=False)
        sample = bool(c and c["sample"])
    return S.ReportOut(id=r.id, code=r.code, title=r.title, scope=r.scope, status=r.status, format=r.format, campaign_id=r.campaign_id,
                       investigation_id=r.investigation_id, approved_by=user_name(db, r.approved_by), approved_at=iso(r.approved_at),
                       created_at=iso(r.created_at), sample=sample)


def _get(db: Session, rid: int) -> Report:
    r = db.get(Report, rid)
    if not r:
        raise HTTPException(404, "Report not found")
    return r


@router.get("", response_model=list[S.ReportOut])
def list_reports(db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    return [_out(db, r) for r in db.scalars(select(Report).order_by(Report.created_at.desc(), Report.id.desc()))]


@router.post("", response_model=S.ReportOut, status_code=201)
def create_report(body: S.ReportCreate, db: Session = Depends(get_db), user: User = Depends(analyst_user)):
    if bool(body.campaign_id) == bool(body.investigation_id):
        raise HTTPException(422, "Give exactly one of campaign_id or investigation_id")
    try:
        rep = report_service.create_report(db, user, body.campaign_id, body.investigation_id, body.format, body.scope)
    except report_service.ReportError as ex:
        raise HTTPException(400, str(ex))
    write_audit(db, user, "report created", rep.code, f"format={rep.format} scope={rep.scope} (draft: not approved)")
    return _out(db, rep)


@router.get("/{rid}", response_model=S.ReportOut)
def get_report(rid: int, db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    return _out(db, _get(db, rid))


@router.get("/{rid}/preview", response_class=HTMLResponse)
def preview(rid: int, db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    html = report_service.render_html(db, _get(db, rid))
    if html is None:
        raise HTTPException(404, "Nothing to preview")
    return HTMLResponse(html)


@router.get("/{rid}/download")
def download(rid: int, db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    rep = _get(db, rid)
    if not rep.file_path or not Path(rep.file_path).exists():
        try:
            report_service.write_file(db, rep)
            if rep.status == "draft":
                rep.status = "ready"
            db.commit()
        except report_service.ReportError as ex:
            raise HTTPException(503, str(ex))
    write_audit(db, user, "report downloaded", rep.code)
    media = "application/pdf" if rep.format == "pdf" else "application/json"
    return FileResponse(rep.file_path, media_type=media, filename=f"{rep.code}.{rep.format}", headers={"X-Content-Type-Options": "nosniff"})


@router.post("/{rid}/approve", response_model=S.ApproveOut)
def approve(rid: int, body: S.ApproveIn, db: Session = Depends(get_db), user: User = Depends(analyst_user)):
    """Human approval. Role analyst or admin only; approved_by comes from the JWT. Only this call marks entities 'reported'."""
    rep = _get(db, rid)
    if rep.status == "approved":
        raise HTTPException(409, "This report is already approved")
    marked = report_service.approve_report(db, user, rep, body.scope)
    return S.ApproveOut(ok=True, report=_out(db, rep), marked_reported=marked)
