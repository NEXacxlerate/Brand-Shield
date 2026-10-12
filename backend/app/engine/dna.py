"""Attack DNA: the six signal families, closest known playbooks, side-by-side wording and the campaign map."""
import re

import numpy as np

from . import detectors as det
from . import similarity as sim
from .analysis import label_of

FAMILIES = ["Identity", "Visual", "Language", "Behaviour", "Infrastructure", "Network"]
NOTE = "Similarity is a text comparison, not a probability that the case is that scam."


def _mean(xs):
    xs = list(xs)
    return sum(xs) / len(xs) if xs else 0.0


def _label(strength):
    return "Strong" if strength >= 0.75 else "Medium" if strength >= 0.4 else "Weak"


def families(members, sig, idents, shared):
    """sig: {entity_id: {signal_name: strength}}. Returns the six families with an evidence sentence each."""
    n = len(members) or 1
    ids = [m["id"] for m in members]

    def s(i, name):
        return sig.get(i, {}).get(name, 0.0)

    kinds = {k: [x for x in shared if x["kind"] == k] for k in ("logo", "script", "payment", "phone", "telegram", "email", "domain", "cert")}
    has_logo = sum(1 for i in ids if any(k == "logo" for k, _ in idents[i]))
    has_script = sum(1 for i in ids if any(k == "script" for k, _ in idents[i]))
    ident = _mean(s(i, "name_similarity") for i in ids)
    visual = _mean(1.0 if any(k == "logo" for k, _ in idents[i]) else s(i, "logo_similarity") for i in ids)
    lang = max(_mean(s(i, "scam_language") for i in ids), has_script / n)
    behaviour = _mean(max(s(i, "behaviour"), s(i, "account_age")) for i in ids)
    infra_names = ("domain_age", "infrastructure", "suspicious_links", "suspicious_endpoints", "developer_mismatch")
    infra_shared = {x_id for k in ("domain", "cert") for x in kinds[k] for x_id in x["ids"]}
    infra = max(_mean(max(s(i, nm) for nm in infra_names) for i in ids), len(infra_shared) / n)
    net_ids = {x_id for k in ("payment", "phone", "telegram", "email") for x in kinds[k] for x_id in x["ids"]}
    network = len(net_ids) / n
    pays = [x["value"] for x in kinds["payment"]]
    tgs = [x["value"] for x in kinds["telegram"]]
    evidence = {
        "Identity": f"{sum(1 for i in ids if s(i, 'name_similarity') >= 0.6)} of {n} names read as the brand once look-alikes are normalised",
        "Visual": (f"{has_logo} entities use the same edited copy of the official logo" if has_logo
                   else f"{sum(1 for i in ids if s(i, 'logo_similarity') > 0)} of {n} images resemble the official logo"),
        "Language": (f"{has_script} entities share a near-identical scam script; " if has_script else "")
                    + f"{sum(1 for i in ids if s(i, 'scam_language') >= 0.5)} of {n} use scam wording",
        "Behaviour": f"{sum(1 for i in ids if s(i, 'account_age') >= 0.75)} of {n} are less than 30 days old; "
                     f"{sum(1 for i in ids if s(i, 'behaviour') > 0)} show unusual posting or following",
        "Infrastructure": (f"{len(kinds['domain'])} shared domain(s), {len(kinds['cert'])} shared signing certificate(s)"
                           if (kinds["domain"] or kinds["cert"]) else "No shared domain or certificate; infrastructure signals come from the entities themselves"),
        "Network": (f"Payment ID {', '.join(pays[:2])}" if pays else "No shared payment ID")
                   + (f"; Telegram {', '.join(tgs[:2])}" if tgs else "")
                   + f"; {len(net_ids)} of {n} entities are linked through a shared contact or payment identifier",
    }
    vals = {"Identity": ident, "Visual": visual, "Language": lang, "Behaviour": behaviour, "Infrastructure": infra, "Network": network}
    return [{"name": f, "strength": round(min(1.0, vals[f]), 3), "label": _label(vals[f]), "evidence": evidence[f]} for f in FAMILIES]


def _risk_for(similarity):
    return "critical" if similarity >= 0.40 else "high" if similarity >= 0.25 else "medium" if similarity >= 0.15 else "low"


def closest_playbooks(text, kb, brand, limit=4):
    corpus = sim.Corpus([brand.get("official_text", "")] + [k["text"] for k in kb] + [text])
    out = []
    for k in kb:
        c = corpus.cosine(text, k["text"])
        traits = [label for label, pat in det.SCAM_PATTERNS if re.search(pat, k["text"], re.I) and re.search(pat, text, re.I)]
        out.append({"playbook": k["label"], "similarity": round(c, 3), "risk": _risk_for(c), "traits": traits})
    out.sort(key=lambda x: -x["similarity"])
    return out[:limit]


_WORD = re.compile(r"[\w₹']+")


def side_by_side(known, case):
    """Highlight what the two texts share: maximal common word runs (>=2 words) plus shared significant single words."""
    a = [w.lower() for w in _WORD.findall(known)]
    b = [w.lower() for w in _WORD.findall(case)]
    runs = {}
    for i in range(len(a)):
        for j in range(len(b)):
            k = 0
            while i + k < len(a) and j + k < len(b) and a[i + k] == b[j + k]:
                k += 1
            if k >= 2 and (i == 0 or j == 0 or a[i - 1] != b[j - 1]):
                runs[" ".join(a[i:i + k])] = k
    phrases = sorted(runs, key=lambda p: (-runs[p], p))
    kept = []
    for p in phrases:
        if not any(p in q for q in kept):
            kept.append(p)
    covered = " ".join(kept)
    singles = sorted({w for w in a if w in set(b) and w not in sim.STOP and len(w) > 3 and w not in covered})
    return {"known": known, "case": case, "shared_tokens": kept + singles}


def campaign_text(members):
    return " ".join(det.entity_text(m) for m in members)


def best_case_text(members):
    socials = [m for m in members if m["type"] == "social"] or members
    best = max(socials, key=lambda m: (m["score"], -m["id"]))
    return best["data"].get("bio") or det.entity_text(best), label_of(best)


def campaign_map(kb, campaigns, current_id, brand):
    """2-D TruncatedSVD (numpy) of the TF-IDF matrix of playbooks + this brand's campaigns. Coordinates are normalised to 0..1.

    campaigns: [{id, text}]
    """
    docs = [(k["label"], k["text"], "playbook", None) for k in kb] + [(f"C-{c['id']}", c["text"], "campaign", c["id"]) for c in campaigns]
    if len(docs) < 3:
        return []
    corpus = sim.Corpus([brand.get("official_text", "")] + [d[1] for d in docs])
    vecs = [corpus.vec(d[1]) for d in docs]
    vocab = sorted({w for v in vecs for w in v})
    if not vocab:
        return []
    col = {w: i for i, w in enumerate(vocab)}
    X = np.zeros((len(docs), len(vocab)))
    for r, v in enumerate(vecs):
        for w, x in v.items():
            X[r, col[w]] = x
    U, S, Vt = np.linalg.svd(X, full_matrices=False)
    k = min(2, len(S))
    for j in range(k):                     # fix the sign so the layout never flips between runs
        if U[np.argmax(np.abs(U[:, j])), j] < 0:
            U[:, j] *= -1
    P = U[:, :k] * S[:k]
    if k < 2:
        P = np.hstack([P, np.zeros((len(docs), 1))])
    lo, hi = P.min(axis=0), P.max(axis=0)
    P = (P - lo) / np.maximum(hi - lo, 1e-9)
    pb = [(i, d) for i, d in enumerate(docs) if d[2] == "playbook"]
    out = []
    for i, d in enumerate(docs):
        if d[2] == "playbook":
            cluster = d[0]
        else:       # a campaign sits in the cluster of the playbook it is closest to
            cluster = max(pb, key=lambda t: corpus.cosine(d[1], t[1][1]))[1][0]
        out.append({"x": round(float(P[i, 0]), 4), "y": round(float(P[i, 1]), 4), "cluster": cluster, "label": d[0],
                    "kind": d[2], "current": d[3] == current_id})
    return out
