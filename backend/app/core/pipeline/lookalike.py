"""Look-alike Lab: runs the live matcher on a typed name against the brand, and the labelled test-case runner.

Same engine and same Settings (rules, impersonation words) as a real scan. Pure and side-effect free except for
the stored test cases. In a real scan the name alone never decides: logo, bio, publisher and account signals are
scored too, and only an exact official handle / URL / package id excludes a candidate.
"""

from __future__ import annotations

import re
import threading

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config.time import iso_z, utcnow
from app.core.engine.domain_match import analyze_domain, make_domain_matcher, normalize_url, official_registrables
from app.core.engine.name_match import BRAND_NAME, FLAGGED, TECHNIQUE_LABELS
from app.core.engine.normalize import LEET_DIGITS, fold_text, prepare
from app.core.pipeline.matching import RULE_LABELS, TECHNIQUE_RULE, BrandAllowlist, apply_rules, build_matcher
from app.models import Brand, LookalikeCase
from app.services import app_settings

VERDICTS = ("flagged", "not_flagged", "official")

def default_cases(brand_name: str) -> list[tuple[str, str]]:
    """12 labelled cases (7 look-alikes, 3 other businesses, 2 official) built from the brand's own name.

    For "Acme Bank": acrnebank, Acme Bank Support, acme-bank, A C M E Bank, acm3bank, Acme Bnak, acmebank_official,
    Acme Bakery / Hotels / Weather, Acme Bank, @acmebank. They are not filtered by what the matcher says: a failing case is information.
    """
    tokens = [t for t in re.split(r"\s+", brand_name.strip()) if t] or ["Brand"]
    name = " ".join(tokens)
    compact = re.sub(r"[^a-z0-9]", "", name.lower()) or "brand"
    first = tokens[0]

    def swap_glyph(text: str) -> str:
        # visual digraphs first (m -> rn), then look-alike letters from other alphabets (Cyrillic o / a / e / i)
        for a_, b_ in (("m", "rn"), ("w", "vv"), ("d", "cl"), ("o", "о"), ("a", "а"), ("e", "е"), ("i", "і")):
            if a_ in text:
                return text.replace(a_, b_, 1)
        return text + "а"

    def digit_swap(text: str) -> str:
        for ch, d in (("e", "3"), ("a", "4"), ("o", "0"), ("i", "1")):
            if ch in text:
                return text.replace(ch, d, 1)
        return text + "1"

    last = tokens[-1]
    transposed = (last[0] + last[2] + last[1] + last[3:]) if len(last) >= 3 else last  # Bank -> Bnak
    separated = "-".join(t.lower() for t in tokens) if len(tokens) > 1 else compact[: len(compact) // 2] + "-" + compact[len(compact) // 2:]
    spaced = " ".join(tokens[0].upper()) + (" " + " ".join(tokens[1:]) if len(tokens) > 1 else "")
    cases = [
        (swap_glyph(compact), "flagged"),
        (f"{name} Support", "flagged"),
        (separated, "flagged"),
        (spaced, "flagged"),
        (digit_swap(compact), "flagged"),
        (" ".join([*tokens[:-1], transposed]), "flagged"),
        (f"{compact}_official", "flagged"),
        (f"{first} Bakery", "not_flagged"),
        (f"{first} Hotels", "not_flagged"),
        (f"{first} Weather", "not_flagged"),
        (name, "official"),
        (f"@{compact}", "official"),
    ]
    seen: set[str] = set()
    return [(n, e) for n, e in cases if not (n.lower() in seen or seen.add(n.lower()))]


DEFAULT_CASES = default_cases("Acme Bank")  # the demo brand's set (kept for tests and docs); real sets are built from the registered brand

_SEED_LOCK = threading.Lock()


def ensure_default_cases(db: Session, brand: Brand) -> None:
    """Seed the 12 default cases for THIS brand once (only when it has none, so an admin's deletions are respected).

    Two requests can arrive together (a page that loads the list twice, React StrictMode in development). Without a lock
    both would see no cases and insert 12 rows each (24 cases). The lock serialises the check-then-insert inside this
    process; across several API processes the partial unique index (brand_id, name; migrations 0004 and 0010) makes the loser's insert fail and be ignored.
    """
    has = select(LookalikeCase.id).where(LookalikeCase.brand_id == brand.id).limit(1)
    if db.scalar(has) is not None:
        return
    with _SEED_LOCK:
        if db.scalar(has) is not None:  # another request seeded while we waited
            return
        brand_id, name_ = brand.id, brand.name
        for name, expected in default_cases(name_):
            db.add(LookalikeCase(brand_id=brand_id, name=name, expected=expected, builtin=True, source="sample"))
        try:
            db.commit()
        except IntegrityError:
            # Another process seeded first (partial unique index uq_lookalike_cases_builtin_name).
            db.rollback()


def _normalization(name: str, brand: Brand, added: list[str]) -> list[dict]:
    text, items = prepare(name)
    leet_folded = "".join(LEET_DIGITS.get(i.ch, i.ch) if i.kind == "alnum" else i.ch for i in items)
    compact_brand = "".join(brand.name.lower().split())
    return [
        {"step": 1, "label": "You typed", "value": name},
        {"step": 2, "label": "Lower-cased", "value": text.lower()},
        {"step": 3, "label": "Look-alike characters folded", "value": leet_folded},
        {"step": 4, "label": "Spaces and symbols removed", "value": fold_text(name, digraph=True)},
        {"step": 5, "label": "Brand and extra words", "value": f"{compact_brand} + {' '.join(added)}" if added else compact_brand},
    ]


def evaluate_name(db: Session, brand: Brand, name: str, platform: str | None = None) -> dict:
    name = " ".join(name.split())
    mon = app_settings.get_monitoring(db)
    matcher = build_matcher(brand, words=mon["impersonation_words"])
    allow = BrandAllowlist(brand)
    bare = name.lstrip("@").lower()
    handles = allow.assets.social_handles
    on_list = any(bare in {h.lower() for h in hs} for p, hs in handles.items() if platform in (None, p))
    on_list = on_list or bare in {p.lower() for p in allow.assets.play_package_ids}
    r = matcher.match(name)
    r = apply_rules(r, mon["rules"])
    base = {
        "input": name, "brand": brand.name, "match_percent": r.name_match_pct, "engine_verdict": r.verdict, "techniques": r.techniques,
        "technique_labels": [TECHNIQUE_LABELS.get(t, t) for t in r.techniques], "squat_category": r.squat_category,
        "edit_distance": r.edit_distance, "normalization": _normalization(name, brand, r.added_words), "on_allowlist": on_list,
    }
    if on_list:
        return {**base, "verdict": "official", "official_basis": "allowlist",
                "headline": f"Official: matches an allowlisted handle of {brand.name}",
                "explanation": "This is an exact official handle or package id, so a scan skips it before scoring.", "reasons": []}
    if r.verdict == BRAND_NAME:
        return {**base, "verdict": "official", "official_basis": "name",
                "headline": f"Official name: this is the exact name of {brand.name}",
                "explanation": "It uses the exact brand name. In a real scan the name alone never excludes anything: only an exact official "
                               "handle, URL or package id on your allowlist does. Anything else with this name goes to review.",
                "reasons": []}
    if r.verdict == FLAGGED:
        reasons = [{"rule": TECHNIQUE_RULE.get(t, t), "label": TECHNIQUE_LABELS.get(t, t).capitalize()} for t in r.techniques]
        if r.impersonation_words:
            reasons.append({"rule": "impersonation_words", "label": f"Impersonation word: {', '.join(r.impersonation_words)}"})
        return {**base, "verdict": "flagged", "official_basis": None, "headline": f"Flagged as a look-alike of {brand.name}",
                "explanation": "This name matches the brand after normalization and is not on your allowlist. It goes to the review queue "
                               "with these reasons. " + " ".join(r.notes),
                "reasons": reasons}
    why = " ".join(r.notes) or "The name does not resemble the brand."
    disabled = [RULE_LABELS[k] for k, on in mon["rules"].items() if not on]
    extra = f" Switched-off rules: {', '.join(disabled)}." if disabled and r.verdict == "review" else ""
    return {**base, "verdict": "not_flagged", "official_basis": None, "headline": f"Not flagged: {name} is not a look-alike of {brand.name}",
            "explanation": why + extra, "reasons": []}


def run_cases(db: Session, brand: Brand) -> dict:
    """Run every stored case through `evaluate_name`. The result is computed, never copied from `expected`."""
    ensure_default_cases(db, brand)
    cases = list(db.scalars(select(LookalikeCase).where(LookalikeCase.brand_id == brand.id).order_by(LookalikeCase.id)))
    items, passed = [], 0
    for c in cases:
        r = evaluate_name(db, brand, c.name)
        ok = r["verdict"] == c.expected
        passed += ok
        items.append({"id": c.id, "name": c.name, "expected": c.expected, "result": r["verdict"], "pass": ok, "match_percent": r["match_percent"],
                      "builtin": c.builtin})
    total = len(items)
    return {"total": total, "passed": passed, "failed": total - passed, "summary": f"{passed} of {total} pass", "items": items,
            "ran_at": iso_z(utcnow())}


def confusion(items: list[dict]) -> dict:
    """Precision / recall of 'flagged' over the labelled cases (official and not_flagged both count as 'not predicted flagged')."""
    tp = sum(i["expected"] == "flagged" and i["result"] == "flagged" for i in items)
    fn = sum(i["expected"] == "flagged" and i["result"] != "flagged" for i in items)
    fp = sum(i["expected"] != "flagged" and i["result"] == "flagged" for i in items)
    tn = sum(i["expected"] != "flagged" and i["result"] != "flagged" for i in items)
    return {
        "true_positives": tp, "false_negatives": fn, "false_positives": fp, "true_negatives": tn,
        "precision": round(tp / (tp + fp), 3) if tp + fp else None, "recall": round(tp / (tp + fn), 3) if tp + fn else None,
        "flagged_expected": sum(i["expected"] == "flagged" for i in items),
        "not_flagged_expected": sum(i["expected"] == "not_flagged" for i in items),
        "official_expected": sum(i["expected"] == "official" for i in items),
    }


def rebuild_default_cases(db: Session, brand_id: int, brand_name: str) -> None:
    """The brand was renamed: replace ITS built-in cases with ones written for the new name. Cases an admin added are kept."""
    db.execute(delete(LookalikeCase).where(LookalikeCase.brand_id == brand_id, LookalikeCase.builtin.is_(True)))
    for name, expected in default_cases(brand_name):
        db.add(LookalikeCase(brand_id=brand_id, name=name, expected=expected, builtin=True, source="sample"))


# ---- Web Threats lab: domain / URL tester ----------------------------------------------------------------------------

URL_VERDICTS = ("official", "lookalike", "related", "unrelated", "not_comparable")
URL_VERDICT_LABEL = {"official": "Official domain", "lookalike": "Look-alike domain", "related": "Related: review",
                     "unrelated": "No look-alike signal", "not_comparable": "Cannot be compared"}
NOT_COMPARABLE_WHY = {
    "empty": "Nothing to compare: type a domain or URL.", "too_long": "The input is too long to be a domain or URL.",
    "control_characters_or_spaces": "The input contains spaces or control characters, so it is not a single domain or URL.",
    "unparseable": "The input could not be read as a URL.", "unsupported_scheme": "Only http and https addresses can be compared.",
    "no_host": "There is no host name in the input.", "invalid_host": "The host name is not valid.",
}
REPUTATION_NOTE = ("Reputation (Google Safe Browsing) is NOT checked here: this tester only compares the domain's name and structure with "
                   "your official domains, and never opens the address. A real scan adds the reputation check when a key is set.")


def domain_examples(brand_name: str, domains: list[str] | tuple[str, ...]) -> dict:
    """Labelled example inputs for the domain tester, generated from the registered brand (pure).

    With no official domain registered a plausible `<compact name>.com` is derived and `derived` is true, so the page can say so.
    Expected labels: official, lookalike, unrelated. Like `default_cases`, they are not filtered by what the engine says.
    """
    compact = re.sub(r"[^a-z0-9]", "", brand_name.lower()) or "brand"
    official = next((n.registrable_domain for n in official_registrables(list(domains)).values() if n.registrable_domain), None)
    derived = official is None
    official = official or f"{compact}.com"
    label, _, suffix = official.partition(".")
    swap_a, swap_b = ("net", "co") if not official.endswith((".net", ".co")) else ("org", "io")
    glyph = next((label.replace(a, b, 1) for a, b in (("o", "о"), ("a", "а"), ("e", "е"), ("i", "і"), ("y", "у"), ("c", "с")) if a in label), None)
    puny = normalize_url(f"{glyph}.{suffix}").host if glyph else None
    words = [re.sub(r"[^a-z0-9]", "", t.lower()) for t in brand_name.split()]
    words = [w for w in words if w]
    half = max(1, len(label) // 2)
    separated = (f"{'-'.join(words)}.{suffix}" if len(words) > 1 and "".join(words) == label
                 else f"{label[:half]}-{label[half:]}.{suffix}" if len(label) >= 2 else f"{label}-pay.{suffix}")
    first = words[0] if words else label
    items: list[tuple[str, str, str]] = [
        (official, "official", "The official domain itself"),
        (f"{official}.verify-account.test", "lookalike", "Brand in the subdomain"),
        (f"{label}-support.{suffix}", "lookalike", "Added word"),
        (f"{label}.{swap_a}", "lookalike", "Top-level domain swap"),
        (f"{label}.{swap_b}", "lookalike", "Top-level domain swap"),
    ]
    if glyph:
        items.append((f"{glyph}.{suffix}", "lookalike", "Look-alike character from another alphabet"))
    if puny and puny.startswith("xn--") or (puny and "xn--" in puny):
        items.append((puny, "lookalike", "The same domain in punycode (xn--)"))
    items += [(separated, "lookalike", "Separator inside the name"), (f"{first}bakery.com", "unrelated", "Another business"),
              ("other-company.com", "unrelated", "Another business")]
    seen: set[str] = set()
    out = [{"input": i, "expected": e, "technique": t} for i, e, t in items if not (i in seen or seen.add(i))]
    return {"brand": brand_name, "official_domain": official, "derived": derived, "items": out,
            "note": (f"No official domain is registered, so {official} was derived from the brand name. Add real domains in Brand Registry."
                     if derived else None)}


def evaluate_url(db: Session, brand: Brand, raw: str) -> dict:
    """Compare one typed domain / URL with the brand's official domains. Pure: no network, no Safe Browsing, nothing is opened."""
    mon = app_settings.get_monitoring(db)
    domains = list(brand.domains or [])
    aliases = list(brand.aliases or [])
    matcher = make_domain_matcher(brand.name, aliases, domains, words=list(mon["impersonation_words"]))
    a = analyze_domain(raw, brand.name, domains, aliases=aliases, matcher=matcher)
    u, comp = a.url, a.components
    verdict = a.verdict if a.verdict in URL_VERDICTS else "unrelated"
    techniques = [TECHNIQUE_LABELS.get(t, t) for t in comp.get("techniques", [])]
    for flag, text in (("tld_swap", "Top-level domain swap"), ("brand_in_subdomain", "Brand in the subdomain"),
                       ("userinfo_trick", "Brand before the @ sign"), ("mixed_script", "Mixed alphabets (possible homograph)")):
        if comp.get(flag):
            techniques.append(text)
    if any(r.signal == "idn_homograph" for r in a.reasons):
        techniques.append("Look-alike characters (IDN homograph)")
    if any(r.signal == "added_words" for r in a.reasons):
        techniques.append("Added words")
    techniques = list(dict.fromkeys(techniques))
    official_domains = sorted({n.registrable_domain for n in official_registrables(domains).values() if n.registrable_domain})
    nm = comp.get("name_match") or {}
    notes = " ".join(r.note for r in a.reasons[:2])
    if verdict == "not_comparable":
        headline = "Cannot compare this input"
        explanation = NOT_COMPARABLE_WHY.get(comp.get("error", ""), comp.get("note") or "This input has no domain name to compare.")
    elif verdict == "official":
        headline = f"Official: {u.registrable_domain} is a registered domain of {brand.name}"
        explanation = "The registrable domain is exactly one of your official domains. Subdomains and paths on it belong to the brand."
    elif verdict == "lookalike":
        headline = f"Look-alike of {brand.name}: {u.registrable_domain} is not an official domain"
        explanation = "The real registrable domain is not on your list but its name or structure imitates the brand. " + notes
    elif verdict == "related":
        headline = f"Related to {brand.name}, worth a look"
        explanation = "Some signals tie this domain to the brand but not enough to call it a look-alike. " + notes
    else:
        headline = f"No look-alike signal: {u.registrable_domain} does not imitate {brand.name}"
        explanation = "The name and structure do not resemble the brand. This is not a safety statement: reputation is not checked here."
    return {
        "input": raw.strip()[:300], "brand": brand.name, "verdict": verdict, "verdict_label": URL_VERDICT_LABEL[verdict],
        "headline": headline, "explanation": explanation.strip(), "official_domains": official_domains, "has_official_domains": bool(official_domains),
        "compared_with": a.official_match or (official_domains[0] if official_domains and verdict in ("lookalike", "related") else None),
        "parts": {
            "ok": u.ok, "hostname": u.host, "hostname_unicode": u.host_unicode,
            "subdomain_labels": [x for x in (u.subdomain_unicode or u.subdomain).split(".") if x],
            "registrable_domain": u.registrable_domain, "registrable_unicode": u.registrable_unicode, "domain_label": u.label_unicode or u.domain_label,
            "subdomain": u.subdomain_unicode or u.subdomain, "tld": u.suffix, "is_idn": u.has_idn, "punycode": u.host if u.has_idn else None,
            "port": u.port, "has_credentials": u.userinfo is not None, "is_ip": u.is_ip, "scheme": u.scheme, "warnings": list(u.warnings),
        },
        "techniques": techniques, "score": a.score, "name_match_percent": nm.get("pct"),
        "reasons": [{"signal": r.signal, "points": r.points, "note": r.note} for r in a.reasons],
        "reputation_checked": False, "reputation_note": REPUTATION_NOTE,
    }
