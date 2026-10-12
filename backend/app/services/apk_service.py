"""APK parsing (androguard) and app scoring (the TrustMesh app detector).

Uploaded files are untrusted: size-limited, magic-byte checked, zip-bomb checked, never executed and never stored
under a web-served path.
"""
import hashlib
import io
import re
import zipfile

from sqlalchemy.orm import Session

from ..config import settings
from ..engine import detectors as det
from ..engine import similarity as sim
from ..engine.ids import domain_of, is_official_domain
from . import analysis_service as svc

try:                                    # androguard logs a lot through loguru
    from loguru import logger
    logger.disable("androguard")
except Exception:
    pass

MAX_UNCOMPRESSED = 700 * 1024 * 1024
URL_RE = re.compile(rb"https?://[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]{4,200}")
PERM_REASON = {
    "READ_SMS": "Not requested by the official app. Can read one-time passwords sent by SMS.",
    "RECEIVE_SMS": "Not requested by the official app. Can intercept one-time passwords as they arrive.",
    "SEND_SMS": "Not requested by the official app. Can send paid or fraudulent messages.",
    "READ_CONTACTS": "Not requested by the official app. Can copy the contact list to spread the scam.",
    "READ_CALL_LOG": "Not requested by the official app. Can read call history.",
    "SYSTEM_ALERT_WINDOW": "Not requested by the official app. Can draw fake screens over other apps.",
    "BIND_ACCESSIBILITY_SERVICE": "Not requested by the official app. Can read the screen and tap on the user's behalf.",
    "REQUEST_INSTALL_PACKAGES": "Not requested by the official app. Can install further apps.",
    "RECORD_AUDIO": "Not requested by the official app. Can record audio.",
    "READ_PHONE_STATE": "Not requested by the official app. Can read phone identifiers.",
}


class ApkError(ValueError):
    pass


def check_zip(raw: bytes):
    if raw[:4] != b"PK\x03\x04":
        raise ApkError("Not an APK: the file does not start with the ZIP signature")
    if len(raw) > settings.max_apk_mb * 1024 * 1024:
        raise ApkError(f"APK is larger than {settings.max_apk_mb} MB")
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
        infos = zf.infolist()
    except zipfile.BadZipFile:
        raise ApkError("The file is not a valid ZIP/APK")
    if sum(i.file_size for i in infos) > MAX_UNCOMPRESSED or len(infos) > 20000:
        raise ApkError("The archive expands to an unreasonable size")
    if not any(i.filename == "AndroidManifest.xml" for i in infos):
        raise ApkError("No AndroidManifest.xml: this is not an Android app")
    return zf


def parse_apk(raw: bytes) -> dict:
    """Package, version, developer, signing certificate SHA-256, permissions, URLs found in strings, and the icon."""
    zf = check_zip(raw)
    from androguard.core.apk import APK
    try:
        apk = APK(raw, raw=True)
    except Exception as ex:
        raise ApkError(f"Could not parse the APK: {type(ex).__name__}")
    package = apk.get_package() or ""
    if not package:
        raise ApkError("The manifest has no package name")
    perms = sorted({p.split(".")[-1] for p in apk.get_permissions()})
    cert_sha, developer = "", ""
    try:
        certs = apk.get_certificates()
        if certs:
            cert_sha = certs[0].sha256.hex()
            subj = certs[0].subject.native
            developer = subj.get("organization_name") or subj.get("common_name") or ""
    except Exception:
        pass
    urls: list[str] = []
    seen = set()
    for info in zf.infolist():
        low = info.filename.lower()
        if info.file_size > 30 * 1024 * 1024 or not (low.endswith(".dex") or low.startswith("assets/") or low.endswith(".arsc") or low.endswith(".xml") or low.endswith(".json")):
            continue
        try:
            data = zf.read(info)
        except Exception:
            continue
        for m in URL_RE.findall(data):
            u = m.decode("utf-8", "ignore").rstrip(".,;)'\"")
            if u not in seen and not re.match(r"https?://(schemas\.android\.com|www\.w3\.org|ns\.adobe\.com|xmlpull\.org)", u):
                seen.add(u)
                urls.append(u)
            if len(urls) >= 60:
                break
    icon_file = None
    try:
        icon_path = apk.get_app_icon()
        if icon_path and icon_path.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            icon_bytes = apk.get_file(icon_path)
            sim.dhash(icon_bytes)       # validate that it really is an image
            icon_file = f"apk_{hashlib.sha256(icon_bytes).hexdigest()[:16]}.png"
            (settings.logo_dir / icon_file).write_bytes(icon_bytes)
    except Exception:
        icon_file = None
    return {"package": package, "title": apk.get_app_name() or package, "version": apk.get_androidversion_name() or "",
            "developer": developer, "cert_sha256": cert_sha, "permissions": perms, "urls": urls, "store": "sideload",
            "logo": icon_file, "sha256": hashlib.sha256(raw).hexdigest()}


def score_app(db: Session, brand_row, data: dict) -> dict:
    """Run the TrustMesh app detector and shape the result for the App Analysis page."""
    brand = svc.brand_dict(brand_row)
    kb = svc.kb_list(db)
    ents = svc.load_entities(db, brand_row.id)
    corpus = sim.Corpus([brand.get("official_text", "")] + [k["text"] for k in kb] + [det.entity_text(e) for e in ents] + [data.get("title", "")])
    ctx = det.Ctx(brand, corpus, kb)
    for e in ents:
        if e["type"] == "website" and sim.name_match(sim.registrable_label(e["key"]), brand)["strength"] >= 0.5:
            ctx.suspect_sites.add(e["key"])
    d = {k: v for k, v in data.items() if v is not None}      # JSON nulls mean "unknown", not zero
    d.setdefault("store", "sideload")
    ent = {"id": 0, "type": "app", "platform": "android", "key": d["package"], "data": d, "status": "new", "first_seen": 0, "source": "user"}
    signals = det.app_signals(ent, ctx)
    score = round(det.total(signals), 1)
    sev = det.severity(score)

    st = {s["name"]: s for s in signals}
    nm = st["name_similarity"]
    indicators = [{"check": "Package name", "finding": nm["reason"] if nm["strength"] else f"{d['package']} does not resemble the brand",
                   "flag": "Look-alike" if nm["strength"] >= 0.6 else "OK"}]
    dev_ok = d.get("developer", "") in brand.get("developers", [])
    indicators.append({"check": "Developer", "finding": f"{d.get('developer') or 'Unknown'}" + ("" if dev_ok else f", not {brand['developers'][0] if brand['developers'] else 'the brand'}"),
                       "flag": "OK" if dev_ok else ("Mismatch" if d.get("developer") else "Unknown")})
    cert_ok = bool(d.get("cert_sha256")) and d.get("cert_sha256") == brand.get("cert_sha256")
    indicators.append({"check": "Signing certificate", "finding": "Matches the official app" if cert_ok else ("Differs from the official app" if d.get("cert_sha256") else "No certificate found"),
                       "flag": "OK" if cert_ok else ("Mismatch" if d.get("cert_sha256") else "Unknown")})
    indicators.append({"check": "Distribution", "finding": "Installed from the official store" if d.get("store") == "play" else "Sideloaded, outside the official store",
                       "flag": "OK" if d.get("store") == "play" else "Outside store"})
    if d.get("released_days_ago") is not None:
        indicators.append({"check": "Released", "finding": f"{d['released_days_ago']} days ago", "flag": "New" if d["released_days_ago"] <= 14 else "OK"})
    if d.get("installs") is not None:
        indicators.append({"check": "Installs", "finding": f"{d['installs']:,}", "flag": "Low" if d["installs"] < 1000 else "OK"})

    official_perms = set(brand.get("permissions", []))
    perms = []
    for p in d.get("permissions", []):
        risky = p in det.RISKY_PERMS and p not in official_perms
        perms.append({"name": p, "risky": risky, "reason": PERM_REASON.get(p, "Not requested by the official app") if risky
                      else ("Also requested by the official app" if p in official_perms else "Standard permission")})
    perms.sort(key=lambda x: (not x["risky"], x["name"]))

    urls = []
    for u in d.get("urls", []):
        dom = domain_of(u)
        if not dom:
            continue
        if is_official_domain(dom, brand):
            urls.append({"url": u, "note": "The brand's own domain", "flag": "Official"})
        elif re.fullmatch(r"\d+\.\d+\.\d+\.\d+", dom):
            urls.append({"url": u, "note": f"Contacts a raw IP address ({dom})", "flag": "Suspicious"})
        elif dom in ctx.suspect_sites:
            urls.append({"url": u, "note": "Matches a look-alike site found in this scan", "flag": "Suspicious"})
        else:
            n2 = sim.name_match(sim.registrable_label(dom), brand)
            urls.append({"url": u, "note": n2["reason"] if n2["strength"] else "Not linked to the brand", "flag": "Suspicious" if n2["strength"] >= 0.5 else "Unknown"})
    if d.get("hosted_on"):
        urls.insert(0, {"url": f"https://{d['hosted_on']}", "note": "Where the app was downloaded from", "flag": "Source"})

    icon_sim = None
    if d.get("logo") and ctx.brand_hash is not None:
        h = ctx.hash_of(d["logo"])
        if h is not None:
            icon_sim = round(sim.logo_similarity(h, ctx.brand_hash) * 100)
    official = {"name": brand["name"], "package": brand["app_ids"][0] if brand["app_ids"] else "", "developer": (brand["developers"] or [""])[0],
                "cert_sha256": brand["cert_sha256"], "source": "Google Play"}
    app = {"name": d.get("title") or d["package"], "package": d["package"], "version": d.get("version", ""), "developer": d.get("developer", ""),
           "cert_sha256": d.get("cert_sha256", ""), "source": "Sideloaded" if d.get("store") != "play" else "Google Play"}
    return {"verdict": {"score": score, "severity": sev}, "official": official, "app": app, "icon_similarity": icon_sim,
            "indicators": indicators, "permissions": perms, "urls": urls, "signals": signals, "score": score}
