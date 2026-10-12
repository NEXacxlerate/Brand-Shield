"""Background jobs (APScheduler): watchlist checks every 15 minutes, nightly re-analysis and aggregate refresh."""
import logging

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import select

from .db import session_scope
from .models import Brand
from .security import purge_revoked
from .services import analysis_service, dashboard_service, watch_service
from .services.common import write_audit

log = logging.getLogger("scammind.jobs")
scheduler: BackgroundScheduler | None = None


def watchlist_job() -> int:
    with session_scope() as db:
        n = watch_service.check_all(db)
        write_audit(db, None, "watchlist check", f"{n} item(s) checked")
        return n


def nightly_job() -> dict:
    """Re-run analyze() per brand (records stage changes in stage_history), then refresh the dashboard aggregates."""
    out = {}
    with session_scope() as db:
        for b in db.scalars(select(Brand)).all():
            try:
                out[b.name] = analysis_service.run_analysis(db, b.id)
            except Exception as ex:           # one brand failing must not stop the others
                db.rollback()
                log.exception("nightly analysis failed for %s", b.name)
                out[b.name] = {"error": str(ex)}
        rows = dashboard_service.refresh_aggregates(db)
        purge_revoked(db)
        write_audit(db, None, "nightly job", f"analysed {len(out)} brand(s); {rows} aggregate row(s) refreshed")
    return out


def start_scheduler():
    global scheduler
    if scheduler:
        return scheduler
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(watchlist_job, "interval", minutes=15, id="watchlist", max_instances=1, coalesce=True)
    scheduler.add_job(nightly_job, "cron", hour=2, minute=0, id="nightly", max_instances=1, coalesce=True)
    scheduler.start()
    return scheduler


def stop_scheduler():
    global scheduler
    if scheduler:
        scheduler.shutdown(wait=False)
        scheduler = None
