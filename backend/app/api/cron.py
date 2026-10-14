"""Vercel Cron entry point: GET /api/cron/scan.

Vercel Cron calls this path with `Authorization: Bearer <CRON_SECRET>` (docs/DEPLOY_VERCEL.md). It is inert unless CRON_SECRET is set
(503), and any other caller gets 401. It reuses the in-process scheduler's decision (app/services/scheduler.py: interval, credit-aware
stretching, "already running", "no official assets yet") and, when a scan is due, runs one inline scan with started_by "scheduler".
"""

import hmac
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select

from app.api.common import get_ctx
from app.config.time import utcnow
from app.core.pipeline.scan_pipeline import ScanContext
from app.models import Scan
from app.services.scheduler import scheduler_tick

router = APIRouter(prefix="/cron")

# Vercel Hobby may fire a daily cron anywhere inside the scheduled hour, so "24 h since the last scan" could be missed by minutes and
# then wait a whole extra day. The decision therefore looks this far ahead (no effect on what the scan itself records).
CRON_SLACK = timedelta(minutes=60)


def _authorized(request: Request, secret: str) -> bool:
    header = request.headers.get("authorization") or ""
    return hmac.compare_digest(header.encode("utf-8"), f"Bearer {secret}".encode())


@router.get("/scan")
def cron_scan(request: Request, ctx: ScanContext = Depends(get_ctx)) -> dict:
    secret = ctx.settings.cron_secret.get_secret_value() if ctx.settings.cron_secret else ""
    if not secret:
        raise HTTPException(503, "Scheduled scans via cron are not configured (set CRON_SECRET).")
    if not _authorized(request, secret):
        raise HTTPException(401, "Invalid cron credentials", headers={"WWW-Authenticate": "Bearer"})
    with ctx.session_factory() as db:
        before = db.scalar(select(func.max(Scan.id))) or 0
    decision = scheduler_tick(ctx, utcnow() + CRON_SLACK)  # never raises; an inline scan has finished when this returns
    with ctx.session_factory() as db:
        after = db.scalar(select(func.max(Scan.id))) or 0
    ran = decision.run and after > before
    reason = decision.reason if ran or not decision.run else "A scan was due but could not be started (one is already running, or there is no brand)."
    return {"ran": ran, "skipped": not ran, "reason": reason, "scan_id": after if ran else None}
