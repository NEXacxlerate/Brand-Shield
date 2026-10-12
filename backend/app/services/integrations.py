"""Optional third-party lookups. Keys come from environment variables only; the config column never stores a secret.

Every call is time-limited, SSRF-irrelevant (fixed vendor hosts) and fails soft to None ("unknown").
"""
import httpx
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Integration

DEFAULTS = {
    "dns": {"enabled": True, "label": "DNS A/MX lookups", "needs_key": False},
    "rdap": {"enabled": True, "label": "RDAP registration data", "needs_key": False},
    "crtsh": {"enabled": True, "label": "crt.sh certificate transparency", "needs_key": False},
    "urlhaus": {"enabled": False, "label": "URLhaus (abuse.ch)", "needs_key": True},
    "abuseipdb": {"enabled": False, "label": "AbuseIPDB", "needs_key": True},
    "virustotal": {"enabled": False, "label": "VirusTotal", "needs_key": True},
}
KEY_ENV = {"urlhaus": lambda: settings.urlhaus_auth_key, "abuseipdb": lambda: settings.abuseipdb_api_key,
           "virustotal": lambda: settings.virustotal_api_key}


def ensure_defaults(db: Session):
    for name, d in DEFAULTS.items():
        if not db.get(Integration, name):
            db.add(Integration(name=name, enabled=d["enabled"], config={}))
    db.commit()


def is_enabled(db: Session, name: str) -> bool:
    row = db.get(Integration, name)
    on = row.enabled if row else DEFAULTS[name]["enabled"]
    if name in KEY_ENV and not KEY_ENV[name]():
        return False
    return on


def key_present(name: str) -> bool:
    return bool(KEY_ENV[name]()) if name in KEY_ENV else True


def virustotal_domain(domain: str):
    try:
        r = httpx.get(f"https://www.virustotal.com/api/v3/domains/{domain}", headers={"x-apikey": settings.virustotal_api_key}, timeout=8)
        if r.status_code != 200:
            return None
        st = r.json()["data"]["attributes"].get("last_analysis_stats", {})
        return {"source": "virustotal", "malicious": st.get("malicious", 0), "suspicious": st.get("suspicious", 0)}
    except Exception:
        return None


def abuseipdb_ip(ip: str):
    try:
        r = httpx.get("https://api.abuseipdb.com/api/v2/check", params={"ipAddress": ip, "maxAgeInDays": 90},
                      headers={"Key": settings.abuseipdb_api_key, "Accept": "application/json"}, timeout=8)
        if r.status_code != 200:
            return None
        d = r.json()["data"]
        return {"source": "abuseipdb", "confidence": d.get("abuseConfidenceScore"), "reports": d.get("totalReports")}
    except Exception:
        return None


def urlhaus_host(host: str):
    try:
        r = httpx.post("https://urlhaus-api.abuse.ch/v1/host/", data={"host": host}, headers={"Auth-Key": settings.urlhaus_auth_key}, timeout=8)
        if r.status_code != 200:
            return None
        j = r.json()
        return {"source": "urlhaus", "status": j.get("query_status"), "urls": int(j.get("url_count", 0) or 0)}
    except Exception:
        return None


def enrich_website(db: Session, data: dict) -> dict:
    """Attach reputation facts (informational; they are not scored) to a website's data."""
    rep = []
    dom, ip = data.get("domain"), data.get("ip")
    if dom and is_enabled(db, "virustotal"):
        rep.append(virustotal_domain(dom))
    if ip and is_enabled(db, "abuseipdb"):
        rep.append(abuseipdb_ip(ip))
    if dom and is_enabled(db, "urlhaus"):
        rep.append(urlhaus_host(dom))
    rep = [r for r in rep if r]
    if rep:
        data["reputation"] = rep
    return data
