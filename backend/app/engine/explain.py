"""Explanations.

Summaries are built from computed facts. If LLM_API_KEY is set, an OpenAI-compatible endpoint
(Groq, Gemini, OpenRouter...) rewrites the facts into prose; it is told not to add anything.
Without a key (or if the call fails) the rule-based text is used, so the app never depends on it.
"""
import hashlib
import re

import httpx

from ..config import settings
from . import analysis
from .ids import extract_from_text

_CACHE: dict = {}


def _llm(facts: str):
    key = settings.llm_api_key
    if not key:
        return None
    h = hashlib.sha1(facts.encode()).hexdigest()
    if h in _CACHE:
        return _CACHE[h]
    base = settings.llm_base_url.rstrip("/")
    try:
        r = httpx.post(f"{base}/chat/completions", timeout=15, headers={"Authorization": f"Bearer {key}"}, json={
            "model": settings.llm_model, "temperature": 0.2, "max_tokens": 300,
            "messages": [
                {"role": "system", "content": "You are a fraud analyst writing a short incident summary for a brand security team. "
                 "Use ONLY the facts provided. Do not invent names, numbers or events. Label any prediction as an estimate. Maximum 90 words, plain prose."},
                {"role": "user", "content": facts}]})
        r.raise_for_status()
        text = r.json()["choices"][0]["message"]["content"].strip()
        _CACHE[h] = text
        return text
    except Exception:
        return None


def entity_summary(e, signals, brand, campaign=None):
    top = [s for s in sorted(signals, key=lambda s: -s["points"]) if s["points"] > 0][:3]
    label = analysis.label_of(e)
    verb = ("is very likely impersonating" if e["score"] >= 80 else "is likely impersonating" if e["score"] >= 60
            else "may be impersonating" if e["score"] >= 40 else "shows weak signs of impersonating")
    text = f"{label} {verb} {brand['name']} (risk {round(e['score'])}/100). " + (
        "Main reasons: " + "; ".join(s["reason"] for s in top) + "." if top else "No strong signals were found.")
    if any(s["name"] == "fan_disclaimer" for s in signals):
        text += " It says it is unofficial, so review before reporting."
    if campaign:
        text += f" It is part of {campaign['label']} with {campaign['size'] - 1} other linked entities."
    ai = _llm(text)
    return {"text": ai or text, "source": "ai" if ai else "rules", "facts": text}


def campaign_summary(c, brand=None):
    counts = ", ".join(f"{n} {t}{'s' if n > 1 else ''}" for t, n in c["counts"].items())

    def phrase(s):
        if s["kind"] == "logo":
            return f"{s['count']} entities use the same edited copy of the logo"
        if s["kind"] == "script":
            return f"{s['count']} entities use a near-identical scam script"
        return f"{s['count']} entities share the {s['label'].lower()} {s['value']}"
    shared = "; ".join(phrase(s) for s in c["shared"][:3]) or "similar content"
    f = c.get("forecast") or {}
    text = (f"{c['label']} links {c['size']} entities ({counts}). {shared}. "
            f"Closest known playbook: {c['hypothesis']['label']} (text match {round(c['hypothesis']['match'] * 100)}%). "
            f"First seen {c['first_seen_days']:.0f} days ago; {f.get('recent', 0)} new entities appeared in the last 7 days ({f.get('trend', 'steady')}). "
            f"The linked profiles have about {c['blast_radius']['followers']:,} followers in total (an estimate of exposure, not a victim count).")
    ai = _llm(text)
    return {"text": ai or text, "source": "ai" if ai else "rules", "facts": text}


def recommended_actions(c, members):
    """members: member summaries (label/type/platform/status). Every action needs human approval."""
    acts = []
    by_platform: dict = {}
    for m in members:
        if m["type"] == "social" and m["status"] != "dismissed":
            by_platform.setdefault(m["platform"], []).append(m["label"])
    for p, hs in by_platform.items():
        acts.append({"action": f"Report {len(hs)} {p.title()} profile(s) for impersonation: {', '.join(hs[:4])}{'...' if len(hs) > 4 else ''}", "kind": "report"})
    sites = [m["label"] for m in members if m["type"] == "website" and m["status"] != "dismissed"]
    if sites:
        acts.append({"action": f"Send abuse reports to the registrar and host of {', '.join(sites)}; ask for browser blocklisting", "kind": "takedown"})
    apps = [m["label"] for m in members if m["type"] == "app" and m["status"] != "dismissed"]
    if apps:
        acts.append({"action": f"Report {', '.join(apps)} to Google Play Protect and the host site", "kind": "takedown"})
    pays = [s["value"] for s in c["shared"] if s["kind"] == "payment"]
    if pays:
        acts.append({"action": f"Give the payment ID(s) {', '.join(pays)} to the bank's fraud team", "kind": "finance"})
    acts.append({"action": "Warn customers on official channels about the fake accounts", "kind": "comms"})
    for a in acts:
        a["needs_approval"] = True
    return acts


def classify_clue(clue: str):
    c = clue.strip()
    if re.fullmatch(r"@?[\w.]{3,30}", c) and not re.search(r"\.(com|in|net|org|shop|online|xyz|co|info|app|store|site)$", c, re.I):
        return "handle"
    if re.fullmatch(r"https?://\S+|(?:[\w-]+\.)+[a-z]{2,}(?:/\S*)?", c, re.I):
        return "domain"
    if len(c.split()) <= 4 and extract_from_text(c, {}):
        return "identifier"
    return "text"
