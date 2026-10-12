"""Scan orchestration.

Connectors turn a source into entities. Swap SampleConnector for an official-API or partner-feed connector
without touching detection or clustering. Website discovery can also run live (DNS, RDAP, crt.sh, page fetch).
"""
import threading
import time
import uuid
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal
from ..engine import live, seed_data
from ..engine.ids import is_official_domain
from ..models import Brand, Entity, Job, utcnow
from . import analysis_service, integrations
from .common import write_audit


class SampleConnector:
    """Reads the synthetic dataset (demo brand only). A real connector would call an official API or a licensed feed."""
    label = "sample data"

    def social(self, brand):
        if not brand.get("demo"):
            return []
        return [("social", d["platform"], f"{d['platform']}:{d['handle'].lower()}", d, d.get("created_days_ago")) for d in seed_data.SOCIAL]

    def websites(self, brand):
        if not brand.get("demo"):
            return []
        return [("website", "web", d["domain"].lower(), d, d.get("registered_days_ago")) for d in seed_data.WEBSITES]

    def apps(self, brand):
        if not brand.get("demo"):
            return []
        return [("app", "android", d["package"], d, d.get("released_days_ago")) for d in seed_data.APPS]


def is_official(typ, platform, key, data, brand):
    if typ == "social":
        return brand.get("handles", {}).get(platform, "").lower() == data.get("handle", "").lower()
    if typ == "website":
        return is_official_domain(key, brand)
    return key in brand.get("app_ids", [])


def upsert_entity(db: Session, brand_id: int, typ: str, platform: str, key: str, data: dict, source: str, days, state_code=None):
    row = db.scalar(select(Entity).where(Entity.brand_id == brand_id, Entity.type == typ, Entity.key == key))
    if row:
        row.data = data
        return row, False
    first_seen = utcnow() - timedelta(days=days if days is not None else 0)
    row = Entity(brand_id=brand_id, type=typ, platform=platform, key=key, data=data, source=source, first_seen=first_seen, state_code=state_code)
    db.add(row)
    db.flush()
    return row, True


def ingest(db: Session, brand: dict, rows, source: str):
    new = skipped = 0
    for typ, platform, key, data, days in rows:
        if is_official(typ, platform, key, data, brand):
            skipped += 1
            continue
        state = seed_data.STATE_NOTES.get(data.get("handle") or data.get("domain") or data.get("package")) if source == "sample" else None
        _, created = upsert_entity(db, brand["id"], typ, platform, key, data, source, days, state)
        new += created
    db.commit()
    return new, skipped


def _step(db: Session, job: Job, label: str, detail: str, pct: int, pace: bool = True):
    job.steps = [*job.steps, {"name": label, "status": "done", "detail": detail}]
    job.progress, job.message = pct, label
    db.commit()
    if pace and settings.scan_pacing:
        time.sleep(settings.scan_pacing)


def run_scan(job_id: str, brand_id: int, mode: str, actor_id: int | None = None, pace: bool = True):
    """Runs in its own session (it is called from a worker thread)."""
    db = SessionLocal()
    job = db.get(Job, job_id)
    try:
        brow = db.get(Brand, brand_id)
        brand = analysis_service.brand_dict(brow)
        conn = SampleConnector()
        _step(db, job, "Reading the brand's digital twin",
              f"{len(brand['domains'])} domain(s), {len(brand['handles'])} handle(s), {len(brand['app_ids'])} app(s), logo fingerprint", 8, pace)
        n, skip = ingest(db, brand, conn.social(brand), "sample")
        _step(db, job, "Social profiles (sample connector)", f"{n} new profiles, {skip} official account(s) allow-listed", 28, pace)
        n, _ = ingest(db, brand, conn.websites(brand), "sample")
        detail = f"{n} new sample sites"
        if mode == "live":
            if integrations.is_enabled(db, "dns"):
                def prog(done, total, found):
                    job.progress = 30 + int(30 * done / max(1, total))
                    job.message = f"Checking look-alike domains: {done}/{total} ({found} live)"
                    db.commit()
                found, tried = live.live_scan(brand, prog, enrich=integrations.is_enabled(db, "rdap"))
                for d in found:
                    integrations.enrich_website(db, d)
                rows = [("website", "web", d["domain"], d, d.get("registered_days_ago")) for d in found]
                ln, _ = ingest(db, brand, rows, "live")
                detail += f"; live DNS check of {tried} generated look-alikes found {len(found)} registered ({ln} new)"
            else:
                detail += "; live domain checks are switched off in Integrations"
        _step(db, job, "Websites", detail, 62, pace)
        n, skip = ingest(db, brand, conn.apps(brand), "sample")
        _step(db, job, "Mobile apps", f"{n} new apps, {skip} official app(s) allow-listed", 78, pace)
        res = analysis_service.run_analysis(db, brand_id, actor_id)
        _step(db, job, "Linking evidence into a threat graph", f"{res['suspects']} suspects, {res['campaigns']} campaign(s) found", 100, False)
        write_audit(db, actor_id, "scan", brand["name"], f"mode={mode} suspects={res['suspects']} campaigns={res['campaigns']}")
        job.state, job.result = "done", res
        db.commit()
    except Exception as ex:  # surface the failure to the UI instead of dying silently
        db.rollback()
        job = db.get(Job, job_id)
        job.state, job.message = "error", f"Scan failed: {ex}"[:300]
        db.commit()
    finally:
        db.close()


def start_scan(db: Session, brand_id: int, mode: str, actor_id: int | None, background: bool = True) -> str:
    jid = uuid.uuid4().hex[:12]
    db.add(Job(id=jid, kind=f"scan:{mode}", state="running", progress=2, message="Starting", steps=[]))
    db.commit()
    if background:
        threading.Thread(target=run_scan, args=(jid, brand_id, mode, actor_id), daemon=True).start()
    else:
        run_scan(jid, brand_id, mode, actor_id, pace=False)
    return jid
