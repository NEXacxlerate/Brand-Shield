"""Watchlist checks. Domains: DNS A/MX change, new certificate (crt.sh), page title change.
Payment IDs / phones / handles / apps: do they now appear on entities we did not know about before?

Every network call fails soft: an unknown answer never raises an alert. The first check only records a baseline.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..engine import analysis, live
from ..engine.ids import domain_of, extract_from_text, norm_phone
from ..models import Alert, Brand, Entity, Identifier, WatchItem, utcnow
from . import analysis_service as svc
from . import integrations

KINDS = ("domain", "profile", "phone", "payment", "app")
DEFAULT_RULES = {"dns": True, "cert": True, "title": True}


def _entity_ids_for(db: Session, item: WatchItem) -> set[int]:
    v = item.value.strip()
    ids: set[int] = set()
    brand_id = item.brand_id

    def by_ident(kind, val):
        return set(db.scalars(select(Identifier.entity_id).join(Entity, Entity.id == Identifier.entity_id)
                              .where(Entity.brand_id == brand_id, Identifier.kind == kind, Identifier.value == val)))
    if item.kind == "payment":
        ids |= by_ident("payment", v.lower())
    elif item.kind == "phone":
        ids |= by_ident("phone", norm_phone(v))
    elif item.kind == "profile":
        h = v.lstrip("@").lower()
        h = h.split("/")[-1] if "t.me/" in h else h
        ids |= by_ident("telegram", h)
        ids |= set(db.scalars(select(Entity.id).where(Entity.brand_id == brand_id, Entity.type == "social", Entity.key.like(f"%:{h}"))))
    elif item.kind == "app":
        app = db.scalar(select(Entity).where(Entity.brand_id == brand_id, Entity.type == "app", Entity.key == v))
        if app:
            ids.add(app.id)
            for i in db.scalars(select(Identifier).where(Identifier.entity_id == app.id, Identifier.kind.in_(["cert", "domain"]))):
                ids |= by_ident(i.kind, i.value)
    return ids


def _alert(db: Session, item: WatchItem, severity: str, title: str, detail: str):
    db.add(Alert(brand_id=item.brand_id, kind="watchlist", severity=severity, title=title[:300], detail=detail))


def check_domain(db: Session, item: WatchItem) -> dict:
    dom = domain_of(item.value)
    rules = {**DEFAULT_RULES, **(item.rules or {})}
    state = {"a": None, "mx": None, "cert_count": None, "latest_cert": None, "title": None, "resolves": None}
    if integrations.is_enabled(db, "dns"):
        r = live.resolve(dom)
        state["a"], state["mx"] = sorted(r["a"]), sorted(r["mx"])
        state["resolves"] = bool(r["a"] or r["mx"])
    if rules.get("cert") and integrations.is_enabled(db, "crtsh"):
        info = live.crtsh_info(dom)
        if info:
            state["cert_count"], state["latest_cert"] = info.get("count"), info.get("latest")
    if rules.get("title") and state["resolves"]:
        page = live.safe_fetch(dom)
        if page:
            state["title"] = page.get("title", "")
    old = item.last_state or {}
    status, changes = item.status, []
    if old:                                                    # not the baseline run
        if old.get("resolves") and state["resolves"] is False:
            status = "offline"
            changes.append("no longer resolves (taken down or parked)")
        elif old.get("resolves") is False and state["resolves"]:
            status = "changed"
            changes.append("is back online")
        if rules.get("dns") and state["a"] is not None and old.get("a") is not None and (state["a"] != old["a"] or state["mx"] != old.get("mx")):
            status = "changed" if status != "offline" else status
            changes.append(f"DNS records changed (A {old['a']} -> {state['a']}, MX {old.get('mx')} -> {state['mx']})")
        if rules.get("cert") and state["cert_count"] is not None and old.get("cert_count") is not None and state["cert_count"] > old["cert_count"]:
            status = "changed" if status != "offline" else status
            changes.append(f"{state['cert_count'] - old['cert_count']} new TLS certificate(s) logged on crt.sh")
        if rules.get("title") and state["title"] is not None and old.get("title") is not None and state["title"] != old["title"]:
            status = "changed" if status != "offline" else status
            changes.append(f"page title changed from '{old['title']}' to '{state['title']}'")
    # keep what we knew when a lookup gave no answer
    for k, v in state.items():
        if v is None and old.get(k) is not None:
            state[k] = old[k]
    for c in changes:
        _alert(db, item, "high" if status == "offline" or "TLS" in c else "medium", f"{dom}: {c}", f"Watchlist item {dom}: {c}.")
    return {"state": state, "status": status, "changes": changes}


def check_identifier(db: Session, item: WatchItem) -> dict:
    now_ids = _entity_ids_for(db, item)
    old = item.last_state or {}
    status, changes = item.status, []
    if "entity_ids" in old:
        new = sorted(now_ids - set(old["entity_ids"]))
        if new:
            status = "spreading"
            labels = []
            for i in new[:5]:
                e = db.get(Entity, i)
                labels.append(analysis.label_of(svc.entity_dict(e)))
            changes.append(f"now appears on {len(new)} new entit{'y' if len(new) == 1 else 'ies'}: {', '.join(labels)}")
            _alert(db, item, "high", f"{item.value} is spreading", f"{item.value} {changes[-1]}.")
    return {"state": {"entity_ids": sorted(now_ids)}, "status": status, "changes": changes}


def check_item(db: Session, item: WatchItem) -> dict:
    res = check_domain(db, item) if item.kind == "domain" else check_identifier(db, item)
    item.last_state, item.status, item.last_checked = res["state"], res["status"], utcnow()
    db.commit()
    return res


def check_all(db: Session) -> int:
    n = 0
    for item in db.scalars(select(WatchItem)).all():
        try:
            check_item(db, item)
            n += 1
        except Exception:
            db.rollback()
    return n


def normalise_value(kind: str, value: str) -> str:
    v = value.strip()
    if kind == "domain":
        return domain_of(v)
    if kind == "payment":
        return v.lower()
    if kind == "phone":
        found = extract_from_text(v, {})
        return v if not found else v
    return v
