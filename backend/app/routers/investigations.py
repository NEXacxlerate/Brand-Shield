import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import schemas as S
from ..config import settings
from ..db import get_db
from ..models import Evidence, Investigation, Note, User, utcnow
from ..security import analyst_user, limiter, viewer_user
from ..services import apk_service, evidence_service, investigation_service as isvc
from ..services.common import iso, verdict_label, write_audit
from ._common import paginate, resolve_brand, user_name

router = APIRouter(prefix="/api/investigations", tags=["investigations"])
PAGE_SIZE = 20


def _row(db: Session, i: Investigation) -> S.InvestigationRow:
    return S.InvestigationRow(id=i.id, input=i.input_value[:160], type=isvc.TYPE_LABEL.get(i.input_type, i.input_type.title()),
                              result=(i.result or {}).get("headline", ""), risk=round(i.risk_score), status=verdict_label(i.risk_score),
                              lifecycle=i.status, assigned_to=user_name(db, i.assigned_to), created_at=iso(i.created_at), sample=i.is_sample)


def _detail(db: Session, i: Investigation) -> S.InvestigationDetail:
    r = i.result or {}
    notes = [S.NoteOut(id=n.id, author=user_name(db, n.author_id), text=n.text, created_at=iso(n.created_at))
             for n in db.scalars(select(Note).where(Note.investigation_id == i.id).order_by(Note.created_at.desc()))]
    ev = db.scalar(select(func.count(Evidence.id)).where(Evidence.investigation_id == i.id)) or 0
    risk = r.get("risk") or {"score": i.risk_score, "severity": "low", "label": "Low risk"}
    return S.InvestigationDetail(
        id=i.id, input=i.input_value, type=isvc.TYPE_LABEL.get(i.input_type, i.input_type), depth=i.depth, lifecycle=i.status,
        assigned_to=user_name(db, i.assigned_to), risk=S.Risk(**risk), classification=[S.ClassRow(**c) for c in r.get("classification", [])],
        findings=r.get("findings", []), summary=S.SummaryOut(**(r.get("summary") or {"text": "", "source": "rules"})),
        related=[S.RelatedRow(**x) for x in r.get("related", [])], actions=[S.ActionRow(**a) for a in r.get("actions", [])], notes=notes,
        evidence_count=ev, steps=[S.Step(**s) for s in r.get("steps", [])], method=r.get("method", ""), campaign_id=r.get("campaign_id"),
        created_at=iso(i.created_at), sample=i.is_sample)


@router.post("", response_model=S.InvestigationCreated, status_code=201)
@limiter.limit("30/minute")
async def create_investigation(request: Request, db: Session = Depends(get_db), user: User = Depends(analyst_user)):
    """JSON {type, value, depth, brand_id} or multipart (same fields plus a `file`)."""
    ctype = request.headers.get("content-type", "")
    file_bytes, filename = None, None
    if ctype.startswith("multipart/"):
        form = await request.form()
        payload = {k: form.get(k) for k in ("type", "value", "depth", "brand_id", "state_code") if form.get(k) not in (None, "")}
        up = form.get("file")
        if up is not None and hasattr(up, "read"):
            file_bytes = await up.read(settings.max_apk_mb * 1024 * 1024 + 1)
            filename = up.filename
    else:
        try:
            payload = await request.json()
        except Exception:
            raise HTTPException(422, "Send JSON or multipart form data")
    try:
        body = S.InvestigationCreate.model_validate({**payload, "brand_id": int(payload["brand_id"]) if payload.get("brand_id") else None})
    except Exception as ex:
        raise HTTPException(422, f"Invalid request: {getattr(ex, 'errors', lambda: str(ex))()}" if hasattr(ex, "errors") else str(ex))
    if not body.value.strip() and not file_bytes:
        raise HTTPException(422, "Give a value to investigate, or upload a file")
    brand = resolve_brand(db, body.brand_id)
    itype = isvc.TYPE_ALIASES.get(body.type, "identifier")
    app_result, image_bytes, ev = None, None, None
    value = body.value.strip()
    if file_bytes:
        try:
            if itype == "app":
                if len(file_bytes) > settings.max_apk_mb * 1024 * 1024:
                    raise apk_service.ApkError(f"APK is larger than {settings.max_apk_mb} MB")
                parsed = apk_service.parse_apk(file_bytes)
                app_result = apk_service.score_app(db, brand, parsed)
                value = value or parsed["package"]
            else:
                ev_probe = evidence_service.detect_mime(file_bytes)
                if itype == "image":
                    if not (ev_probe or "").startswith("image/"):
                        raise evidence_service.UploadError("That file is not an image")
                    image_bytes = file_bytes
                elif itype == "text" and (ev_probe or "").startswith("text/") and not value:
                    value = file_bytes.decode("utf-8", "ignore")[:5000]
        except (apk_service.ApkError, evidence_service.UploadError) as ex:
            raise HTTPException(400, str(ex))
    if itype == "image" and not value:
        value = filename or "uploaded image"
    run = isvc.investigate(db, brand, itype, value, body.depth, image_bytes=image_bytes, app_result=app_result)
    inv = Investigation(id=isvc.new_id(db), brand_id=brand.id, input_type=itype, input_value=value[:5000], depth=body.depth, status="open",
                        risk_score=run["risk_score"], state_code=(body.state_code or run["state_code"]), result=run["result"], created_by=user.id)
    db.add(inv)
    db.commit()
    if file_bytes:
        try:
            ev = evidence_service.store(db, user, file_bytes, filename or "upload", kind="apk" if itype == "app" else itype, investigation_id=inv.id)
            run["steps"].append({"name": "Store evidence", "status": "done", "detail": f"SHA-256 {ev.sha256[:16]}..., chain of custody started"})
            inv.result = {**inv.result, "steps": run["steps"]}
            db.commit()
        except evidence_service.UploadError as ex:
            run["steps"].append({"name": "Store evidence", "status": "skipped", "detail": str(ex)})
    write_audit(db, user, "investigation created", inv.id, f"{itype}: {value[:120]}")
    return S.InvestigationCreated(id=inv.id, steps=[S.Step(**s) for s in run["steps"]], status=inv.status)


@router.get("", response_model=S.InvestigationPage)
def list_investigations(status: str | None = None, q: str | None = None, page: int = 1, brand_id: int | None = None,
                        db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    conds = isvc.list_filter(q, status)
    if brand_id:
        conds.append(Investigation.brand_id == brand_id)
    total = db.scalar(select(func.count(Investigation.id)).where(*conds)) or 0
    off, size = paginate(page, PAGE_SIZE)
    rows = db.scalars(select(Investigation).where(*conds).order_by(Investigation.created_at.desc(), Investigation.id.desc()).offset(off).limit(size)).all()
    return S.InvestigationPage(items=[_row(db, i) for i in rows], page=max(1, page), page_size=size, total=total)


@router.get("/{inv_id}", response_model=S.InvestigationDetail)
def get_investigation(inv_id: str, db: Session = Depends(get_db), user: User = Depends(viewer_user)):
    i = db.get(Investigation, inv_id)
    if not i:
        raise HTTPException(404, "Investigation not found")
    return _detail(db, i)


@router.patch("/{inv_id}", response_model=S.InvestigationDetail)
def patch_investigation(inv_id: str, body: S.InvestigationPatch, db: Session = Depends(get_db), user: User = Depends(analyst_user)):
    i = db.get(Investigation, inv_id)
    if not i:
        raise HTTPException(404, "Investigation not found")
    changes = []
    if body.status is not None and body.status != i.status:
        changes.append(f"status {i.status} -> {body.status}")
        i.status = body.status
    if "assigned_to" in body.model_fields_set:
        if body.assigned_to is not None and not db.get(User, body.assigned_to):
            raise HTTPException(404, "Assignee not found")
        changes.append(f"assigned_to {i.assigned_to} -> {body.assigned_to}")
        i.assigned_to = body.assigned_to
    i.updated_at = utcnow()
    db.commit()
    write_audit(db, user, "investigation updated", i.id, "; ".join(changes))
    return _detail(db, i)


@router.post("/{inv_id}/notes", response_model=S.NoteOut, status_code=201)
def add_note(inv_id: str, body: S.NoteIn, db: Session = Depends(get_db), user: User = Depends(analyst_user)):
    i = db.get(Investigation, inv_id)
    if not i:
        raise HTTPException(404, "Investigation not found")
    n = Note(investigation_id=i.id, author_id=user.id, text=body.text.strip())
    db.add(n)
    db.commit()
    write_audit(db, user, "note added", i.id, body.text[:100])
    return S.NoteOut(id=n.id, author=user.name, text=n.text, created_at=iso(n.created_at))
