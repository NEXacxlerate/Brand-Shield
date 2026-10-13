from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

# pyrefly: ignore [missing-import]
from .. import schemas as S
from ..config import settings
from ..db import get_db
from ..models import Investigation, User
from ..security import analyst_user, limiter
from ..services import apk_service, evidence_service, investigation_service as isvc
from ..services.common import write_audit
from ._common import resolve_brand

router = APIRouter(prefix="/api/apps", tags=["apps"])


@router.post("/analyze", response_model=S.AppAnalysisOut)
@limiter.limit("10/minute")
async def analyze_app(request: Request, db: Session = Depends(get_db), user: User = Depends(analyst_user)):
    """Multipart with an APK (up to 100 MB), or JSON app metadata. The APK is parsed, never executed."""
    ctype = request.headers.get("content-type", "")
    evidence_id = None
    if ctype.startswith("multipart/"):
        form = await request.form()
        up = form.get("file")
        if up is None or not hasattr(up, "read"):
            raise HTTPException(422, "Attach the APK as the `file` field")
        raw = await up.read(settings.max_apk_mb * 1024 * 1024 + 1)
        brand = resolve_brand(db, int(form["brand_id"]) if form.get("brand_id") else None)
        try:
            data = apk_service.parse_apk(raw)
        except apk_service.ApkError as ex:
            raise HTTPException(400, str(ex))
        res = apk_service.score_app(db, brand, data)
        ev = evidence_service.store(db, user, raw, up.filename or f"{data['package']}.apk", kind="apk", source="upload")
        evidence_id = ev.id
        target = f"{data['package']} (sha256 {data['sha256'][:12]})"
    else:
        try:
            meta = S.AppMetadataIn.model_validate(await request.json())
        except Exception as ex:
            raise HTTPException(422, f"Invalid app metadata: {ex}")
        brand = resolve_brand(db, meta.brand_id)
        data = meta.model_dump(exclude={"brand_id"})
        data["permissions"] = [p.split(".")[-1] for p in data["permissions"]]
        res = apk_service.score_app(db, brand, data)
        target = meta.package
    run = isvc.investigate(db, brand, "app", data["package"], "quick", app_result=res)
    inv = Investigation(id=isvc.new_id(db), brand_id=brand.id, input_type="app", input_value=data["package"], depth="quick", status="open",
                        risk_score=res["score"], result=run["result"], created_by=user.id)
    db.add(inv)
    db.commit()
    if evidence_id:
        ev.investigation_id = inv.id
        db.commit()
    write_audit(db, user, "app analysed", inv.id, target)
    return S.AppAnalysisOut(verdict=S.AppVerdict(**res["verdict"]), official=S.AppProfile(**res["official"]), app=S.AppProfile(**res["app"]),
                            icon_similarity=res["icon_similarity"], indicators=[S.AppIndicator(**i) for i in res["indicators"]],
                            permissions=[S.AppPermission(**p) for p in res["permissions"]], urls=[S.AppUrl(**u) for u in res["urls"]],
                            evidence_id=evidence_id, investigation_id=inv.id)
