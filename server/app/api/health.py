import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db

router = APIRouter()
log = logging.getLogger("app.health")
VERSION = "0.1.0"


@router.get("/health")
@router.get("/api/health")
def health(db: Session = Depends(get_db)) -> JSONResponse:
    try:
        db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception as exc:  # noqa: BLE001
        log.warning("health: database check failed (%s)", type(exc).__name__)
        db_status = "down"
    ok = db_status == "ok"
    return JSONResponse(
        {"status": "ok" if ok else "degraded", "version": VERSION, "database": {"status": db_status}},
        status_code=200 if ok else 503,
    )
