"""Persistence around the pure analysis engine: load entities, run analyze(), store results, read campaigns back."""
import time
from collections import defaultdict
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..engine import analysis, dna as dna_engine, evolution, explain, layout
from ..engine import detectors as det
from ..models import Alert, Brand, Entity, Identifier, Knowledge, Signal, StageHistory, utcnow
from .common import DAY, from_epoch, to_epoch

SAMPLE_HISTORY_LAG = 0.5   # days after first_seen at which a sample entity's first stage change is dated


def brand_dict(b: Brand) -> dict:
    return {"id": b.id, "name": b.name, "aliases": b.aliases or [], "domains": b.domains or [], "handles": b.handles or {},
            "app_ids": b.app_ids or [], "developers": b.developers or [], "cert_sha256": b.cert_sha256 or "",
            "permissions": b.permissions or [], "phones": b.phones or [], "official_text": b.official_text or "",
            "logo": b.logo_path, "demo": b.is_demo, "logo_hash": b.logo_hash}


def entity_dict(e: Entity) -> dict:
    return {"id": e.id, "brand_id": e.brand_id, "type": e.type, "platform": e.platform, "key": e.key, "data": e.data or {},
            "status": e.status, "first_seen": to_epoch(e.first_seen), "source": e.source, "score": e.score, "severity": e.severity,
            "stage": e.stage, "campaign_id": e.campaign_id, "state_code": e.state_code}


def kb_list(db: Session) -> list[dict]:
    return [{"label": k.label, "text": k.text, "source": k.source, "campaign_id": k.campaign_id} for k in db.scalars(select(Knowledge))]


def load_entities(db: Session, brand_id: int) -> list[dict]:
    return [entity_dict(e) for e in db.scalars(select(Entity).where(Entity.brand_id == brand_id).order_by(Entity.id))]


def get_brand(db: Session, brand_id: int) -> Brand | None:
    return db.get(Brand, brand_id)


_THREAT_TITLES = {
    "social": "Possible fake {brand} profile detected: {label}",
    "website": "Look-alike website detected: {label}",
    "app": "Suspicious Android app found: {label}",
}


def run_analysis(db: Session, brand_id: int, actor=None) -> dict:
    """Re-score every entity of a brand and re-cluster. Records stage changes and raises alerts for new serious suspects."""
    brand_row = db.get(Brand, brand_id)
    if not brand_row:
        raise ValueError("Unknown brand")
    brand = brand_dict(brand_row)
    ents = load_entities(db, brand_id)
    kb = kb_list(db)
    out = analysis.analyze(brand, ents, kb)
    now = utcnow()
    rows = {e.id: e for e in db.scalars(select(Entity).where(Entity.brand_id == brand_id))}
    ids = list(rows)
    if ids:
        db.execute(delete(Signal).where(Signal.entity_id.in_(ids)))
        db.execute(delete(Identifier).where(Identifier.entity_id.in_(ids)))
    for eid, r in out["results"].items():
        row = rows[eid]
        old_stage, old_score = row.stage, row.score
        first_run = db.scalar(select(StageHistory.id).where(StageHistory.entity_id == eid).limit(1)) is None
        if r["stage"] != old_stage or (first_run and r["stage"] != 1):
            at = now
            if row.source == "sample":      # demo history: date the first transition shortly after the entity appeared
                at = min(now, row.first_seen + timedelta(days=SAMPLE_HISTORY_LAG))
            db.add(StageHistory(entity_id=eid, from_stage=old_stage, to_stage=r["stage"], at=at))
        row.score, row.severity, row.stage, row.campaign_id = r["score"], r["severity"], r["stage"], r["campaign_id"]
        for s in r["signals"]:
            db.add(Signal(entity_id=eid, name=s["name"], label=s["label"], strength=s["strength"], weight=s["weight"],
                          points=s["points"], reason=s["reason"], evidence=s["evidence"]))
        seen = set()
        for k, v in r["idents"]:
            if (k, v) not in seen:
                seen.add((k, v))
                db.add(Identifier(entity_id=eid, kind=k, value=v))
        if r["score"] >= 60 and old_score < 60 and row.status != "dismissed":
            label = analysis.label_of(entity_dict(row) | {"data": row.data})
            db.add(Alert(brand_id=brand_id, kind="new_threat", severity="critical" if r["score"] >= 80 else "high",
                         title=_THREAT_TITLES[row.type].format(brand=brand["name"], label=label),
                         detail=f"Risk {round(r['score'])}/100. " + "; ".join(s["reason"] for s in sorted(r["signals"], key=lambda s: -s["points"])[:2]),
                         entity_id=eid, is_sample=row.source == "sample",
                         created_at=min(now, row.first_seen + timedelta(days=SAMPLE_HISTORY_LAG)) if row.source == "sample" else now))
    db.commit()
    return out["summary"]


# ----------------------------------------------------------------- reads ---

def _members(db: Session, cid: int) -> list[dict]:
    rows = db.scalars(select(Entity).where(Entity.campaign_id == cid).order_by(Entity.score.desc(), Entity.id)).all()
    return [entity_dict(e) for e in rows]


def idents_for(db: Session, ids) -> dict:
    out = defaultdict(list)
    if ids:
        for i in db.scalars(select(Identifier).where(Identifier.entity_id.in_(list(ids)))):
            out[i.entity_id].append((i.kind, i.value))
    return out


def signal_strengths(db: Session, ids) -> dict:
    out = defaultdict(dict)
    if ids:
        for s in db.scalars(select(Signal).where(Signal.entity_id.in_(list(ids)))):
            out[s.entity_id][s.name] = s.strength
    return out


def campaign_ids(db: Session, brand_id: int) -> list[int]:
    return sorted(set(db.scalars(select(Entity.campaign_id).where(Entity.brand_id == brand_id, Entity.campaign_id.is_not(None)))))


def get_campaign(db: Session, cid: int, full: bool = True) -> dict | None:
    members = _members(db, cid)
    if not members:
        return None
    brand = brand_dict(db.get(Brand, members[0]["brand_id"]))
    idents = idents_for(db, [m["id"] for m in members])
    c = analysis.build_campaign(cid, members, idents, brand, kb_list(db), full=full)
    c["name"] = f"C-{cid} {c['hypothesis']['label']}"
    c["sample"] = all(m["source"] == "sample" for m in members)
    return c


def list_campaigns(db: Session, brand_id: int) -> list[dict]:
    cs = [get_campaign(db, cid, full=False) for cid in campaign_ids(db, brand_id)]
    return sorted([c for c in cs if c], key=lambda c: (-c["risk"], c["id"]))


def entity_detail(db: Session, eid: int) -> dict | None:
    e = db.get(Entity, eid)
    if not e:
        return None
    brand = brand_dict(db.get(Brand, e.brand_id))
    sigs = [{"name": s.name, "label": s.label, "strength": s.strength, "weight": s.weight, "points": s.points, "reason": s.reason,
             "evidence": s.evidence} for s in db.scalars(select(Signal).where(Signal.entity_id == eid).order_by(Signal.points.desc()))]
    idents = [{"kind": i.kind, "value": i.value} for i in db.scalars(select(Identifier).where(Identifier.entity_id == eid))]
    d = entity_dict(e)
    camp = get_campaign(db, e.campaign_id, full=False) if e.campaign_id else None
    return {"entity": analysis.member_summary(d) | {"brand_id": e.brand_id, "state_code": e.state_code, "data": e.data},
            "signals": sigs, "identifiers": idents, "campaign": camp, "summary": explain.entity_summary(d, sigs, brand, camp),
            "sample": e.source == "sample"}


def campaign_graph(db: Session, cid: int) -> dict | None:
    members = _members(db, cid)
    if not members:
        return None
    brand = brand_dict(db.get(Brand, members[0]["brand_id"]))
    idents = idents_for(db, [m["id"] for m in members])
    sig = signal_strengths(db, [m["id"] for m in members])
    g = analysis.build_graph(members, idents, sig, brand, campaign_id=cid, with_forecast=True)
    pos = layout.force_layout(g["nodes"], g["edges"])
    nodes = []
    for n in g["nodes"]:
        x, y = pos[n["id"]]
        nodes.append({"id": n["id"], "kind": n["kind"], "label": n["label"], "severity": n.get("severity", "low" if n["kind"] != "brand" else "low"),
                      "x": x, "y": y, "predicted": bool(n.get("predicted")), "sub": n.get("sub", ""), "entity_id": n.get("eid"),
                      "score": n.get("score")})
    edges = [{"source": e["source"], "target": e["target"], "kind": e["kind"], "predicted": bool(e.get("predicted"))} for e in g["edges"]]
    c = analysis.build_campaign(cid, members, idents, brand, kb_list(db), full=True)
    return {"nodes": nodes, "edges": edges, "attack_path": c["path"], "shared": c["shared"], "campaign_id": cid}


def campaign_evolution(db: Session, cid: int) -> dict | None:
    members = _members(db, cid)
    if not members:
        return None
    now = time.time()
    brand_ents = [entity_dict(e) for e in db.scalars(select(Entity).where(Entity.brand_id == members[0]["brand_id"], Entity.status != "dismissed"))]
    member_ids = [m["id"] for m in members]
    hist = db.execute(select(StageHistory, Entity).join(Entity, Entity.id == StageHistory.entity_id)
                      .where(StageHistory.entity_id.in_(member_ids)).order_by(StageHistory.at.desc(), StageHistory.id.desc())).all()
    brand = brand_dict(db.get(Brand, members[0]["brand_id"]))
    stage_changes = [{"entity": analysis.label_of(entity_dict(e)), "entity_id": e.id, "from": analysis.STAGES[h.from_stage - 1],
                      "to": analysis.STAGES[h.to_stage - 1], "at": h.at.isoformat() + "Z", "when": _when(h.at)} for h, e in hist]
    idents = idents_for(db, member_ids)
    events = []
    for m in members:
        events.append({"at": from_epoch(m["first_seen"]).isoformat() + "Z", "days_ago": round((now - m["first_seen"]) / DAY, 1),
                       "time": _when(from_epoch(m["first_seen"])), "title": f"{analysis.label_of(m)} appears",
                       "desc": _timeline_desc(m, idents), "entity_id": m["id"], "kind": m["type"]})
    events.sort(key=lambda ev: ev["days_ago"])
    f = analysis.forecast(members, now)
    return {"stages": evolution.stage_counts(brand_ents), "growth": evolution.growth(members, now),
            "forecast": {"next7": f["next7"], "recent": f["recent"], "previous": f["previous"], "trend": f["trend"], "is_estimate": True,
                         "basis": f["basis"]},
            "stage_changes": stage_changes, "timeline": events, "campaign_id": cid, "brand": brand["name"]}


def _when(dt) -> str:
    from .common import ago
    return ago(dt)


def _timeline_desc(m, idents):
    kinds = {k for k, _ in idents.get(m["id"], [])}
    bits = []
    if "payment" in kinds:
        bits.append("shares the payment ID")
    if "telegram" in kinds:
        bits.append("points to the Telegram handle")
    if "domain" in kinds and m["type"] != "website":
        bits.append("links to the look-alike domain")
    if "logo" in kinds:
        bits.append("uses the edited logo")
    return ", ".join(bits).capitalize() if bits else f"{m['platform'].title()} {m['type']}, risk {round(m['score'])}/100"


def campaign_dna(db: Session, cid: int) -> dict | None:
    members = _members(db, cid)
    if not members:
        return None
    brand = brand_dict(db.get(Brand, members[0]["brand_id"]))
    kb = kb_list(db)
    ids = [m["id"] for m in members]
    idents = idents_for(db, ids)
    sig = signal_strengths(db, ids)
    shared = analysis.shared_identifiers(members, idents)
    text = dna_engine.campaign_text(members)
    closest = dna_engine.closest_playbooks(text, kb, brand)
    top_label = closest[0]["playbook"] if closest else None
    known = next((k["text"] for k in kb if k["label"] == top_label), "")
    case_text, case_label = dna_engine.best_case_text(members)
    others = [{"id": c, "text": dna_engine.campaign_text(_members(db, c))} for c in campaign_ids(db, brand["id"])]
    return {"families": dna_engine.families(members, sig, idents, shared), "closest": closest,
            "side_by_side": dna_engine.side_by_side(known, case_text) | {"case_label": case_label, "known_label": top_label},
            "map": dna_engine.campaign_map(kb, others, cid, brand), "note": dna_engine.NOTE, "campaign_id": cid}


def learn_campaign(db: Session, cid: int) -> bool:
    """Learning loop: add the confirmed campaign's wording to the knowledge base (once, then refreshed)."""
    members = _members(db, cid)
    if not members:
        return False
    brand = brand_dict(db.get(Brand, members[0]["brand_id"]))
    c = analysis.build_campaign(cid, members, idents_for(db, [m["id"] for m in members]), brand, kb_list(db), full=False)
    text = " ".join(m["data"].get("bio", "") for m in members if m["type"] == "social") or dna_engine.campaign_text(members)
    label = f"{c['hypothesis']['label']} (confirmed C-{cid})"
    k = db.scalar(select(Knowledge).where(Knowledge.source == "learned", Knowledge.campaign_id == cid))
    if k:
        k.text, k.label = text, label
    else:
        db.add(Knowledge(label=label, text=text, source="learned", campaign_id=cid))
    db.commit()
    return True
