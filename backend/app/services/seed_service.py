"""Demo mode: the admin, the fictional brand Acme Bank with the TrustMesh demo dataset, and synthetic history.

Everything created here is labelled sample (source='sample' / is_sample=True) and the README says so.
"""
import random
from datetime import date, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..config import settings
from ..engine import seed_data, similarity as sim
from ..models import Alert, Brand, Entity, Integration, Investigation, Knowledge, Metric, User, WatchItem, utcnow
from ..security import hash_password
from . import analysis_service as svc
from . import integrations, report_service, scan_service, watch_service
from .common import write_audit

STATES = {"MH": (482, 12), "UP": (398, 18), "DL": (356, 25), "KA": (290, 14), "TN": (268, 11),
          "GJ": (120, 9), "WB": (105, 7), "RJ": (98, 15), "TS": (90, 6), "KL": (80, 10), "MP": (70, 8), "BR": (60, 12), "HR": (40, 5), "PB": (30, 9)}
TARGETS = {"active_threats": (326, 8), "suspicious_apps": (1092, 25), "fake_profiles": (4586, 18)}
CATEGORY_COUNTS = {"cat_profiles": 945, "cat_websites": 647, "cat_apps": 448, "cat_impersonation": 298, "cat_other": 149}   # of 2,487 -> 38/26/18/12/6 %
ACTIVITY = {"activity_new": [14, 18, 15, 22, 25, 20, 28, 32, 30, 36, 41, 45],
            "activity_confirmed": [10, 12, 14, 16, 19, 17, 21, 24, 22, 28, 31, 34],
            "activity_reported": [8, 9, 11, 13, 14, 16, 18, 20, 22, 24, 26, 29]}
KEYWORDS = ["support", "help", "refund", "kyc", "care", "offers", "verify", "reward", "login", "update", "secure", "claim"]
TYPES = [("domain", "Website", ["Phishing Domain", "Scam Page", "Look-alike Domain"]),
         ("handle", "Social Profile", ["Fake Profile", "Impersonation Campaign"]),
         ("phone", "Phone Number", ["Fraudulent Contact", "Fake Care Number"]),
         ("app", "Android App", ["Suspicious App", "Counterfeit App"]),
         ("text", "Message", ["Scam Message", "Phishing Message"]),
         ("payment", "Payment ID", ["Fraudulent Payment ID"])]
RECENT_SAMPLES = [("domain", "acme-support-help.com", 92, "Phishing Domain", 20), ("app", "com.acme.support.help.apk", 88, "Suspicious App", 64),
                  ("phone", "+91 98765 43210", 84, "Fraudulent Contact", 160), ("handle", "@acme_support_india", 94, "Fake Profile", 800),
                  ("domain", "upi-reward-offer.in", 86, "Scam Page", 980)]   # minutes ago


def _hex(h: int) -> str:
    return f"{h:016x}"


def seed_demo(db: Session) -> int | None:
    """Idempotent: does nothing if a brand already exists. Returns the demo brand id."""
    integrations.ensure_defaults(db)
    if db.scalar(select(func.count(User.id))) == 0:
        db.add(User(name=settings.admin_name, email=settings.admin_email.lower(), password_hash=hash_password(settings.admin_password), role="admin"))
        db.commit()
    if not settings.demo_mode or db.scalar(select(func.count(Brand.id))) > 0:
        return None
    admin = db.scalar(select(User).where(User.role == "admin"))

    for label, text in seed_data.KNOWLEDGE:
        db.add(Knowledge(label=label, text=text, source="seed"))
    seed_data.make_logos()
    b = seed_data.BRAND
    logo_hash = _hex(sim.dhash(str(settings.logo_dir / b["logo"])))
    brand = Brand(name=b["name"], aliases=b["aliases"], domains=b["domains"], handles=b["handles"], app_ids=b["app_ids"], developers=b["developers"],
                  cert_sha256=b["cert_sha256"], permissions=b["permissions"], phones=b["phones"], official_text=b["official_text"],
                  logo_path=b["logo"], logo_hash=logo_hash, is_demo=True)
    db.add(brand)
    db.commit()

    scan_service.start_scan(db, brand.id, "demo", admin.id, background=False)       # ingest the sample entities, analyse, build campaigns
    _synthetic_history(db, brand.id, admin.id)
    _demo_watchlist(db, brand.id)
    for cid in svc.campaign_ids(db, brand.id):
        try:
            report_service.create_report(db, admin, cid, None, "pdf")
        except Exception:
            db.rollback()
    db.execute(update(Alert).values(is_sample=True))        # everything that exists at this point came from the synthetic dataset
    db.commit()
    write_audit(db, admin, "seed demo data", brand.name, "synthetic sample data created")
    return brand.id


def _synthetic_history(db: Session, brand_id: int, admin_id: int):
    rng = random.Random(42)
    now = utcnow()
    rows = []
    n_id = {}

    def next_id(dt):
        y = dt.year
        n_id[y] = n_id.get(y, 0) + 1
        return f"INV-{y}-{n_id[y]:04d}"

    plan = []      # (state, created_at)
    for code, (total, pct) in STATES.items():
        recent_total = max(8, round(total * 0.26))
        # last / prev = 1 + pct%, last + prev ~ 26% of the state's total
        prev = max(1, round(recent_total / (2 + pct / 100)))
        last = round(prev * (1 + pct / 100))
        older = total - prev - last
        for _ in range(last):
            plan.append((code, now - timedelta(days=rng.uniform(0, 30))))
        for _ in range(prev):
            plan.append((code, now - timedelta(days=rng.uniform(30.01, 60))))
        for _ in range(older):
            plan.append((code, now - timedelta(days=rng.uniform(60.01, 400))))
    assert len(plan) == 2487, len(plan)
    plan.sort(key=lambda p: p[1])
    # the five most recent rows mirror the dashboard's "recent investigations" examples (they keep the dropped rows' states)
    dropped_states = [c for c, _ in plan[-5:]]
    plan = plan[:-5] + list(zip(dropped_states, sorted(now - timedelta(minutes=m[4]) for m in RECENT_SAMPLES)))
    for idx, (code, created) in enumerate(plan):
        tail = idx >= len(plan) - 5
        if tail:
            itype, value, risk, result, _m = RECENT_SAMPLES[len(plan) - 1 - idx]
            label = dict((t[0], t[1]) for t in TYPES)[itype]
        else:
            itype, label, results = rng.choice(TYPES)
            kw = rng.choice(KEYWORDS)
            value = {"domain": f"acme-{kw}-{rng.randint(10, 9999)}.{rng.choice(['com', 'in', 'online', 'shop'])}",
                     "handle": f"@acme_{kw}_{rng.randint(1, 999)}", "phone": f"+91 9{rng.randint(1000, 9999)} {rng.randint(10000, 99999)}",
                     "app": f"com.acme.{kw}.apk", "text": f"Your Acme account is blocked, {kw} now: link-{rng.randint(100, 999)}",
                     "payment": f"acme{kw}{rng.randint(1, 99)}@ybl"}[itype]
            risk = round(rng.uniform(34, 98), 0)
            result = rng.choice(results)
        status = rng.choice(["resolved", "resolved", "resolved", "investigating", "open", "on_hold"]) if not tail else "open"
        sev = "critical" if risk >= 80 else "high" if risk >= 60 else "medium" if risk >= 40 else "low"
        rows.append(Investigation(id=next_id(created), brand_id=brand_id, input_type=itype, input_value=value, depth=rng.choice(["quick", "deep"]),
                                  status=status, risk_score=risk, state_code=code, assigned_to=admin_id if rng.random() < 0.3 else None, created_by=admin_id,
                                  is_sample=True, created_at=created, updated_at=created,
                                  result={"headline": result, "risk": {"score": risk, "severity": sev, "label": sev.title() + " risk"},
                                          "summary": {"text": f"Sample record: {result.lower()} flagged for review.", "source": "rules"}, "sample": True}))
    db.add_all(rows)

    today = date.today()
    for key, (target, pct) in TARGETS.items():
        g = (1 + pct / 100) ** 0.25
        for w in range(7, -1, -1):
            db.add(Metric(brand_id=brand_id, key=key, day=today - timedelta(days=7 * w), value=round(target / (g ** w)), source="sample"))
    for key, val in CATEGORY_COUNTS.items():
        db.add(Metric(brand_id=brand_id, key=key, day=today, value=val, source="sample"))
    for key, series in ACTIVITY.items():
        for i, v in enumerate(series):
            db.add(Metric(brand_id=brand_id, key=key, day=today - timedelta(days=7 * (11 - i)), value=v, source="sample"))

    # a few extra synthetic alerts so the feed is not only the demo entities
    synth = [("phishing", "high", "Phishing website detected", 62), ("phone", "medium", "Fraudulent phone number reported", 190),
             ("app", "high", "Malicious Android app found", 18), ("campaign", "high", "Impersonation campaign growing", 300)]
    for kind, sev, title, mins in synth:
        db.add(Alert(brand_id=brand_id, kind=kind, severity=sev, title=title, detail="Sample alert from the synthetic history.",
                     is_sample=True, created_at=now - timedelta(minutes=mins)))
    db.commit()


def _demo_watchlist(db: Session, brand_id: int):
    items = [("domain", "acrnebank-refund.com"), ("profile", "@acme_refund_help"), ("payment", "acmerefund@okaxis"),
             ("app", "com.acrnebank.refund"), ("profile", "t.me/acme_refund_desk"), ("phone", "+91 90000 12345")]
    ents = db.scalars(select(Entity).where(Entity.brand_id == brand_id).order_by(Entity.id)).all()
    for kind, value in items:
        w = WatchItem(brand_id=brand_id, kind=kind, value=value, rules=dict(watch_service.DEFAULT_RULES), created_at=utcnow() - timedelta(days=3))
        db.add(w)
        db.flush()
        if kind != "domain":
            ids = watch_service._entity_ids_for(db, w)
            # sample history: the payment ID and Telegram handle were last checked before the two newest entities appeared,
            # so the first real check below finds them and marks the item as spreading
            if value in ("acmerefund@okaxis", "t.me/acme_refund_desk") and len(ids) > 2:
                newest = sorted(ids, key=lambda i: next(e.first_seen for e in ents if e.id == i))[-2:]
                ids = ids - set(newest)
            w.last_state = {"entity_ids": sorted(ids)}
            w.last_checked = utcnow() - timedelta(days=1)
            w.status = "stable"
    db.commit()
    for w in db.scalars(select(WatchItem).where(WatchItem.brand_id == brand_id, WatchItem.kind != "domain")):
        watch_service.check_item(db, w)
