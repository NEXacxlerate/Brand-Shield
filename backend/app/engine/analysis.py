"""The analysis engine (ported from TrustMesh; algorithms, weights and reasons unchanged).

analyze() re-scores every entity for a brand, then links suspects into campaigns:
  1. shared identifiers (phone, UPI id, Telegram, email, domain, signing cert)  -> union-find
  2. "Attack DNA" similarity: the same edited logo, the same scam script       -> union-find

The functions here are pure: they take plain dicts and return plain dicts. Persistence lives in
app/services/analysis_service.py. Entity dicts look like
  {id, type, platform, key, data, status, first_seen (epoch seconds), source, brand_id, ...}
"""
import math
import time
from collections import Counter, defaultdict

from . import detectors as det
from . import similarity as sim
from .ids import CLUSTER_KINDS, extract_identifiers

STAGES = ["Normal", "Anomaly", "Suspicious", "Impersonation", "Campaign", "Active scam"]
VIA = {"payment": "payment ID", "phone": "phone number", "telegram": "Telegram handle", "email": "email", "domain": "domain",
       "cert": "signing certificate", "logo": "edited logo", "script": "scam script"}
KIND_LABEL = {"payment": "Payment ID", "phone": "Phone number", "telegram": "Telegram handle", "email": "Email", "domain": "Domain",
              "cert": "Signing certificate", "logo": "Edited logo", "script": "Scam script", "ip": "IP address", "nameserver": "Name server"}
SUSPECT_MIN = 30      # provisional score needed to take part in clustering
DAY = 86400.0


class UF:
    def __init__(self, items):
        self.p = {i: i for i in items}

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[max(ra, rb)] = min(ra, rb)   # smallest id becomes the root = campaign id

    def groups(self):
        g = defaultdict(list)
        for i in self.p:
            g[self.find(i)].append(i)
        return g


def ident_display(kind, value):
    """(friendly kind, friendly value) for the UI."""
    if kind == "logo":
        return KIND_LABEL[kind], f"same edited logo (fingerprint {value[:8]})"
    if kind == "script":
        return KIND_LABEL[kind], "near-identical scam text"
    return KIND_LABEL.get(kind, kind), value


def age_days(e, now=None):
    return max(0.0, ((now or time.time()) - e["first_seen"]) / DAY)


def label_of(e):
    d = e["data"]
    if e["type"] == "social":
        return "@" + d.get("handle", e["key"])
    if e["type"] == "app":
        return d.get("title") or e["key"]
    return e["key"]


def url_of(e):
    d = e["data"]
    if e["type"] == "social":
        host = {"instagram": "instagram.com", "x": "x.com", "facebook": "facebook.com", "telegram": "t.me"}.get(e["platform"], e["platform"] + ".com")
        return f"https://{host}/{d.get('handle', '')}"
    if e["type"] == "website":
        return "https://" + e["key"]
    return (f"https://play.google.com/store/apps/details?id={e['key']}" if d.get("store") == "play"
            else f"sideloaded APK{(' from ' + d['hosted_on']) if d.get('hosted_on') else ''}")


def stage_for(score, campaign_size, active_scam):
    s = 1 if score < 20 else 2 if score < 40 else 3 if score < 60 else 4
    if campaign_size >= 3 and score >= 40:
        s = max(s, 5)
    if active_scam and score >= 60:
        s = 6
    return s


# --------------------------------------------------------------- analyze ---

def analyze(brand, ents, kb):
    """Score every entity and cluster the suspects.

    brand: dict (name, aliases, domains, handles, app_ids, developers, cert_sha256, permissions, phones, official_text, logo)
    ents:  list of entity dicts   kb: list of {label, text}
    Returns {"results": {entity_id: {signals, idents, score, severity, stage, campaign_id, cluster_size, linked_via}}, "summary": {...}}
    """
    corpus = sim.Corpus([brand.get("official_text", "")] + [k["text"] for k in kb] + [det.entity_text(e) for e in ents])
    ctx = det.Ctx(brand, corpus, kb)
    for e in ents:
        if e["type"] == "website" and sim.name_match(sim.registrable_label(e["key"]), brand)["strength"] >= 0.5:
            ctx.suspect_sites.add(e["key"])

    sigs = {e["id"]: det.base_signals(e, ctx) for e in ents}
    prov = {i: det.total(s) for i, s in sigs.items()}
    idents = {e["id"]: extract_identifiers(e, brand) for e in ents}
    active = [e for e in ents if prov[e["id"]] >= SUSPECT_MIN and e["status"] != "dismissed"]

    uf = UF([e["id"] for e in active])
    via = defaultdict(set)                         # via[entity] -> what linked it

    def groups_by(close, ids):
        g = UF(ids)
        for i, x in enumerate(ids):
            for y in ids[i + 1:]:
                if close(x, y):
                    g.union(x, y)
        return [sorted(m) for m in g.groups().values() if len(m) >= 2]

    # Attack DNA, part 1: the same EDITED logo (near-identical to each other, but not to the official one).
    # Pairwise comparison is O(n^2) on suspects only; at larger scale swap in LSH / MinHash buckets.
    hashes = {e["id"]: ctx.hash_of(e["data"].get("logo")) for e in active}
    if ctx.brand_hash is not None:
        hid = [i for i, h in hashes.items() if h is not None and sim.hamming(h, ctx.brand_hash) >= 4]
        for grp in groups_by(lambda x, y: sim.hamming(hashes[x], hashes[y]) <= 3, hid):
            rep = f"{hashes[grp[0]]:016x}"
            for i in grp:
                idents[i].append(("logo", rep))
    # Attack DNA, part 2: near-identical scam script
    bios = {e["id"]: e["data"].get("bio", "") for e in active if e["type"] == "social"}
    sid = [i for i, b in bios.items() if len(sim.toks(b)) >= 8]
    for grp in groups_by(lambda x, y: corpus.cosine(bios[x], bios[y]) >= 0.9, sid):
        for i in grp:
            idents[i].append(("script", f"script-{grp[0]}"))

    # shared identifiers (including the two DNA kinds above) -> union-find
    buckets = defaultdict(set)
    for e in active:
        for k, v in idents[e["id"]]:
            if k in CLUSTER_KINDS:
                buckets[(k, v)].add(e["id"])
    for (k, v), members in buckets.items():
        if len(members) >= 2:
            ms = sorted(members)
            for m in ms[1:]:
                uf.union(ms[0], m)
            for m in ms:
                via[m].add(VIA[k])

    cluster_of, csize = {}, {}
    for root, members in uf.groups().items():
        if len(members) >= 2:
            for m in members:
                cluster_of[m] = root
                csize[m] = len(members)

    # second pass: shared-infrastructure signal, final score, severity, stage
    results = {}
    for e in ents:
        s = list(sigs[e["id"]])
        k = csize.get(e["id"], 1) - 1
        kinds = sorted(via.get(e["id"], []))
        s.append(det.sig("shared_infrastructure", "Linked to other suspects", min(1.0, math.log2(k + 1) / 3) if k else 0.0, 15,
                         f"Linked to {k} other suspicious entit{'y' if k == 1 else 'ies'} through shared " + ", ".join(kinds) if k
                         else "Not linked to any other suspicious entity", {"linked": k, "via": kinds}))
        score = round(det.total(s), 1)
        lang = next((x for x in s if x["name"] == "scam_language"), None)
        cred = next((x for x in s if x["name"] == "credential_capture"), None)
        pays = any(kk == "payment" for kk, _ in idents[e["id"]])
        asks_pay = bool(lang and "asks for a payment or fee" in lang["evidence"].get("patterns", []))
        active_scam = pays or asks_pay or bool(cred and cred["strength"] >= 0.67)
        stage = stage_for(score, csize.get(e["id"], 1), active_scam) if e["status"] != "dismissed" else 1
        results[e["id"]] = {"signals": s, "idents": idents[e["id"]], "score": score, "severity": det.severity(score), "stage": stage,
                            "campaign_id": cluster_of.get(e["id"]), "cluster_size": csize.get(e["id"], 1), "linked_via": kinds}
    return {"results": results,
            "summary": {"entities": len(ents), "suspects": len(active), "campaigns": len(set(cluster_of.values()))}}


# -------------------------------------------------------------- campaigns ---

def campaign_status(members):
    live = [m for m in members if m["status"] != "dismissed"]
    if live and all(m["status"] == "reported" for m in live):
        return "reported"
    if any(m["status"] in ("confirmed", "reported") for m in live):
        return "confirmed"
    return "new"


def hypothesis(members, brand, kb):
    text = " ".join(det.entity_text(m) for m in members)
    corpus = sim.Corpus([brand.get("official_text", "")] + [k["text"] for k in kb] + [text])
    best = max(((corpus.cosine(text, k["text"]), k["label"]) for k in kb), default=(0.0, "Unknown"))
    return {"label": best[1], "match": round(best[0], 3)}


def attack_path(members, idents):
    socials = [m for m in members if m["type"] == "social"]
    sites = [m for m in members if m["type"] == "website"]
    apps = [m for m in members if m["type"] == "app"]

    def site_links(m):
        doms = {v for k, v in idents[m["id"]] if k == "domain"}
        return [s for s in sites if s["key"] in doms]

    steps = []
    if socials:
        entry = max(socials, key=lambda m: (len(site_links(m)) > 0, m["data"].get("followers", 0)))
        bio = (entry["data"].get("bio") or "")[:110]
        steps.append({"stage": "Lure", "title": f"{label_of(entry)} on {entry['platform'].title()}", "ids": [entry["id"]],
                      "detail": f"Posing as the brand: \"{bio}\"" if bio else "Posing as the brand"})
        tg = [v for k, v in idents[entry["id"]] if k == "telegram" and v != entry["data"].get("handle", "").lower()]
        if tg:
            steps.append({"stage": "Hand-off", "title": f"Moves the victim to Telegram @{tg[0]}", "ids": [entry["id"]],
                          "detail": "Conversations leave the platform where reports and moderation apply."})
        linked = site_links(entry)
        if linked:
            s = linked[0]
            steps.append({"stage": "Redirect", "title": f"Link to {s['key']}", "ids": [s["id"]],
                          "detail": f"Registered {s['data'].get('registered_days_ago', '?')} day(s) ago; " +
                                    ("asks for card details and OTP." if any(k in det.entity_text(s).lower() for k in ("otp", "cvv")) else "imitates the brand.")})
    elif sites:
        s = sites[0]
        steps.append({"stage": "Redirect", "title": f"{s['key']}", "ids": [s["id"]], "detail": "Look-alike website."})
    if apps:
        a = apps[0]
        extra = sorted(set(a["data"].get("permissions", [])) & det.RISKY_PERMS)
        steps.append({"stage": "Install", "title": f"Fake app \"{a['data'].get('title', a['key'])}\"", "ids": [a["id"]],
                      "detail": "Sideloaded; requests " + (", ".join(extra[:3]) if extra else "unusual access") + "."})
    pay = [(m, v) for m in members for k, v in idents[m["id"]] if k == "payment"]
    if pay:
        steps.append({"stage": "Payment", "title": f"Victim is asked to pay {pay[0][1]}", "ids": sorted({m["id"] for m, _ in pay}),
                      "detail": f"{len({m['id'] for m, _ in pay})} entities point to this payment ID."})
    elif sites:
        steps.append({"stage": "Credentials", "title": "Card details and OTP captured", "ids": [sites[0]["id"]],
                      "detail": "Entered on the look-alike page."})
    steps.append({"stage": "Victim", "title": "Money or credentials are taken", "ids": [], "detail": "The customer blames the brand."})
    return steps


def forecast(members, now=None):
    """Transparent projection: the last 7 days' pace repeats. Not a model, an estimate."""
    now = now or time.time()
    ages = [(now - m["first_seen"]) / DAY for m in members]
    last7 = [m for m, a in zip(members, ages) if a <= 7]
    prev7 = [m for m, a in zip(members, ages) if 7 < a <= 14]
    mix = Counter(m["type"] for m in last7)
    return {"window_days": 7, "recent": len(last7), "previous": len(prev7), "predicted": dict(mix), "predicted_total": len(last7),
            "next7": len(last7),
            "trend": "accelerating" if len(last7) > len(prev7) else "steady" if len(last7) == len(prev7) else "slowing",
            "is_estimate": True,
            "basis": f"{len(last7)} new entities in the last 7 days vs {len(prev7)} in the 7 days before; assumes the pace repeats."}


def timeline(members, now=None):
    now = now or time.time()
    items = sorted(members, key=lambda m: m["first_seen"])
    events = [{"id": m["id"], "label": label_of(m), "type": m["type"], "days_ago": round((now - m["first_seen"]) / DAY, 1)} for m in items]
    span = int(max([ev["days_ago"] for ev in events] + [1])) + 1
    series = [{"days_ago": d, "total": sum(1 for ev in events if ev["days_ago"] >= d)} for d in range(span, -1, -1)]
    return {"events": events, "series": series}


def shared_identifiers(members, idents):
    buckets = defaultdict(set)
    for m in members:
        for k, v in idents[m["id"]]:
            if k in CLUSTER_KINDS:
                buckets[(k, v)].add(m["id"])
    shared = [{"kind": k, "value": v, "label": ident_display(k, v)[0], "display": ident_display(k, v)[1], "count": len(ids), "ids": sorted(ids)}
              for (k, v), ids in buckets.items() if len(ids) >= 2]
    shared.sort(key=lambda s: (-s["count"], s["kind"], s["value"]))
    return shared


def build_campaign(cid, members, idents, brand, kb, full=True, now=None):
    """members: entity dicts of one campaign (already ordered by score desc); idents: {entity_id: [(kind, value)]}."""
    if not members:
        return None
    now = now or time.time()
    scores = [m["score"] for m in members]
    counts = Counter(m["type"] for m in members)
    plat = Counter(m["platform"] for m in members if m["type"] == "social")
    risk = round(min(100, 0.7 * max(scores) + 0.3 * (sum(scores) / len(scores)) + 1.5 * min(len(scores) - 1, 6)))
    shared = shared_identifiers(members, idents)
    audience = sum(m["data"].get("followers", 0) for m in members if m["type"] == "social")
    installs = sum(m["data"].get("installs", 0) for m in members if m["type"] == "app")
    out = {
        "id": cid, "brand_id": brand["id"], "label": f"Campaign C-{cid}",
        "size": len(members), "counts": dict(counts), "platforms": dict(plat),
        "risk": risk, "severity": det.severity(risk), "stage": max(m["stage"] for m in members),
        "stage_name": STAGES[max(m["stage"] for m in members) - 1],
        "status": campaign_status(members),
        "first_seen_days": round(max((now - m["first_seen"]) / DAY for m in members), 1),
        "last_seen_days": round(min((now - m["first_seen"]) / DAY for m in members), 1),
        "shared": shared, "hypothesis": hypothesis(members, brand, kb),
        "blast_radius": {"entities": len(members), "channels": len(counts) + len(plat), "followers": audience, "installs": installs,
                         "is_estimate": True,
                         "note": "Sum of public follower and install counts across the linked entities. People may overlap, and most followers are not victims. Treat as an upper bound on exposure, not a victim count."},
    }
    if full:
        out["members"] = [member_summary(m, now) for m in members]
        out["path"] = attack_path(members, idents)
        out["forecast"] = forecast(members, now)
        out["timeline"] = timeline(members, now)
    return out


def member_summary(m, now=None):
    return {"id": m["id"], "type": m["type"], "platform": m["platform"], "label": label_of(m), "url": url_of(m), "score": m["score"],
            "severity": m["severity"], "stage": m["stage"], "stage_name": STAGES[m["stage"] - 1], "status": m["status"],
            "campaign_id": m["campaign_id"], "source": m["source"], "age_days": round(age_days(m, now), 1), "logo": m["data"].get("logo")}


# ------------------------------------------------------------------ graph ---

def build_graph(members, idents, signals, brand, campaign_id=None, with_forecast=False, now=None):
    """signals: {entity_id: {signal_name: strength}}. Returns nodes/edges without coordinates (see engine.layout)."""
    by_key = {m["key"]: m for m in members if m["type"] == "website"}
    nodes = [{"id": "brand", "kind": "brand", "label": brand["name"], "sub": "Official brand"}]
    edges = []
    for m in members:
        sg = signals.get(m["id"], {})
        nodes.append({"id": f"e{m['id']}", "eid": m["id"], "kind": m["type"], "label": label_of(m), "sub": m["platform"],
                      "score": m["score"], "severity": m["severity"], "stage": m["stage"], "campaign_id": m["campaign_id"]})
        if max(sg.get("name_similarity", 0), sg.get("logo_similarity", 0)) >= 0.6:
            edges.append({"source": "brand", "target": f"e{m['id']}", "kind": "impersonates", "label": "impersonates"})
    buckets = defaultdict(set)
    for m in members:
        for k, v in idents[m["id"]]:
            if k in CLUSTER_KINDS:
                buckets[(k, v)].add(m["id"])
    for (k, v), ids in sorted(buckets.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        if len(ids) < 2:
            continue
        if k == "domain" and v in by_key:
            site = by_key[v]
            for i in sorted(ids):
                if i != site["id"]:
                    src = next(x for x in members if x["id"] == i)
                    edges.append({"source": f"e{i}", "target": f"e{site['id']}", "kind": "links_to",
                                  "label": "contacts" if src["type"] == "app" else "links to"})
            continue
        hid = f"i:{k}:{v}"
        nodes.append({"id": hid, "kind": "identifier", "ident_kind": k, "label": ident_display(k, v)[1], "sub": ident_display(k, v)[0], "count": len(ids)})
        for i in sorted(ids):
            edges.append({"source": f"e{i}", "target": hid, "kind": "uses", "label": "uses"})
    if with_forecast and campaign_id:
        f = forecast(members, now)
        hubs = [n for n in nodes if n["kind"] == "identifier"]
        anchor = max(hubs, key=lambda n: n["count"])["id"] if hubs else (nodes[1]["id"] if len(nodes) > 1 else "brand")
        n = 0
        for t, c in sorted(f["predicted"].items()):
            for _ in range(min(c, 4)):
                n += 1
                nodes.append({"id": f"p{n}", "kind": t, "label": f"predicted {t}", "sub": "estimate", "predicted": True})
                edges.append({"source": f"p{n}", "target": anchor, "kind": "predicted", "label": "predicted", "predicted": True})
    return {"nodes": nodes, "edges": edges}
