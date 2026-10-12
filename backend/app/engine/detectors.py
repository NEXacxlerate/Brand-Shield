"""Detectors. Each returns a list of signals; every signal carries its own reason.

A signal is {name, label, strength 0..1, weight, points, reason, evidence}.
points = strength * weight. The risk score is the sum of points, capped at 100.
The weights are hand-set (documented in the README), not learned.
"""
import re

from . import similarity as sim
from ..config import settings
from .ids import domain_of, is_official_domain

RISKY_PERMS = {
    "READ_SMS", "RECEIVE_SMS", "SEND_SMS", "READ_CONTACTS", "READ_CALL_LOG",
    "SYSTEM_ALERT_WINDOW", "BIND_ACCESSIBILITY_SERVICE", "REQUEST_INSTALL_PACKAGES",
    "RECORD_AUDIO", "READ_PHONE_STATE",
}
SHORTENERS = {"bit.ly", "tinyurl.com", "cutt.ly", "t.co", "rb.gy", "is.gd", "shorturl.at"}

SCAM_PATTERNS = [
    ("asks for a payment or fee", r"(pay|send|transfer)\s+(a\s+)?(small\s+)?(₹|rs\.?|inr|\$)?\s?\d+|processing fee|verification fee|registration fee"),
    ("pushes you to DM or call", r"\bdm\b|\bwhatsapp\b|call (us|now)|\bcall\s*\+?\d"),
    ("creates urgency", r"within \d+ hours|immediately|limited time|last chance|expires|will be blocked|be suspended|closes in|account will be"),
    ("asks for OTP, PIN or card details", r"\botp\b|\bpin\b|\bcvv\b|card number|password|customer id"),
    ("claims to be official", r"\bofficial\b"),
    ("promises a refund or prize", r"\brefunds?\b|giveaway|win ₹|\breward|cashback"),
]
FAN_RE = re.compile(r"\b(fan\s*page|unofficial|parody|not\s+affiliated|fan\s*club)\b", re.I)
CRED_WORDS = ["otp", "cvv", "card number", "pin", "password", "customer id", "net banking", "netbanking", "aadhaar"]


def sig(name, label, strength, weight, reason, evidence=None):
    strength = max(-1.0, min(1.0, float(strength)))
    return {"name": name, "label": label, "strength": round(strength, 3), "weight": weight,
            "points": round(strength * weight, 1), "reason": reason, "evidence": evidence or {}}


def entity_text(e: dict) -> str:
    d = e["data"]
    parts = [d.get("display_name", ""), d.get("bio", ""), " ".join(d.get("posts", [])),
             d.get("title", ""), d.get("text", ""), d.get("description", ""), d.get("title_text", "")]
    return " ".join(p for p in parts if p).strip()


class Ctx:
    """Everything a detector needs to know about the brand and the corpus."""

    def __init__(self, brand, corpus, kb):
        self.brand = brand
        self.corpus = corpus
        self.kb = kb
        self.official_text = brand.get("official_text", "")
        self._hash = {}
        self.brand_hash = self.hash_of(brand.get("logo")) if brand.get("logo") else None
        self.suspect_sites = set()

    def hash_of(self, fname):
        if not fname:
            return None
        if fname not in self._hash:
            p = settings.logo_dir / fname
            try:
                self._hash[fname] = sim.dhash(str(p)) if p.exists() else None
            except Exception:
                self._hash[fname] = None
        return self._hash[fname]


# ------------------------------------------------------------ shared bits ---

def logo_signal(ctx, e, weight, what):
    fname = e["data"].get("logo")
    h = ctx.hash_of(fname)
    if h is None or ctx.brand_hash is None:
        return None
    s = sim.logo_similarity(h, ctx.brand_hash)
    strength = sim.ramp(s, 0.75, 0.95)
    reason = (f"{what} is {s:.0%} similar to the official logo" if strength > 0
              else f"{what} does not match the official logo ({s:.0%})")
    return sig("logo_similarity", "Logo match", strength, weight, reason,
               {"similarity": round(s, 3), "hamming_bits": sim.hamming(h, ctx.brand_hash), "file": fname})


def language_signal(ctx, text, weight):
    text = re.sub(r"never ask[^.]*\.?", "", text or "", flags=re.I)
    hits = [label for label, pat in SCAM_PATTERNS if re.search(pat, text, re.I)]
    best_kb, best_cos = None, 0.0
    for k in ctx.kb:
        c = ctx.corpus.cosine(text, k["text"])
        if c > best_cos:
            best_kb, best_cos = k["label"], c
    kb_strength = sim.ramp(best_cos, 0.2, 0.55)
    strength = max(min(1.0, len(hits) / 4), kb_strength)
    bits = []
    if hits:
        bits.append("; ".join(hits[:4]))
    if kb_strength > 0:
        bits.append(f"{best_cos:.0%} similar to the known '{best_kb}' script")
    reason = ("Scam wording: " + " | ".join(bits)) if bits else "No scam wording found"
    return sig("scam_language", "Scam language", strength, weight, reason,
               {"patterns": hits, "closest_script": best_kb, "script_similarity": round(best_cos, 3)})


def copied_signal(ctx, text, weight):
    c = ctx.corpus.cosine(text, ctx.official_text)
    strength = sim.ramp(c, 0.2, 0.6)
    reason = (f"Copies the brand's official wording ({c:.0%} text overlap)" if strength > 0
              else "Does not copy the brand's official wording")
    return sig("copied_content", "Copied content", strength, weight, reason, {"overlap": round(c, 3)})


def age_strength(days):
    if days is None:
        return 0.0
    return 1.0 if days <= 7 else 0.75 if days <= 30 else 0.4 if days <= 90 else 0.1 if days <= 365 else 0.0


# ----------------------------------------------------------------- social ---

def social_signals(e, ctx):
    d, brand, out = e["data"], ctx.brand, []
    # 1. name
    cands = [(d.get("handle", ""), "handle"), (d.get("display_name", ""), "display name")]
    best = max(((sim.name_match(c, brand), w) for c, w in cands if c), key=lambda x: x[0]["strength"],
               default=({"strength": 0, "reason": "No name", "kind": "none", "evidence": {}}, "handle"))
    m, which = best
    out.append(sig("name_similarity", "Name similarity", m["strength"], 18,
                   f"Account {which}: {m['reason']}" if m["strength"] else "Handle and display name do not resemble the brand",
                   m["evidence"]))
    # 2. logo
    s = logo_signal(ctx, e, 20, "Profile picture")
    if s:
        out.append(s)
    # 3. age
    days = d.get("created_days_ago")
    out.append(sig("account_age", "Account age", age_strength(days), 10,
                   f"Account created {days} day(s) ago" if days is not None else "Account age unknown",
                   {"days": days}))
    # 4. language + 5. copied
    text = entity_text(e)
    out.append(language_signal(ctx, text, 15))
    out.append(copied_signal(ctx, d.get("bio", ""), 8))
    # 6. links
    best_l = (0.0, None, "No suspicious links in bio or posts")
    for u in d.get("links", []):
        dom = domain_of(u)
        if not dom or is_official_domain(dom, ctx.brand):
            continue
        if dom in SHORTENERS:
            cand = (0.4, dom, f"Uses link shortener {dom}")
        elif dom in ctx.suspect_sites:
            cand = (0.9, dom, f"Links to {dom}, a suspicious look-alike site found in this scan")
        else:
            nm = sim.name_match(sim.registrable_label(dom), ctx.brand)
            cand = (nm["strength"] * 0.9, dom, f"Links to {dom}: {nm['reason']}") if nm["strength"] else (0.0, dom, "")
        if cand[0] > best_l[0]:
            best_l = cand
    out.append(sig("suspicious_links", "Suspicious links", best_l[0], 10, best_l[2], {"domain": best_l[1]}))
    # 7. behaviour
    followers, following = d.get("followers", 0), d.get("following", 0)
    b, why = 0.0, []
    if following > 300 and following > 10 * max(followers, 1):
        b += 0.5
        why.append(f"follows {following} accounts but has {followers} followers")
    if d.get("posts_last_7d", 0) >= 30:
        b += 0.5
        why.append(f"{d['posts_last_7d']} posts in 7 days")
    out.append(sig("behaviour", "Behaviour", b, 6, "Unusual behaviour: " + ", ".join(why) if why else "Normal posting behaviour",
                   {"followers": followers, "following": following}))
    # 8. fan / parody disclaimer lowers risk
    if FAN_RE.search(d.get("bio", "")):
        out.append(sig("fan_disclaimer", "Declares itself unofficial", 1.0, -20,
                       "Bio says it is a fan page or not affiliated. Lowers the score; review before reporting."))
    return out


# ---------------------------------------------------------------- website ---

def website_signals(e, ctx):
    d, out = e["data"], []
    dom = d.get("domain") or e["key"]
    nm = sim.name_match(sim.registrable_label(dom), ctx.brand)
    out.append(sig("name_similarity", "Name similarity", nm["strength"], 22,
                   f"Domain {dom}: {nm['reason']}" if nm["strength"] else f"Domain {dom} does not resemble the brand",
                   nm["evidence"]))
    days = d.get("registered_days_ago")
    out.append(sig("domain_age", "Domain age", age_strength(days) if days is not None else 0, 14,
                   f"Domain registered {days} day(s) ago" if days is not None else "Domain age unknown", {"days": days}))
    text = entity_text(e)
    mention = 0.6 if re.search(r"|".join(re.escape(t) for t in [ctx.brand["name"], *ctx.brand.get("aliases", [])]), text, re.I) else 0.0
    cosv = ctx.corpus.cosine(text, ctx.official_text)
    pc = max(mention, sim.ramp(cosv, 0.15, 0.5))
    out.append(sig("page_brand_copy", "Page imitates brand", pc, 15,
                   "Page uses the brand's name and wording" if pc else "Page does not imitate the brand",
                   {"mentions_brand": bool(mention), "overlap": round(cosv, 3)}))
    low = text.lower()
    found = [w for w in CRED_WORDS if re.search(r"\b" + re.escape(w) + r"\b", low)]
    out.append(sig("credential_capture", "Asks for credentials", min(1.0, len(found) / 3), 12,
                   "Page asks for: " + ", ".join(found) if found else "No credential prompts found", {"found": found}))
    infra, why = 0.0, []
    if d.get("has_mx"):
        infra += 0.3
        why.append("has an MX record (can send email as the brand)")
    cd = d.get("cert_issued_days_ago")
    if cd is not None and cd <= 14:
        infra += 0.5
        why.append(f"TLS certificate issued {cd} day(s) ago")
    out.append(sig("infrastructure", "Infrastructure", infra, 6,
                   "Domain " + " and ".join(why) if why else "No infrastructure red flags", {"mx": d.get("has_mx"), "cert_days": cd}))
    out.append(language_signal(ctx, text, 8))
    s = logo_signal(ctx, e, 8, "Page logo")
    if s:
        out.append(s)
    return out


# -------------------------------------------------------------------- app ---

def app_signals(e, ctx):
    d, brand, out = e["data"], ctx.brand, []
    pkg = d.get("package", e["key"])
    cands = [sim.name_match(d.get("title", ""), brand), sim.name_match(pkg.replace("com.", "", 1), brand)]
    m = max(cands, key=lambda x: x["strength"])
    out.append(sig("name_similarity", "Name similarity", m["strength"], 18,
                   f"App name or package: {m['reason']}" if m["strength"] else "App name does not resemble the brand", m["evidence"]))
    s = logo_signal(ctx, e, 15, "App icon")
    if s:
        out.append(s)
    dev_ok = d.get("developer", "") in brand.get("developers", [])
    cert_ok = d.get("cert_sha256") and d.get("cert_sha256") == brand.get("cert_sha256")
    dv, why = 0.0, []
    if not dev_ok:
        dv += 0.6
        why.append(f"developer '{d.get('developer', 'unknown')}' is not the brand's")
    if not cert_ok:
        dv += 0.4
        why.append("signing certificate differs from the official app")
    out.append(sig("developer_mismatch", "Developer / signing", dv, 10, "Unofficial publisher: " + "; ".join(why) if why else "Developer and certificate match",
                   {"developer": d.get("developer"), "cert": d.get("cert_sha256")}))
    extra = sorted((set(d.get("permissions", [])) & RISKY_PERMS) - set(brand.get("permissions", [])))
    out.append(sig("risky_permissions", "Risky permissions", min(1.0, len(extra) / 3), 15,
                   "Requests permissions the official app does not: " + ", ".join(extra) if extra else "No unexpected risky permissions",
                   {"extra": extra}))
    best = (0.0, "No suspicious endpoints")
    for u in d.get("urls", []):
        dom = domain_of(u)
        if not dom or is_official_domain(dom, brand):
            continue
        if re.fullmatch(r"\d+\.\d+\.\d+\.\d+", dom):
            cand = (0.5, f"Contacts a raw IP address ({dom})")
        elif dom in ctx.suspect_sites:
            cand = (0.9, f"Contacts {dom}, a suspicious look-alike site found in this scan")
        else:
            n2 = sim.name_match(sim.registrable_label(dom), brand)
            cand = (n2["strength"] * 0.9, f"Contacts {dom}: {n2['reason']}") if n2["strength"] else (0.0, "")
        if cand[0] > best[0]:
            best = cand
    out.append(sig("suspicious_endpoints", "Suspicious endpoints", best[0], 12, best[1], {}))
    dist, why = 0.0, []
    if d.get("store") != "play":
        dist += 0.5
        why.append("installed from outside the official store")
    if d.get("installs", 10 ** 6) < 1000:
        dist += 0.3
        why.append(f"only {d.get('installs')} installs")
    if (d.get("released_days_ago") or 999) <= 14:
        dist += 0.2
        why.append("released in the last 14 days")
    out.append(sig("distribution", "Distribution", dist, 6, "App is " + ", ".join(why) if why else "Distributed through normal channels", {}))
    return out


def base_signals(e, ctx):
    return {"social": social_signals, "website": website_signals, "app": app_signals}[e["type"]](e, ctx)


def total(sigs):
    return max(0.0, min(100.0, sum(s["points"] for s in sigs)))


def severity(score):
    return "critical" if score >= 80 else "high" if score >= 60 else "medium" if score >= 40 else "low"
