"""One clue in, the surrounding network out. Every number in the result traces back to a signal or a stored entity."""
import re
import time
from datetime import timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..engine import analysis, explain, live, similarity as sim
from ..engine import detectors as det
from ..engine.ids import COMMON_DOMAINS, domain_of, extract_from_text, is_official_domain
from ..models import Brand, Entity, Identifier, Investigation, Signal, utcnow
from . import analysis_service as svc
from . import integrations

TYPE_ALIASES = {"url": "domain", "domain": "domain", "profile": "handle", "handle": "handle", "message": "text", "text": "text",
                "image": "image", "apk": "app", "app": "app", "phone": "phone", "wallet": "payment", "payment": "payment",
                "identifier": "identifier", "other": "identifier"}
TYPE_LABEL = {"domain": "Website", "handle": "Social Profile", "text": "Message", "image": "Image", "app": "Android App",
              "phone": "Phone Number", "payment": "Payment ID", "identifier": "Identifier"}
ENTITY_TYPE_LABEL = {"social": "Social profile", "website": "Website", "app": "Android app"}
SEVERITY_LABEL = {"critical": "Critical", "high": "High", "medium": "Medium", "low": "Low"}


def new_id(db: Session) -> str:
    year = utcnow().year
    prefix = f"INV-{year}-"
    last = db.scalar(select(func.max(Investigation.id)).where(Investigation.id.like(prefix + "%")))
    n = int(last.split("-")[-1]) + 1 if last else 1
    return f"{prefix}{n:04d}"


def classify_signals(signals: list[dict], score: float) -> list[dict]:
    """Five explainable percentages, each the strength of the signals behind it."""
    st = {s["name"]: s["strength"] for s in signals}

    def pct(*names):
        return round(max([st.get(n, 0.0) for n in names] + [0.0]) * 100)
    out = [{"label": "Impersonation", "pct": pct("name_similarity", "logo_similarity", "copied_content", "page_brand_copy")},
           {"label": "Phishing", "pct": pct("credential_capture", "suspicious_links", "page_brand_copy", "infrastructure")},
           {"label": "Scam", "pct": pct("scam_language")},
           {"label": "Suspicious", "pct": round(score)},
           {"label": "Malware", "pct": pct("risky_permissions", "developer_mismatch", "suspicious_endpoints")}]
    return sorted(out, key=lambda x: -x["pct"])


def findings_from(signals: list[dict], limit: int = 8) -> list[str]:
    return [s["reason"] for s in sorted(signals, key=lambda s: -s["points"]) if s["points"] > 0][:limit]


def _headline(cls: list[dict], dtype: str) -> str:
    top = cls[0]
    if top["pct"] < 30:
        return "No strong signals"
    return {"Impersonation": "Brand impersonation", "Phishing": "Phishing indicators", "Scam": "Scam wording",
            "Suspicious": "Suspicious", "Malware": "Suspicious app"}[top["label"]] if top["label"] != "Suspicious" else "Suspicious " + TYPE_LABEL.get(dtype, "item").lower()


def _ctx(db: Session, brand: dict):
    kb = svc.kb_list(db)
    ents = svc.load_entities(db, brand["id"])
    corpus = sim.Corpus([brand.get("official_text", "")] + [k["text"] for k in kb] + [det.entity_text(e) for e in ents])
    ctx = det.Ctx(brand, corpus, kb)
    for e in ents:
        if e["type"] == "website" and sim.name_match(sim.registrable_label(e["key"]), brand)["strength"] >= 0.5:
            ctx.suspect_sites.add(e["key"])
    return ctx, kb


def _match_entities(db: Session, brand_id: int, pairs: list[tuple[str, str]]) -> dict[int, Entity]:
    found: dict[int, Entity] = {}
    for k, v in pairs:
        if k == "handle":
            q = select(Entity).where(Entity.brand_id == brand_id, Entity.type == "social", func.lower(Entity.key).like(f"%:{v}"))
        else:
            q = select(Entity).join(Identifier, Identifier.entity_id == Entity.id).where(Entity.brand_id == brand_id, Identifier.kind == k, Identifier.value == v)
        for e in db.scalars(q):
            found.setdefault(e.id, e)
        if k == "domain":       # an entity whose key is that domain (websites) also counts
            for e in db.scalars(select(Entity).where(Entity.brand_id == brand_id, Entity.type == "website", Entity.key == v)):
                found.setdefault(e.id, e)
    return found


def investigate(db: Session, brand_row: Brand, itype: str, value: str, depth: str, image_bytes: bytes | None = None,
                app_result: dict | None = None) -> dict:
    """Returns {steps, risk_score, result}. `result` is what gets stored on the investigation."""
    brand = svc.brand_dict(brand_row)
    dtype = TYPE_ALIASES.get(itype, "identifier")
    value = (value or "").strip()
    steps = []

    def step(name, detail, status="done"):
        steps.append({"name": name, "status": status, "detail": detail})

    if itype in ("identifier", "other", "wallet") and value:      # let the content decide
        guessed = explain.classify_clue(value)
        if guessed in ("domain", "handle", "text"):
            dtype = guessed
        elif itype == "wallet":
            dtype = "payment"
    step("Validate input", f"Treated as {TYPE_LABEL.get(dtype, dtype).lower()} ({len(value)} characters)")
    ctx, kb = _ctx(db, brand)

    extracted = extract_from_text(value, brand)
    if dtype == "domain":
        dom = domain_of(value)
        if dom not in COMMON_DOMAINS and not is_official_domain(dom, brand):
            extracted.append(("domain", dom))
    if dtype == "handle":
        extracted.append(("handle", value.lstrip("@").lower()))
    if dtype == "phone":
        from ..engine.ids import norm_phone
        extracted.append(("phone", norm_phone(value)))
    if dtype == "payment":
        extracted.append(("payment", value.lower()))
    uniq, seen = [], set()
    for k, v in extracted:
        if v and (k, v) not in seen:
            seen.add((k, v))
            uniq.append((k, v))
    step("Extract indicators", ", ".join(f"{k}: {v}" for k, v in uniq) or "No identifiers found in the input")

    matches = _match_entities(db, brand_row.id, uniq)
    step("Match against known entities", f"{len(matches)} known entit{'y' if len(matches) == 1 else 'ies'} share an identifier with this input")

    signals: list[dict] = []
    assessed_entity = None
    method = ""
    score = 0.0
    live_note = None
    if app_result is not None:
        signals, score, method = app_result["signals"], app_result["score"], "App signals (same detector used for APK analysis)"
        step("Analyse application", f"{len(signals)} signals evaluated")
    elif dtype == "domain":
        dom = domain_of(value)
        existing = next((m for m in matches.values() if m.type == "website" and m.key == dom), None)
        if existing:
            assessed_entity = existing
            signals = [{"name": s.name, "label": s.label, "strength": s.strength, "weight": s.weight, "points": s.points, "reason": s.reason,
                        "evidence": s.evidence} for s in db.scalars(select(Signal).where(Signal.entity_id == existing.id))]
            score, method = existing.score, "Stored score of the matching website entity"
            step("Score website", f"Known entity, stored risk {round(score)}/100")
        else:
            data = {"domain": dom, "title": "", "text": "", "links": []}
            if depth == "deep" and integrations.is_enabled(db, "dns"):
                res = live.check_domain(dom, "user-submitted", enrich=integrations.is_enabled(db, "rdap"))
                if res:
                    data.update(res)
                    step("Live checks (DNS, RDAP, certificate log, page)", f"Resolves; registered {res.get('registered_days_ago', 'unknown')} day(s) ago; MX {'yes' if res.get('has_mx') else 'no'}")
                else:
                    step("Live checks (DNS, RDAP, certificate log, page)", "No DNS answer, so page and registration data are unknown", "skipped")
            else:
                step("Live checks", "Skipped in quick mode; registration and page data are unknown (they add no points)", "skipped")
            ent = {"id": 0, "type": "website", "platform": "web", "key": dom, "data": data, "status": "new", "first_seen": time.time(), "source": "user"}
            signals = det.website_signals(ent, ctx)
            score = round(det.total(signals), 1)
            method = "Website detector run on this input (unknown facts count as zero points)"
            step("Score website", f"Risk {round(score)}/100 from {len(signals)} signals")
    elif dtype == "handle":
        h = value.lstrip("@").lower()
        existing = next((m for m in matches.values() if m.type == "social" and (m.data or {}).get("handle", "").lower() == h), None)
        if existing:
            assessed_entity = existing
            signals = [{"name": s.name, "label": s.label, "strength": s.strength, "weight": s.weight, "points": s.points, "reason": s.reason,
                        "evidence": s.evidence} for s in db.scalars(select(Signal).where(Signal.entity_id == existing.id))]
            score, method = existing.score, "Stored score of the matching profile entity"
        else:
            ent = {"id": 0, "type": "social", "platform": "unknown", "key": h, "data": {"handle": h, "display_name": h}, "status": "new",
                   "first_seen": time.time(), "source": "user"}
            signals = det.social_signals(ent, ctx)
            score = round(det.total(signals), 1)
            method = "Social-profile detector run on the handle only (bio, logo and age are unknown and add no points)"
        step("Score profile", f"Risk {round(score)}/100")
    elif dtype == "text":
        ls = det.language_signal(ctx, value, 15)
        signals = [ls]
        score = round(ls["strength"] * 100, 1)
        method = "Scam-wording strength: matched scam patterns (4 = full) or similarity to a known playbook, whichever is higher"
        step("Check scam wording", ls["reason"])
    elif dtype == "image" and image_bytes:
        try:
            h = sim.dhash(image_bytes)
            bh = ctx.brand_hash
            if bh is not None:
                s = sim.logo_similarity(h, bh)
                strength = sim.ramp(s, 0.75, 0.95)
                signals = [det.sig("logo_similarity", "Logo match", strength, 100, f"Image is {s:.0%} similar to the official logo", {"similarity": round(s, 3)})]
                score = round(strength * 100, 1)
                method = "Logo similarity (dHash) mapped from 75% to 95% onto 0 to 100"
                step("Compare with official logo", f"{s:.0%} similar")
            else:
                step("Compare with official logo", "The brand has no logo on file", "skipped")
        except Exception:
            step("Compare with official logo", "Could not read the image", "skipped")
    else:
        method = "Highest risk among the known entities that share this identifier"
        step("Assess identifier", "No detector applies to a bare identifier; risk comes from the entities that use it")

    if matches:
        top = max(matches.values(), key=lambda e: e.score)
        if top.score > score:
            score, method = top.score, (method + "; " if method else "") + f"raised to the highest linked entity ({analysis.label_of(svc.entity_dict(top))}, {round(top.score)}/100)"
        if not signals:
            signals = [{"name": s.name, "label": s.label, "strength": s.strength, "weight": s.weight, "points": s.points, "reason": s.reason,
                        "evidence": s.evidence} for s in db.scalars(select(Signal).where(Signal.entity_id == top.id))]
    score = max(0.0, min(100.0, score))

    cids = sorted({m.campaign_id for m in matches.values() if m.campaign_id})
    camp = svc.get_campaign(db, cids[0], full=True) if cids else None
    related = []
    for m in sorted(matches.values(), key=lambda e: -e.score):
        d = svc.entity_dict(m)
        related.append({"entity": analysis.label_of(d), "type": ENTITY_TYPE_LABEL[m.type], "risk": SEVERITY_LABEL[m.severity], "link": "verified",
                        "entity_id": m.id})
    if camp:
        have = {r["entity_id"] for r in related}
        for mem in camp["members"]:
            if mem["id"] not in have and len(related) < 12:
                related.append({"entity": mem["label"], "type": ENTITY_TYPE_LABEL[mem["type"]], "risk": SEVERITY_LABEL[mem["severity"]],
                                "link": "inferred", "entity_id": mem["id"]})
        for sh in camp["shared"][:4]:
            related.append({"entity": sh["display"], "type": sh["label"], "risk": SEVERITY_LABEL[camp["severity"]], "link": "verified", "entity_id": None})

    cls = classify_signals(signals, score)
    findings = findings_from(signals)
    if camp:
        findings.append(f"Linked to {camp['size'] - 1} other entities in {camp['label']} ({camp['hypothesis']['label']})")
    if not findings:
        findings = ["No strong signals were found" if matches or signals else "Not in the graph yet. Add it to a case to link it with other evidence."]
    if depth != "deep" and dtype == "domain" and not assessed_entity:
        findings.append("Quick mode: run a deep investigation to check DNS, registration date and the page itself")

    sev = det.severity(score)
    verdict_text = (f"Matches {len(matches)} known entit{'y' if len(matches) == 1 else 'ies'}" + (f" in {camp['label']}" if camp else "") + "."
                    if matches else "Not in the graph yet.")
    facts = (f"{value[:80]} scores {round(score)}/100 ({sev}). {verdict_text} " + (" ".join(findings[:3])) + ".")
    ai = explain._llm(facts)
    summary = {"text": ai or facts, "source": "ai" if ai else "rules"}
    state = next((m.state_code for m in matches.values() if m.state_code), None)
    actions = [
        {"key": "block_report", "label": "Block / report", "detail": "Report to the registrar and host" if dtype == "domain" else "Prepare a report for the platform"},
        {"key": "monitor", "label": "Monitor for similar activity", "detail": f"Watch look-alikes of {brand['domains'][0] if brand['domains'] else brand['name']}"},
        {"key": "verify", "label": "Verify with official source", "detail": "Confirm with the brand's own team"},
        {"key": "escalate", "label": "Escalate for analysis", "detail": "Assign to a senior analyst"},
    ]
    result = {"steps": steps, "risk": {"score": round(score, 1), "severity": sev, "label": SEVERITY_LABEL[sev] + " risk"},
              "classification": cls, "findings": findings, "summary": summary, "related": related, "actions": actions,
              "matched_entity_ids": sorted(matches), "campaign_id": cids[0] if cids else None, "extracted": [{"kind": k, "value": v} for k, v in uniq],
              "method": method, "headline": _headline(cls, dtype), "state_code": state, "verdict": verdict_text}
    return {"steps": steps, "risk_score": round(score, 1), "result": result, "state_code": state}


def list_filter(q=None, status=None):
    conds = []
    if status:
        conds.append(Investigation.status == status)
    if q:
        like = f"%{q}%"
        conds.append(or_(Investigation.id.ilike(like), Investigation.input_value.ilike(like)))
    return conds
