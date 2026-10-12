"""Live look-alike domain discovery. This is the part that runs on real public data.

  lookalikes()   generate typo / homoglyph / keyword / TLD variants of the brand domain
  resolve()      DNS A + MX
  rdap()         registration date and name server (RDAP, no API key)
  crtsh()        earliest TLS certificate (certificate transparency, optional, can be slow)
  safe_fetch()   fetch ONE page as untrusted text: no JS, size limit, blocks private addresses
Every network call has a short timeout and fails soft: a missing answer is "unknown", not an error.
"""
import re
import socket
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import httpx

from .similarity import registrable_label
from .ssrf import is_public_host

try:
    import dns.resolver
except Exception:  # dnspython missing: fall back to the OS resolver (A records only)
    dns = None

TLDS = ["com", "net", "org", "co", "in", "co.in", "shop", "online", "xyz", "support", "help", "info", "app", "store", "site", "top"]
KEYWORDS = ["refund", "support", "help", "login", "secure", "kyc", "care", "offers", "verify", "update"]
HOMO = [("m", "rn"), ("w", "vv"), ("d", "cl"), ("l", "1"), ("l", "i"), ("o", "0"), ("i", "1"), ("e", "3"), ("a", "4"), ("s", "5")]
UA = {"User-Agent": "ScamMind-DomainCheck/1.0 (brand protection research)"}


def lookalikes(domain: str, brand_name: str = "", limit: int = 120):
    """[(candidate_domain, kind)] ordered by how convincing the trick usually is."""
    label = registrable_label(domain)
    tld = domain[domain.rindex(label) + len(label) + 1:] if label in domain else "com"
    out, seen = [], {domain}

    def add(lbl, kind, t=None):
        d = f"{lbl}.{t or tld}"
        if d not in seen and 3 <= len(lbl) <= 40 and not lbl.startswith("-") and not lbl.endswith("-"):
            seen.add(d)
            out.append((d, kind))

    for src, dst in HOMO:                                   # rn for m, vv for w ...
        if src in label:
            add(label.replace(src, dst, 1), "homoglyph")
    for i in range(len(label) - 1):                         # swapped neighbours
        if label[i] != label[i + 1]:
            add(label[:i] + label[i + 1] + label[i] + label[i + 2:], "transposition")
    for i in range(len(label)):                             # missing letter
        add(label[:i] + label[i + 1:], "omission")
    words = [w for w in re.split(r"[^a-z0-9]+", brand_name.lower()) if w]
    if len(words) >= 2:
        add("-".join(words), "hyphenation")
    for kw in KEYWORDS:                                     # brand + scam keyword
        add(f"{label}-{kw}", "keyword")
        add(f"{label}{kw}", "keyword")
        add(f"{kw}-{label}", "keyword")
    for t in TLDS:                                          # same name, other TLD
        add(label, "tld-swap", t)
    for i in range(len(label)):                             # doubled letter
        add(label[:i] + label[i] + label[i:], "duplication")
    return out[:limit]


def resolve(domain: str, timeout: float = 3.0) -> dict:
    out = {"a": [], "mx": []}
    if dns:
        r = dns.resolver.Resolver()
        r.lifetime = r.timeout = timeout
        for rtype, key in (("A", "a"), ("MX", "mx")):
            try:
                out[key] = [x.to_text() for x in r.resolve(domain, rtype)]
            except Exception:
                pass
    else:
        try:
            out["a"] = socket.gethostbyname_ex(domain)[2]
        except Exception:
            pass
    return out


def _days_since(iso: str):
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return max(0, (datetime.now(timezone.utc) - dt).days)
    except Exception:
        return None


def rdap(domain: str, timeout: float = 6.0) -> dict:
    try:
        r = httpx.get(f"https://rdap.org/domain/{domain}", timeout=timeout, follow_redirects=True, headers=UA)
        if r.status_code != 200:
            return {}
        j = r.json()
        reg = next((e["eventDate"] for e in j.get("events", []) if e.get("eventAction") == "registration"), None)
        ns = (j.get("nameservers") or [{}])[0].get("ldhName")
        return {"registered_days_ago": _days_since(reg) if reg else None, "nameserver": ns}
    except Exception:
        return {}


def crtsh(domain: str, timeout: float = 8.0):
    try:
        r = httpx.get("https://crt.sh/", params={"q": domain, "output": "json"}, timeout=timeout, headers=UA)
        rows = r.json() if r.status_code == 200 else []
        dates = [x["not_before"] for x in rows if x.get("not_before")]
        return _days_since(min(dates)) if dates else None
    except Exception:
        return None


def crtsh_info(domain: str, timeout: float = 8.0) -> dict:
    """Certificate-transparency summary: number of certs and age (days) of the earliest and the latest."""
    try:
        r = httpx.get("https://crt.sh/", params={"q": domain, "output": "json"}, timeout=timeout, headers=UA)
        rows = r.json() if r.status_code == 200 else []
        dates = sorted(x["not_before"] for x in rows if x.get("not_before"))
        if not dates:
            return {}
        return {"count": len(rows), "earliest_days": _days_since(dates[0]), "latest_days": _days_since(dates[-1]), "latest": dates[-1]}
    except Exception:
        return {}


def _public(host: str) -> bool:
    """SSRF guard: True only if every address the host resolves to is a public one."""
    return is_public_host(host)


def safe_fetch(domain: str, timeout: float = 5.0, max_bytes: int = 200_000) -> dict:
    """Fetch one page as untrusted text. Never executes anything. Blocks private/internal addresses (SSRF)."""
    for scheme in ("https", "http"):
        url = f"{scheme}://{domain}/"
        try:
            with httpx.Client(follow_redirects=False, timeout=timeout, headers=UA, verify=False) as c:
                for _ in range(4):
                    host = urlparse(url).hostname or ""
                    if not _public(host):
                        return {}
                    with c.stream("GET", url) as r:
                        if r.is_redirect and r.headers.get("location"):
                            url = urljoin(url, r.headers["location"])
                            continue
                        body = b""
                        deadline = time.monotonic() + timeout * 2     # total time limit, not just per-read
                        for chunk in r.iter_bytes():
                            body += chunk
                            if len(body) > max_bytes or time.monotonic() > deadline:
                                break
                        html = body.decode("utf-8", "ignore")
                        title = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
                        links = re.findall(r'href=["\'](https?://[^"\']+)', html, re.I)[:20]
                        stripped = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.I | re.S)
                        text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", stripped)).strip()
                        return {"title": (title.group(1).strip() if title else "")[:150], "text": text[:1500], "links": links,
                                "final_url": url, "status": r.status_code}
        except Exception:
            continue
    return {}


def check_domain(domain: str, kind: str, enrich: bool = True):
    """Return website entity data if the candidate exists on the internet, else None."""
    r = resolve(domain)
    if not r["a"] and not r["mx"]:
        return None
    d = {"domain": domain, "live": True, "variant": kind, "has_mx": bool(r["mx"]), "ip": r["a"][0] if r["a"] else None,
         "title": "", "text": "", "links": [], "registered_days_ago": None, "cert_issued_days_ago": None}
    if enrich:
        d.update({k: v for k, v in rdap(domain).items() if v is not None})
        d["cert_issued_days_ago"] = crtsh(domain)
        if r["a"]:
            d.update({k: v for k, v in safe_fetch(domain).items() if k in ("title", "text", "links")})
    return d


def live_scan(brand: dict, progress=None, limit: int = 60, workers: int = 16, enrich: bool = True):
    cands = lookalikes(brand["domains"][0], brand["name"], limit)
    found, done = [], 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = [ex.submit(check_domain, d, k, enrich) for d, k in cands]
        for f in futures:
            try:
                res = f.result(timeout=60)
            except Exception:
                res = None
            done += 1
            if res:
                found.append(res)
            if progress:
                progress(done, len(cands), len(found))
    return found, len(cands)
