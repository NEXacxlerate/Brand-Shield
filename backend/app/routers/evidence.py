from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas as S
from ..config import settings
from ..db import get_db
from ..models import Entity, Evidence, Investigation, User
from ..security import analyst_user, limiter, viewer_user
from ..services import evidence_service as es
from ..services.common import write_audit

router = APIRouter(prefix="/api/evidence", tags=["evidence"])


@router.get("", response_model=list[S.EvidenceOut])
def list_evidence(case: str | None = None, type: str | None = None, campaign_id: int | None = None, db: Session = Depends(get_db),
                  user: User = Depends(viewer_user)):
    q = select(Evidence).order_by(Evidence.captured_at.desc(), Evidence.id.desc())
    if case:
        q = q.where(Evidence.investigation_id == case)
    if type:
        q = q.where(Evidence.kind == type)
    if campaign_id:
        q = q.where(Evidence.campaign_id == campaign_id)
    return [es.to_dict(db, e) for e in db.scalars(q)]


@router.post("", response_model=S.EvidenceOut, status_code=201)
@limiter.limit("10/minute")
async def upload_evidence(request: Request, file: UploadFile = File(...), case: str | None = Form(None), campaign_id: int | None = Form(None),
                          entity_id: int | None = Form(None), kind: str = Form("file"), source: str = Form("user"),
                          db: Session = Depends(get_db), user: User = Depends(analyst_user)):
    if case and not db.get(Investigation, case):
        raise HTTPException(404, "Case not found")
    if entity_id and not db.get(Entity, entity_id):
        raise HTTPException(404, "Entity not found")
    raw = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    try:
        ev = es.store(db, user, raw, file.filename or "upload", kind=kind, investigation_id=case, campaign_id=campaign_id, entity_id=entity_id, source=source)
    except es.UploadError as ex:
        raise HTTPException(400, str(ex))
    write_audit(db, user, "evidence uploaded", f"evidence {ev.id}", f"{ev.filename} sha256={ev.sha256[:16]}")
    return es.to_dict(db, ev)


@router.get("/{eid}/download")
def download_evidence(eid: int, db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    ev = db.get(Evidence, eid)
    if not ev or not Path(ev.path).exists():
        raise HTTPException(404, "Evidence not found")
    if not es.verify_integrity(ev):
        raise HTTPException(409, "Integrity check failed: the stored file no longer matches its SHA-256")
    es.record_download(db, ev, user)
    write_audit(db, user, "evidence downloaded", f"evidence {ev.id}")
    # always an attachment with a fixed type: the browser never renders uploaded content
    return FileResponse(ev.path, media_type="application/octet-stream", filename=ev.filename,
                        headers={"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'"})
