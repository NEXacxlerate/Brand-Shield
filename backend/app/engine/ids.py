"""Identifier extraction. These shared identifiers are what link fakes into a campaign."""
import re

COMMON_DOMAINS = {
    "instagram.com", "facebook.com", "fb.com", "x.com", "twitter.com", "t.me", "wa.me", "whatsapp.com",
    "youtube.com", "youtu.be", "google.com", "play.google.com", "bit.ly", "tinyurl.com", "linktr.ee",
    "gmail.com", "outlook.com", "yahoo.com", "telegram.org", "telegram.me", "apple.com",
}
CLUSTER_KINDS = {"phone", "payment", "telegram", "email", "domain", "cert", "logo", "script"}   # logo and script are added by the analysis

UPI_RE = re.compile(r"(?<![\w.@-])[a-z0-9][a-z0-9._-]{1,}@(?:ok[a-z]+|ybl|ibl|axl|paytm|upi|apl|sbi|icici|hdfcbank|axisbank)\b", re.I)
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
TG_RE = re.compile(r"(?:t\.me|telegram\.me)/([A-Za-z0-9_]{4,})", re.I)
PHONE_RE = re.compile(r"(?<![\w.])\+?\d[\d\s-]{8,14}\d(?![\w])")
DOMAIN_RE = re.compile(
    r"(?<![@\w.-])((?:[a-z0-9-]+\.)+(?:com|net|org|in|co|shop|online|xyz|info|app|store|site|support|help|top|io|me|link|biz|cc))\b", re.I)


def domain_of(url_or_host: str) -> str:
    s = (url_or_host or "").strip().lower()
    s = re.sub(r"^[a-z][a-z0-9+.-]*://", "", s)
    s = s.split("/")[0].split("?")[0].split("#")[0].split(":")[0]
    return s[4:] if s.startswith("www.") else s


def is_official_domain(dom: str, brand: dict) -> bool:
    dom = domain_of(dom)
    return any(dom == d or dom.endswith("." + d) for d in brand.get("domains", []))


def norm_phone(p: str) -> str:
    digits = re.sub(r"\D", "", p)
    return digits[-10:] if len(digits) >= 10 else digits


def extract_from_text(text: str, brand: dict) -> list:
    """Return [(kind, value)] found in free text."""
    out = []
    text = text or ""
    official_phones = {norm_phone(p) for p in brand.get("phones", [])}
    for m in UPI_RE.findall(text):
        out.append(("payment", m.lower()))
    for m in TG_RE.findall(text):
        out.append(("telegram", m.lower()))
    for m in EMAIL_RE.finditer(text):
        addr = m.group(0).lower()
        if not is_official_domain(addr.split("@")[1], brand) and not UPI_RE.fullmatch(addr):
            out.append(("email", addr))
    for m in PHONE_RE.findall(text):
        n = norm_phone(m)
        if len(n) >= 10 and n not in official_phones:
            out.append(("phone", n))
    for m in DOMAIN_RE.findall(text):
        dom = domain_of(m)
        if dom not in COMMON_DOMAINS and not is_official_domain(dom, brand):
            out.append(("domain", dom))
    return out


def extract_identifiers(e: dict, brand: dict) -> list:
    """All identifiers for an entity, de-duplicated. Official ones are excluded."""
    d, found = e["data"], []
    text_parts = [d.get("bio", ""), " ".join(d.get("posts", [])), d.get("text", ""), d.get("title", "")]
    found += extract_from_text(" ".join(text_parts), brand)
    for u in d.get("links", []) + d.get("urls", []):
        dom = domain_of(u)
        if dom and dom not in COMMON_DOMAINS and not is_official_domain(dom, brand):
            found.append(("domain", dom))
        for m in TG_RE.findall(u):
            found.append(("telegram", m.lower()))
    for p in d.get("phones", []):
        n = norm_phone(p)
        if n and n not in {norm_phone(x) for x in brand.get("phones", [])}:
            found.append(("phone", n))
    for p in d.get("payment_ids", []):
        found.append(("payment", p.lower()))
    for t in d.get("telegram", []):
        found.append(("telegram", t.lower().lstrip("@")))
    for m in d.get("emails", []):
        found.append(("email", m.lower()))
    if d.get("developer_email"):
        found.append(("email", d["developer_email"].lower()))
    if d.get("cert_sha256") and d["cert_sha256"] != brand.get("cert_sha256"):
        found.append(("cert", d["cert_sha256"].lower()))
    if d.get("hosted_on"):
        dom = domain_of(d["hosted_on"])
        if dom not in COMMON_DOMAINS and not is_official_domain(dom, brand):
            found.append(("domain", dom))
    if e["type"] == "website":
        found.append(("domain", domain_of(d.get("domain") or e["key"])))
        if d.get("ip"):
            found.append(("ip", d["ip"]))
        if d.get("nameserver"):
            found.append(("nameserver", d["nameserver"].lower()))
    if e["type"] == "social" and e["platform"] == "telegram":
        found.append(("telegram", d.get("handle", "").lower().lstrip("@")))
    seen, out = set(), []
    for k, v in found:
        if v and (k, v) not in seen:
            seen.add((k, v))
            out.append((k, v))
    return out
