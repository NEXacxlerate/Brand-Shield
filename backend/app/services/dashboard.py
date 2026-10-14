"""Dashboard aggregates. Every number is computed from stored rows: nothing is hard-coded."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config.time import as_utc
from app.models import Brand, Detection
from app.services.detections import ALL_TYPES, OPEN_STATUSES, TYPES, WEB_TYPES, summary_row


def _percentages(counts: dict[str, int]) -> dict[str, int]:
    """Whole-number percentages that add up to 100 (largest remainder)."""
    total = sum(counts.values())
    if total == 0:
        return {k: 0 for k in counts}
    raw = {k: v * 100 / total for k, v in counts.items()}
    out = {k: int(r) for k, r in raw.items()}
    for k in sorted(counts, key=lambda k: raw[k] - out[k], reverse=True)[: 100 - sum(out.values())]:
        out[k] += 1
    return out


def _count_by(rows, attr: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for r in rows:
        k = getattr(r, attr)
        out[k] = out.get(k, 0) + 1
    return out


def kpi(rows, now: datetime, days: int = 7) -> dict:
    """Counts, last-week delta and a daily trend, computed in memory from the lightweight rows (one query serves every KPI)."""
    found = [as_utc(r.found_at) for r in rows]
    since = now - timedelta(days=days)
    trend = []
    for i in range(days - 1, -1, -1):
        end = (now - timedelta(days=i)).replace(hour=23, minute=59, second=59, microsecond=0)
        trend.append(sum(1 for f in found if f <= end))
    return {"value": len(rows), "delta_week": sum(1 for f in found if f >= since), "trend": trend}


def build(db: Session, brand: Brand, mode: str, now: datetime) -> dict:
    """Two queries instead of ~60: the database is often far away, so every round trip counts."""
    now = as_utc(now)
    light = db.execute(
        select(Detection.id, Detection.type, Detection.category, Detection.platform, Detection.status, Detection.band, Detection.severity,
               Detection.score, Detection.found_at).where(Detection.brand_id == brand.id, Detection.source == mode)
    ).all()
    open_rows = [r for r in light if r.status in OPEN_STATUSES]
    visible = [r for r in light if r.status in (*OPEN_STATUSES, "dismissed")]

    by_type = _count_by(open_rows, "type")
    type_counts = {t: by_type.get(t, 0) for t in ALL_TYPES}
    pct = _percentages(type_counts)
    by_platform = sorted(_count_by(open_rows, "platform").items(), key=lambda kv: (-kv[1], kv[0]))
    by_status = _count_by(visible, "status")
    by_band = _count_by(open_rows, "band")
    by_severity = _count_by(open_rows, "severity")
    needs_ids = [r.id for r in sorted((r for r in light if r.status in ("new", "reviewing")), key=lambda r: (-r.score, -r.id))[:5]]
    recent_ids = [r.id for r in sorted(open_rows, key=lambda r: (as_utc(r.found_at), r.id), reverse=True)[:6]]
    top_id = min(open_rows, key=lambda r: (-r.score, -r.id)).id if open_rows else None
    wanted = set(needs_ids) | set(recent_ids) | ({top_id} if top_id else set())
    full = {d.id: d for d in db.scalars(select(Detection).where(Detection.id.in_(wanted)))} if wanted else {}
    needs = [full[i] for i in needs_ids]
    recent = [full[i] for i in recent_ids]
    top = full.get(top_id) if top_id else None
    total_open = sum(type_counts.values())
    sample_rows = len(visible) if mode == "sample" else 0
    return {
        "brand": {"id": brand.id, "name": brand.name},
        "data_mode": mode,
        "is_sample": mode == "sample",
        "includes_sample": sample_rows > 0,
        "kpis": {
            "total_detections": kpi(open_rows, now),
            "social_impersonations": kpi([r for r in open_rows if r.category == "social"], now),
            "suspicious_apps": kpi([r for r in open_rows if r.category == "apps"], now),
            "web_threats": kpi([r for r in open_rows if r.category == "web"], now),
            "official_assets": {"value": len(brand.accounts) + len(brand.apps)},
        },
        "counts": {
            "by_status": {s: by_status.get(s, 0) for s in ("new", "reviewing", "confirmed", "dismissed")},
            "by_band": {b: by_band.get(b, 0) for b in ("high", "medium", "low")},
            "by_severity": {sv: by_severity.get(sv, 0) for sv in ("LOW", "MEDIUM", "HIGH", "CRITICAL")},
            "by_type": type_counts,
            "by_category": {
                "social": sum(n for t, n in type_counts.items() if t in TYPES and t != "fake_app"),
                "apps": type_counts["fake_app"],
                "web": sum(type_counts[t] for t in WEB_TYPES),
            },
            "cleared": sum(1 for r in light if r.status == "cleared"),
        },
        # the web type is listed only once something was found, so a workspace without web findings looks exactly as before
        "by_type": [{"type": t, "count": type_counts[t], "percent": pct[t]}
                    for t in sorted(ALL_TYPES, key=lambda t: (-type_counts[t], t)) if t in TYPES or type_counts[t] > 0],
        "by_platform": [{"platform": p, "count": n} for p, n in by_platform],
        "total_open": total_open,
        "needs_review": [
            {"id": d.id, "name": d.handle and summary_row(d)["handle"] or d.name, "platform": d.platform, "type": d.type,
             "found_at": summary_row(d)["found_at"], "risk_band": d.band, "score": d.score}
            for d in needs
        ],
        "recent": [
            {"id": d.id, "name": summary_row(d)["handle"] or d.name, "summary": (d.details or {}).get("summary", ""), "platform": d.platform,
             "type": d.type, "score": d.score, "status": d.status, "found_at": summary_row(d)["found_at"], "source": d.source}
            for d in recent
        ],
        "top_detection": None if top is None else {
            "id": top.id, "name": summary_row(top)["handle"] or top.name, "platform": top.platform, "score": top.score, "risk_band": top.band,
            "on_allowlist": False, "tags": (top.details or {}).get("tags", []), "source": top.source,
        },
        "why_flagged": None if top is None else {
            "detection_id": top.id, "score": top.score,
            "reasons": [{"signal": r["signal"], "label": r.get("label"), "detail": r.get("detail"), "points": r["points"]} for r in (top.reasons or [])],
        },
    }
