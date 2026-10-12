from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import schemas as S
from ..db import get_db
from ..models import Job, User
from ..security import analyst_user, limiter, viewer_user
from ..services import scan_service
from ..services.common import write_audit
from ._common import resolve_brand

router = APIRouter(prefix="/api", tags=["scan"])


@router.post("/scan", response_model=S.JobCreated, status_code=202)
@limiter.limit("10/minute")
def start_scan(request: Request, body: S.ScanIn, db: Session = Depends(get_db), user: User = Depends(analyst_user)):
    b = resolve_brand(db, body.brand_id)
    jid = scan_service.start_scan(db, b.id, body.mode, user.id)
    write_audit(db, user, "scan started", b.name, f"mode={body.mode} job={jid}")
    return S.JobCreated(job_id=jid)


@router.get("/jobs/{job_id}", response_model=S.JobOut)
def get_job(job_id: str, db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    j = db.get(Job, job_id)
    if not j:
        raise HTTPException(404, "Unknown job")
    return S.JobOut(id=j.id, kind=j.kind, state=j.state, progress=j.progress, message=j.message, steps=[S.Step(**s) for s in j.steps or []], result=j.result)
