"""Investigations, APK parsing, evidence chain of custody, brand logos."""
import io
import json

from PIL import Image

from app.db import session_scope
from app.models import Custody, Entity
from tests.apk_fixture import build_apk


def test_investigate_known_payment_id_finds_the_campaign(client, analyst_H):
    r = client.post("/api/investigations", headers=analyst_H, json={"type": "wallet", "value": "acmerefund@okaxis", "depth": "quick"})
    assert r.status_code == 201
    inv = client.get(f"/api/investigations/{r.json()['id']}", headers=analyst_H).json()
    assert inv["id"].startswith("INV-") and inv["lifecycle"] == "open" and inv["campaign_id"] == 1
    assert inv["risk"]["score"] >= 80 and inv["risk"]["severity"] == "critical"
    assert any(x["link"] == "verified" for x in inv["related"]) and len([x for x in inv["related"] if x["link"] == "verified"]) >= 6
    assert {c["label"] for c in inv["classification"]} == {"Impersonation", "Phishing", "Scam", "Suspicious", "Malware"}
    assert inv["summary"]["source"] == "rules" and inv["findings"] and inv["actions"] and inv["method"]
    assert [s["name"] for s in inv["steps"]][:3] == ["Validate input", "Extract indicators", "Match against known entities"]


def test_investigate_new_lookalike_domain_scores_from_signals(client, analyst_H):
    r = client.post("/api/investigations", headers=analyst_H, json={"type": "url", "value": "https://acme-bank-support.com/login", "depth": "quick"})
    inv = client.get(f"/api/investigations/{r.json()['id']}", headers=analyst_H).json()
    assert inv["related"] == [] and inv["campaign_id"] is None
    assert 15 <= inv["risk"]["score"] < 60                      # name similarity only: the page was not fetched
    assert any("Quick mode" in f for f in inv["findings"])
    assert next(c for c in inv["classification"] if c["label"] == "Impersonation")["pct"] >= 85


def test_deep_mode_runs_live_checks_but_fails_soft(client, analyst_H, monkeypatch):
    from app.engine import live
    monkeypatch.setattr(live, "check_domain", lambda d, k, enrich=True: {
        "domain": d, "live": True, "has_mx": True, "registered_days_ago": 2, "cert_issued_days_ago": 2, "title": "Acme Bank login",
        "text": "Enter your card number, CVV and OTP to continue", "links": []})
    r = client.post("/api/investigations", headers=analyst_H, json={"type": "url", "value": "acrnebank-login.in", "depth": "deep"})
    inv = client.get(f"/api/investigations/{r.json()['id']}", headers=analyst_H).json()
    assert inv["risk"]["score"] >= 60 and any("card number" in f.lower() or "cvv" in f.lower() for f in inv["findings"])
    monkeypatch.setattr(live, "check_domain", lambda d, k, enrich=True: None)
    r = client.post("/api/investigations", headers=analyst_H, json={"type": "url", "value": "acrnebank-gone.in", "depth": "deep"})
    steps = client.get(f"/api/investigations/{r.json()['id']}", headers=analyst_H).json()["steps"]
    assert any(s["status"] == "skipped" and "unknown" in s["detail"] for s in steps)


def test_message_phone_and_handle_investigations(client, analyst_H):
    msg = client.post("/api/investigations", headers=analyst_H, json={
        "type": "message", "value": "Your Acme KYC is expired. Update your KYC now or your account will be blocked. Share OTP, call +91 90000 12345"}).json()
    d = client.get(f"/api/investigations/{msg['id']}", headers=analyst_H).json()
    assert d["risk"]["score"] >= 50 and d["campaign_id"] == 9               # the phone number links it to the KYC campaign
    ph = client.post("/api/investigations", headers=analyst_H, json={"type": "phone", "value": "+91 90000 12345"}).json()
    assert client.get(f"/api/investigations/{ph['id']}", headers=analyst_H).json()["campaign_id"] == 9
    h = client.post("/api/investigations", headers=analyst_H, json={"type": "profile", "value": "@acme_refund_help"}).json()
    dh = client.get(f"/api/investigations/{h['id']}", headers=analyst_H).json()
    assert dh["risk"]["score"] >= 80 and dh["campaign_id"] == 1
    unknown = client.post("/api/investigations", headers=analyst_H, json={"type": "phone", "value": "+91 99999 11111"}).json()
    du = client.get(f"/api/investigations/{unknown['id']}", headers=analyst_H).json()
    assert du["risk"]["score"] == 0 and "Not in the graph yet" in du["findings"][0]


def test_validation_errors(client, analyst_H):
    assert client.post("/api/investigations", headers=analyst_H, json={"type": "url", "value": ""}).status_code == 422
    assert client.post("/api/investigations", headers=analyst_H, json={"type": "url", "value": "x.com", "depth": "extreme"}).status_code == 422
    assert client.post("/api/investigations", headers=analyst_H, json={"type": "url", "value": "x.com", "brand_id": 999}).status_code == 404
    assert client.get("/api/investigations/INV-1999-0001", headers=analyst_H).status_code == 404


def test_list_filter_search_pagination_and_lifecycle(client, analyst_H):
    page1 = client.get("/api/investigations?page=1", headers=analyst_H).json()
    assert page1["total"] >= 2487 and len(page1["items"]) == 20 and page1["page_size"] == 20
    page2 = client.get("/api/investigations?page=2", headers=analyst_H).json()
    assert {i["id"] for i in page1["items"]}.isdisjoint({i["id"] for i in page2["items"]})
    hit = client.get("/api/investigations?q=acme-bank-support", headers=analyst_H).json()
    assert hit["total"] >= 1 and all("acme-bank-support" in i["input"] for i in hit["items"])
    iid = hit["items"][0]["id"]
    p = client.patch(f"/api/investigations/{iid}", headers=analyst_H, json={"status": "investigating", "assigned_to": 1})
    assert p.status_code == 200 and p.json()["lifecycle"] == "investigating" and p.json()["assigned_to"] == "Harini"
    assert client.patch(f"/api/investigations/{iid}", headers=analyst_H, json={"status": "bogus"}).status_code == 422
    assert client.patch(f"/api/investigations/{iid}", headers=analyst_H, json={"assigned_to": 9999}).status_code == 404
    assert client.get("/api/investigations?status=investigating", headers=analyst_H).json()["total"] >= 1
    n = client.post(f"/api/investigations/{iid}/notes", headers=analyst_H, json={"text": "Called the registrar."})
    assert n.status_code == 201 and n.json()["author"] == "Analyst"
    assert client.get(f"/api/investigations/{iid}", headers=analyst_H).json()["notes"][0]["text"] == "Called the registrar."


def test_state_code_comes_from_input_not_geolocation(client, analyst_H):
    r = client.post("/api/investigations", headers=analyst_H, json={"type": "phone", "value": "+91 98100 00000", "state_code": "DL"}).json()
    from app.db import session_scope as ss
    from app.models import Investigation
    with ss() as db:
        assert db.get(Investigation, r["id"]).state_code == "DL"
    r2 = client.post("/api/investigations", headers=analyst_H, json={"type": "phone", "value": "+91 98100 00001"}).json()
    with ss() as db:
        assert db.get(Investigation, r2["id"]).state_code is None        # a phone prefix is never turned into a location


# ----------------------------------------------------------------- APK ---

def test_apk_parses_to_package_permissions_and_cert(client, analyst_H):
    raw, sha = build_apk()
    r = client.post("/api/apps/analyze", headers=analyst_H, files={"file": ("acme-refund.apk", raw, "application/vnd.android.package-archive")})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["app"]["package"] == "com.acrnebank.refund" and d["app"]["name"] == "Acme Refund Assistant" and d["app"]["version"] == "1.0.3"
    assert d["app"]["cert_sha256"] == sha and d["app"]["developer"] == "AcmeRefund Tech"
    perms = {p["name"]: p for p in d["permissions"]}
    assert set(perms) == {"INTERNET", "READ_SMS", "SYSTEM_ALERT_WINDOW"} and perms["READ_SMS"]["risky"] and not perms["INTERNET"]["risky"]
    # no icon, install count or release date in this fixture, so those signals add nothing: 18 + 10 + 10 + 10.8 + 3 ~ 52
    assert 45 <= d["verdict"]["score"] < 80 and d["verdict"]["severity"] == "medium"
    flags = {i["check"]: i["flag"] for i in d["indicators"]}
    assert flags["Package name"] == "Look-alike" and flags["Developer"] == "Mismatch" and flags["Signing certificate"] == "Mismatch"
    urls = {u["url"]: u["flag"] for u in d["urls"]}
    assert urls["https://acrnebank-refund.com/api/collect"] == "Suspicious" and urls["https://acmebank.com/help"] == "Official"
    assert d["official"]["package"] == "com.acmebank.mobile" and d["evidence_id"] and d["investigation_id"].startswith("INV-")
    ev = client.get(f"/api/evidence?case={d['investigation_id']}", headers=analyst_H).json()
    assert ev[0]["sha256"] and [c["action"] for c in ev[0]["custody"]][:2] == ["captured", "hashed"]


def test_apk_rejects_non_apks_and_zip_bombs(client, analyst_H):
    assert client.post("/api/apps/analyze", headers=analyst_H, files={"file": ("x.apk", b"MZ\x90\x00 not an apk", "application/octet-stream")}).status_code == 400
    import zipfile
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("hello.txt", "hi")
    r = client.post("/api/apps/analyze", headers=analyst_H, files={"file": ("x.apk", buf.getvalue(), "application/zip")})
    assert r.status_code == 400 and "AndroidManifest" in r.json()["detail"]
    assert client.post("/api/apps/analyze", headers=analyst_H, files={"other": ("x.apk", b"PK\x03\x04", "application/zip")}).status_code == 422


def test_app_metadata_json_path(client, analyst_H):
    body = {"package": "com.acmebank.mobile", "title": "Acme Bank", "developer": "Acme Bank Ltd", "store": "play", "installs": 3000000,
            "permissions": ["android.permission.INTERNET", "USE_BIOMETRIC"], "urls": ["https://acmebank.com/api"],
            "cert_sha256": "9f3a1c7e5b2d4a8f6e0c1b3d5a7f9e2c4b6d8a0f1e3c5b7d9a2f4e6c8b0d1a3f"}
    d = client.post("/api/apps/analyze", headers=analyst_H, json=body).json()
    assert d["verdict"]["score"] < 20 and d["verdict"]["severity"] == "low"          # the genuine app scores low
    assert all(not p["risky"] for p in d["permissions"]) and d["evidence_id"] is None
    assert client.post("/api/apps/analyze", headers=analyst_H, json={"package": "x"}).status_code == 422


# ------------------------------------------------------------ evidence ---

def test_evidence_upload_hash_custody_and_download(client, analyst_H, H):
    png = io.BytesIO()
    Image.new("RGB", (32, 32), (10, 20, 30)).save(png, "PNG")
    r = client.post("/api/evidence", headers=analyst_H, data={"case": "INV-2026-0001", "kind": "screenshot"},
                    files={"file": ("../../etc/passwd.png", png.getvalue(), "text/html")})        # lying content type, hostile file name
    assert r.status_code == 201, r.text
    ev = r.json()
    import hashlib
    assert ev["sha256"] == hashlib.sha256(png.getvalue()).hexdigest() and ev["mime"] == "image/png"
    assert "/" not in ev["filename"] and ".." not in ev["filename"]
    assert [c["action"] for c in ev["custody"]] == ["captured", "hashed", "attached"]
    d = client.get(f"/api/evidence/{ev['id']}/download", headers=analyst_H)
    assert d.status_code == 200 and d.content == png.getvalue()
    assert d.headers["content-disposition"].startswith("attachment") and d.headers["x-content-type-options"] == "nosniff"
    again = client.get(f"/api/evidence?case=INV-2026-0001&type=screenshot", headers=analyst_H).json()
    assert [c["action"] for c in again[0]["custody"]][-1] == "downloaded"
    with session_scope() as db:
        assert db.query(Custody).filter_by(evidence_id=ev["id"], action="downloaded").count() == 1


def test_evidence_rejects_executables_and_oversize_and_tampering(client, analyst_H, monkeypatch):
    assert client.post("/api/evidence", headers=analyst_H, files={"file": ("a.png", b"MZ\x90\x00\x03\x00\x00\x00", "image/png")}).status_code == 400
    assert client.post("/api/evidence", headers=analyst_H, files={"file": ("a.txt", b"", "text/plain")}).status_code == 400
    from app.config import settings
    monkeypatch.setattr(settings, "max_upload_mb", 0)
    assert client.post("/api/evidence", headers=analyst_H, files={"file": ("a.txt", b"hello", "text/plain")}).status_code == 400
    monkeypatch.undo()
    assert client.post("/api/evidence", headers=analyst_H, data={"case": "INV-0000-0000"}, files={"file": ("a.txt", b"hello", "text/plain")}).status_code == 404
    ok = client.post("/api/evidence", headers=analyst_H, files={"file": ("note.txt", b"hello evidence", "text/plain")}).json()
    from app.models import Evidence
    with session_scope() as db:
        p = db.get(Evidence, ok["id"]).path
    with open(p, "ab") as f:
        f.write(b"tampered")
    assert client.get(f"/api/evidence/{ok['id']}/download", headers=analyst_H).status_code == 409


# -------------------------------------------------------------- brands ---

def test_brand_logo_upload_computes_dhash_and_validates(client, H, analyst_H):
    def png(color, flip=False):
        b = io.BytesIO()
        im = Image.new("RGB", (64, 64), color)
        for x in range(64):                       # a left-to-right gradient (or its mirror) so the two logos hash differently
            for y in range(64):
                v = x * 4 if not flip else 255 - x * 4
                im.putpixel((x, y), (v, v, color[2]))
        im.save(b, "PNG")
        return b.getvalue()
    r = client.post("/api/brands", headers=H, data={"name": "Zeta Pay", "domains": "zetapay.in\nzeta.pay", "aliases": "Zeta", "handles": "instagram:zetapay"},
                    files={"logo": ("logo.png", png((200, 30, 30)), "image/png")})
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["domains"] == ["zetapay.in", "zeta.pay"] and len(b["logo_hash"]) == 16 and not b["is_demo"] and b["handles"] == {"instagram": "zetapay"}
    assert client.post("/api/brands", headers=H, data={"name": "Zeta Pay", "domains": "zeta.in"}).status_code == 409
    assert client.post("/api/brands", headers=H, data={"name": "", "domains": ""}).status_code == 422
    bad = client.post("/api/brands", headers=H, data={"name": "Bad", "domains": "bad.com"}, files={"logo": ("x.png", b"not an image at all", "image/png")})
    assert bad.status_code == 400
    exe = client.post("/api/brands", headers=H, data={"name": "Bad2", "domains": "bad2.com"}, files={"logo": ("x.png", b"MZ\x90\x00" + b"0" * 100, "image/png")})
    assert exe.status_code == 400
    big = client.post("/api/brands", headers=H, data={"name": "Big", "domains": "big.com"}, files={"logo": ("x.png", b"\x89PNG\r\n\x1a\n" + b"0" * (4 * 1024 * 1024 + 10), "image/png")})
    assert big.status_code == 400
    up = client.put(f"/api/brands/{b['id']}", headers=H, data={"aliases": "Zeta, ZP"}, files={"logo": ("l.png", png((30, 200, 30), flip=True), "image/png")})
    assert up.status_code == 200 and up.json()["aliases"] == ["Zeta", "ZP"] and up.json()["logo_hash"] != b["logo_hash"]
    assert client.get("/api/brands", headers=analyst_H).status_code == 200
    mon = client.get(f"/api/brands/{b['id']}/monitor", headers=analyst_H).json()
    assert mon["grade"] == {"letter": "A", "score": 0} and mon["queue"] == []


def test_new_brand_gets_no_sample_entities_and_live_scan_is_gated(client, H, monkeypatch):
    from app.engine import live
    b = client.post("/api/brands", headers=H, data={"name": "Orbit Bank", "domains": "orbitbank.in"}).json()
    monkeypatch.setattr(live, "live_scan", lambda brand, progress=None, **k: ([{
        "domain": "orbitbank-support.in", "live": True, "has_mx": True, "registered_days_ago": 1, "cert_issued_days_ago": 1,
        "title": "Orbit Bank support", "text": "Enter OTP and card number", "links": []}], 40))
    jid = client.post("/api/scan", headers=H, json={"brand_id": b["id"], "mode": "live"}).json()["job_id"]
    import time
    for _ in range(100):
        j = client.get(f"/api/jobs/{jid}", headers=H).json()
        if j["state"] != "running":
            break
        time.sleep(0.1)
    assert j["state"] == "done" and j["progress"] == 100 and len(j["steps"]) >= 4
    ents = client.get(f"/api/entities?brand_id={b['id']}&min_score=0", headers=H).json()
    assert [e["label"] for e in ents] == ["orbitbank-support.in"] and ents[0]["source"] == "live" and ents[0]["score"] >= 50
    assert client.get("/api/jobs/nope", headers=H).status_code == 404
    mon = client.get(f"/api/brands/{b['id']}/monitor", headers=H).json()
    assert {c["channel"]: c["mode"] for c in mon["coverage"]}["Websites"] == "live"
    d = client.get(f"/api/dashboard?brand_id={b['id']}", headers=H).json()
    assert d["kpis"][0]["value"] == 0 and d["campaigns"] == []
