"""Dashboard and Brand Monitor aggregates.

Dashboard numbers = seeded history (source=sample, flagged) + whatever real work has been added since
(entities not from the sample connector, investigations created by users). Nothing is invented at read time.
"""
from collections import Counter, defaultdict
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Alert, Audit, Entity, Investigation, Metric, Report, WatchItem, utcnow
from . import analysis_service as svc
from .common import ago, iso, verdict_label

STATE_NAMES = {"MH": "Maharashtra", "UP": "Uttar Pradesh", "DL": "Delhi", "KA": "Karnataka", "TN": "Tamil Nadu", "GJ": "Gujarat",
               "WB": "West Bengal", "RJ": "Rajasthan", "TS": "Telangana", "KL": "Kerala", "MP": "Madhya Pradesh", "BR": "Bihar",
               "HR": "Haryana", "PB": "Punjab"}
CATEGORY_DEF = [("cat_profiles", "Fake Profiles", "#FF5C5C"), ("cat_websites", "Phishing Websites", "#5AA9FF"),
                ("cat_apps", "Suspicious Apps", "#A855F7"), ("cat_impersonation", "Impersonation", "#FF9A4D"), ("cat_other", "Others", "#34D399")]
KPI_DEF = [("investigations", "Total Investigations", True), ("active_threats", "Active Threats", False),
           ("suspicious_apps", "Suspicious Apps", False), ("fake_profiles", "Fake Profiles Found", False)]
WEEK = timedelta(days=7)


def _latest_sample(db: Session, brand_id: int, key: str) -> float:
    v = db.scalar(select(Metric.value).where(Metric.brand_id == brand_id, Metric.key == key, Metric.source == "sample").order_by(Metric.day.desc()).limit(1))
    return float(v or 0)


def _live_entities(db: Session, brand_id: int, typ: str, min_score: float) -> int:
    return db.scalar(select(func.count(Entity.id)).where(Entity.brand_id == brand_id, Entity.source != "sample", Entity.type == typ,
                                                         Entity.score >= min_score, Entity.status != "dismissed")) or 0


def current_values(db: Session, brand_id: int) -> dict:
    live_threats = db.scalar(select(func.count(Entity.id)).where(Entity.brand_id == brand_id, Entity.source != "sample", Entity.score >= 60,
                                                                  Entity.status != "dismissed")) or 0
    return {
        "investigations": db.scalar(select(func.count(Investigation.id)).where(Investigation.brand_id == brand_id)) or 0,
        "active_threats": _latest_sample(db, brand_id, "active_threats") + live_threats,
        "suspicious_apps": _latest_sample(db, brand_id, "suspicious_apps") + _live_entities(db, brand_id, "app", 40),
        "fake_profiles": _latest_sample(db, brand_id, "fake_profiles") + _live_entities(db, brand_id, "social", 60),
    }


def _weekly_points(db: Session, brand_id: int, key: str, current: float, n: int = 7) -> list[float]:
    rows = db.execute(select(Metric.day, Metric.value).where(Metric.brand_id == brand_id, Metric.key == key).order_by(Metric.day)).all()
    by_day: dict = {}
    for d, v in rows:
        by_day[d] = v
    pts = [v for _, v in sorted(by_day.items())][-n:]
    if pts:
        pts[-1] = current
    return [round(p) for p in pts]


def _investigation_trend(db: Session, brand_id: int, n: int = 7) -> list[int]:
    now = utcnow()
    out = []
    for w in range(n - 1, -1, -1):
        cutoff = now - WEEK * w
        out.append(db.scalar(select(func.count(Investigation.id)).where(Investigation.brand_id == brand_id, Investigation.created_at <= cutoff)) or 0)
    return out


def _change(points: list[float]) -> float:
    """% change over the last 4 weekly steps."""
    if len(points) < 5 or not points[-5]:
        return 0.0
    return round((points[-1] - points[-5]) / points[-5] * 100, 1)


def kpis(db: Session, brand_id: int) -> list[dict]:
    cur = current_values(db, brand_id)
    out = []
    for key, label, good_if_up in KPI_DEF:
        trend = _investigation_trend(db, brand_id) if key == "investigations" else _weekly_points(db, brand_id, key, cur[key])
        ch = _change(trend)
        out.append({"key": key, "label": label, "value": int(cur[key]), "change_pct": ch, "trend": trend,
                    "good": (ch >= 0) if good_if_up else (ch <= 0)})
    return out


def states(db: Session, brand_id: int) -> list[dict]:
    now = utcnow()
    rows = db.execute(select(Investigation.state_code, func.count()).where(Investigation.brand_id == brand_id, Investigation.state_code.is_not(None))
                      .group_by(Investigation.state_code)).all()
    totals = {c: n for c, n in rows}
    if not totals:
        return []

    def window(code, a, b):
        return db.scalar(select(func.count()).where(Investigation.brand_id == brand_id, Investigation.state_code == code,
                                                    Investigation.created_at > now - timedelta(days=a), Investigation.created_at <= now - timedelta(days=b))) or 0
    top = sorted(totals.items(), key=lambda kv: -kv[1])[:5]
    peak = top[0][1]
    out = []
    for code, n in top:
        last, prev = window(code, 30, 0), window(code, 60, 30)
        ch = round((last - prev) / prev * 100, 1) if prev else 0.0
        share = n / peak
        out.append({"code": code, "name": STATE_NAMES.get(code, code), "threats": n, "change_pct": ch,
                    "level": "high" if share >= 0.70 else "medium" if share >= 0.58 else "low"})
    return out


def categories(db: Session, brand_id: int) -> list[dict]:
    counts = {k: _latest_sample(db, brand_id, k) for k, _, _ in CATEGORY_DEF}
    counts["cat_profiles"] += _live_entities(db, brand_id, "social", 60)
    counts["cat_websites"] += _live_entities(db, brand_id, "website", 60)
    counts["cat_apps"] += _live_entities(db, brand_id, "app", 40)
    total = sum(counts.values()) or 1
    return [{"label": label, "pct": round(counts[k] / total * 100), "color": color, "count": int(counts[k])} for k, label, color in CATEGORY_DEF]


def dashboard(db: Session, brand_id: int) -> dict:
    now = utcnow()
    camps = svc.list_campaigns(db, brand_id)
    alerts = db.scalars(select(Alert).where(Alert.brand_id == brand_id).order_by(Alert.created_at.desc()).limit(5)).all()
    recent = db.scalars(select(Investigation).where(Investigation.brand_id == brand_id).order_by(Investigation.created_at.desc()).limit(5)).all()
    summary = {"text": "No campaigns have been detected yet.", "source": "rules", "counts": {"social": 0, "websites": 0, "apps": 0, "phones": 0, "payment_ids": 0}}
    if camps:
        from ..engine import explain
        c = svc.get_campaign(db, camps[0]["id"], full=True)
        ids = [m["id"] for m in c["members"]]
        idents = svc.idents_for(db, ids)
        kinds = Counter(k for i in ids for k in {k for k, _ in idents[i]})
        vals = lambda kind: len({v for i in ids for k, v in idents[i] if k == kind})
        s = explain.campaign_summary(c, None)
        summary = {"text": s["text"], "source": s["source"], "campaign_id": c["id"],
                   "counts": {"social": c["counts"].get("social", 0), "websites": c["counts"].get("website", 0), "apps": c["counts"].get("app", 0),
                              "phones": vals("phone"), "payment_ids": vals("payment")}}
    return {
        "kpis": kpis(db, brand_id), "states": states(db, brand_id), "categories": categories(db, brand_id),
        "campaigns": [{"id": c["id"], "name": c["name"], "entities": c["size"], "risk": c["severity"], "sample": c["sample"]} for c in camps[:5]],
        "alerts": [{"id": a.id, "kind": a.kind, "title": a.title, "ago": ago(a.created_at, now), "severity": a.severity, "sample": a.is_sample} for a in alerts],
        "recent": [{"id": i.id, "input": i.input_value[:120], "type": _type_label(i.input_type), "result": (i.result or {}).get("headline", ""),
                    "risk": round(i.risk_score), "status": verdict_label(i.risk_score), "created_at": iso(i.created_at), "sample": i.is_sample} for i in recent],
        "ai_summary": summary,
    }


def _type_label(t: str) -> str:
    from .investigation_service import TYPE_LABEL
    return TYPE_LABEL.get(t, t.title())


# --------------------------------------------------------------- monitor ---

GRADES = [(20, "A"), (40, "B"), (60, "C"), (80, "D"), (101, "F")]


def grade_for(score: float) -> str:
    return next(letter for limit, letter in GRADES if score < limit)


def _sample_series(db: Session, brand_id: int, key: str, n: int = 12) -> list[float]:
    rows = db.execute(select(Metric.day, Metric.value).where(Metric.brand_id == brand_id, Metric.key == key, Metric.source == "sample").order_by(Metric.day)).all()
    return [v for _, v in rows][-n:]


def monitor(db: Session, brand_id: int) -> dict:
    now = utcnow()
    camps = svc.list_campaigns(db, brand_id)
    score = max([c["risk"] for c in camps], default=0)
    ents = db.scalars(select(Entity).where(Entity.brand_id == brand_id)).all()
    watch = {w.value: w for w in db.scalars(select(WatchItem).where(WatchItem.brand_id == brand_id))}

    def offline(e):
        w = watch.get(e.key)
        return bool(w and w.status == "offline")
    real = [e for e in ents if e.score >= 40 or e.status != "new"]
    awaiting = sum(1 for e in real if e.status == "new" and e.score >= 40)
    confirmed = sum(1 for e in ents if e.status == "confirmed")
    reported_all = [e for e in ents if e.status == "reported"]
    removed = sum(1 for e in reported_all if offline(e))
    in_progress = sum(1 for e in reported_all if not offline(e) and watch.get(e.key) and watch[e.key].status == "changed")
    reported = len(reported_all) - removed - in_progress
    dismissed = sum(1 for e in ents if e.status == "dismissed")
    takedown = [{"label": "Awaiting review", "count": awaiting}, {"label": "Confirmed", "count": confirmed}, {"label": "Reported", "count": reported},
                {"label": "In progress at platform", "count": in_progress}, {"label": "Removed by platform", "count": removed},
                {"label": "Dismissed as safe", "count": dismissed}]

    # weekly activity: seeded history + live entities / audit events in the same week
    weeks = [f"W{i}" for i in range(1, 13)]
    new = list(_sample_series(db, brand_id, "activity_new"))
    conf = list(_sample_series(db, brand_id, "activity_confirmed"))
    rep = list(_sample_series(db, brand_id, "activity_reported"))
    has_sample = bool(new)
    while len(new) < 12:
        new.insert(0, 0); conf.insert(0, 0); rep.insert(0, 0)
    for i in range(12):
        end = now - WEEK * (11 - i)
        start = end - WEEK
        new[i] += sum(1 for e in ents if e.source != "sample" and start < e.first_seen <= end)
        conf[i] += db.scalar(select(func.count(Audit.id)).where(Audit.action == "entity confirm", Audit.ts > start, Audit.ts <= end)) or 0
        rep[i] += db.scalar(select(func.count(Audit.id)).where(Audit.action == "approved takedown report", Audit.ts > start, Audit.ts <= end)) or 0

    live_ents = [e for e in ents if e.status != "dismissed"]
    sev_counts = Counter("info" if e.score < 20 else e.severity for e in live_ents)
    total = sum(sev_counts.values()) or 1
    severity = [{"label": lab, "pct": round(sev_counts.get(k, 0) / total * 100), "count": sev_counts.get(k, 0)}
                for k, lab in (("info", "Info"), ("low", "Low"), ("medium", "Medium"), ("high", "High"), ("critical", "Critical"))]

    plat_names = {"facebook": "Facebook", "instagram": "Instagram", "x": "X", "telegram": "Telegram", "web": "Websites", "android": "Apps"}
    platforms = []
    for p, label in plat_names.items():
        pe = [e for e in live_ents if e.platform == p and e.score >= 30]
        if not pe:
            continue
        trend = [sum(1 for e in pe if e.first_seen <= now - WEEK * (8 - j)) for j in range(9)]
        last30 = sum(1 for e in pe if e.first_seen > now - timedelta(days=30))
        prev30 = sum(1 for e in pe if now - timedelta(days=60) < e.first_seen <= now - timedelta(days=30))
        ch = round((last30 - prev30) / prev30 * 100, 1) if prev30 else (100.0 if last30 else 0.0)
        platforms.append({"name": label, "count": len(pe), "change_pct": ch, "trend": trend})

    alerts = db.scalars(select(Alert).where(Alert.brand_id == brand_id, Alert.read == False).order_by(Alert.created_at.desc()).limit(6)).all()  # noqa: E712
    queue = [{"id": e.id, "label": svc.analysis.label_of(svc.entity_dict(e)), "type": e.type, "platform": e.platform, "score": e.score, "severity": e.severity,
              "campaign_id": e.campaign_id, "first_seen": iso(e.first_seen)}
             for e in sorted((e for e in real if e.status == "new" and e.score >= 40), key=lambda e: -e.score)[:8]]
    coverage = []
    for p, label in plat_names.items():
        srcs = {e.source for e in ents if e.platform == p}
        coverage.append({"channel": label, "entities": sum(1 for e in ents if e.platform == p),
                         "mode": "live" if srcs & {"live", "connector"} else "sample" if "sample" in srcs else "not connected"})
    return {"grade": {"letter": grade_for(score), "score": score}, "takedown_status": takedown,
            "activity": {"weeks": weeks, "new": new, "confirmed": conf, "reported": rep, "includes_sample_history": has_sample},
            "severity": severity, "platforms": platforms,
            "alerts": [{"id": a.id, "kind": a.kind, "title": a.title, "ago": ago(a.created_at, now), "severity": a.severity, "sample": a.is_sample} for a in alerts],
            "queue": queue, "coverage": coverage}


# ------------------------------------------------------- nightly rollup ---

def refresh_aggregates(db: Session) -> int:
    """Nightly: write today's snapshot of the dashboard numbers (source=live) so the trend lines keep moving."""
    from ..models import Brand
    today = date.today()
    n = 0
    for b in db.scalars(select(Brand)).all():
        cur = current_values(db, b.id)
        for key in ("active_threats", "suspicious_apps", "fake_profiles"):
            row = db.scalar(select(Metric).where(Metric.brand_id == b.id, Metric.key == key, Metric.day == today, Metric.source == "live"))
            if row:
                row.value = cur[key]
            else:
                db.add(Metric(brand_id=b.id, key=key, day=today, value=cur[key], source="live"))
            n += 1
    db.commit()
    return n
