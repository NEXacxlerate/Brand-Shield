"""Watchlist checks, alerts, scheduler jobs, integrations."""
from app import jobs
from app.db import session_scope
from app.engine import live
from app.models import Alert, Entity, StageHistory, WatchItem, utcnow


def _add(client, H, kind, value, **kw):
    r = client.post("/api/watchlist", headers=H, json={"kind": kind, "value": value, **kw})
    assert r.status_code == 201, r.text
    return r.json()


def test_seeded_watchlist_and_spreading_payment_id(client, H):
    items = {w["value"]: w for w in client.get("/api/watchlist", headers=H).json()}
    assert items["acmerefund@okaxis"]["status"] == "spreading"          # two newer entities appeared after the stored baseline
    assert items["+91 90000 12345"]["status"] == "stable"
    alerts = client.get("/api/alerts?unread=true", headers=H).json()
    assert any("acmerefund@okaxis is spreading" in a["title"] for a in alerts)


def test_domain_watch_detects_dns_cert_and_title_changes(client, analyst_H, monkeypatch):
    state = {"a": ["1.2.3.4"], "mx": ["mx.a."], "certs": 2, "title": "Welcome"}
    monkeypatch.setattr(live, "resolve", lambda d, timeout=3.0: {"a": state["a"], "mx": state["mx"]})
    monkeypatch.setattr(live, "crtsh_info", lambda d, timeout=8.0: {"count": state["certs"], "latest": "2026-10-01T00:00:00", "latest_days": 5, "earliest_days": 30})
    monkeypatch.setattr(live, "safe_fetch", lambda d, **k: {"title": state["title"], "text": "", "links": []})
    w = _add(client, analyst_H, "domain", "https://Watched-Example.COM/login")
    assert w["value"] == "watched-example.com" and w["status"] == "stable" and w["last_checked"] is None
    assert client.post("/api/watchlist", headers=analyst_H, json={"kind": "domain", "value": "watched-example.com"}).status_code == 409

    def check():
        return client.patch(f"/api/watchlist/{w['id']}", headers=analyst_H, json={"check_now": True}).json()

    first = check()
    assert first["status"] == "stable" and first["last_checked"]                    # baseline only: no alert
    n_alerts = len(client.get("/api/alerts", headers=analyst_H).json())
    assert check()["status"] == "stable"
    state["a"], state["mx"] = ["5.6.7.8"], []
    assert check()["status"] == "changed"
    state["certs"], state["title"] = 3, "Acme Bank - Sign in"
    check()
    titles = [a["title"] for a in client.get("/api/alerts?limit=20", headers=analyst_H).json()]
    assert any("DNS records changed" in t for t in titles) and any("new TLS certificate" in t for t in titles) and any("page title changed" in t for t in titles)
    assert len(client.get("/api/alerts", headers=analyst_H).json()) > n_alerts
    assert client.patch(f"/api/watchlist/{w['id']}", headers=analyst_H, json={"status": "stable"}).json()["status"] == "stable"    # analyst acknowledges
    state["a"], state["mx"] = [], []
    assert check()["status"] == "offline"
    assert any("no longer resolves" in a["title"] for a in client.get("/api/alerts?limit=5", headers=analyst_H).json())


def test_unknown_lookups_never_raise_alerts(client, analyst_H, monkeypatch):
    monkeypatch.setattr(live, "resolve", lambda d, timeout=3.0: {"a": ["9.9.9.9"], "mx": []})
    monkeypatch.setattr(live, "crtsh_info", lambda d, timeout=8.0: {})
    monkeypatch.setattr(live, "safe_fetch", lambda d, **k: {})
    w = _add(client, analyst_H, "domain", "quiet-example.org")
    for _ in range(3):
        assert client.patch(f"/api/watchlist/{w['id']}", headers=analyst_H, json={"check_now": True}).json()["status"] == "stable"
    assert not any("quiet-example.org" in a["title"] for a in client.get("/api/alerts?limit=200", headers=analyst_H).json())


def test_identifier_watch_flags_new_entities(client, analyst_H):
    w = _add(client, analyst_H, "phone", "90000 12345")
    assert client.patch(f"/api/watchlist/{w['id']}", headers=analyst_H, json={"check_now": True}).json()["status"] == "stable"
    # a new entity appears that uses the watched phone number -> the next check says it is spreading
    with session_scope() as db:
        from app.services import analysis_service as svc
        from app.services.scan_service import upsert_entity
        upsert_entity(db, 1, "social", "instagram", "instagram:acmebank_kyc_new", {
            "platform": "instagram", "handle": "acmebank_kyc_new", "display_name": "Acme Bank KYC New", "created_days_ago": 1, "followers": 5, "following": 100,
            "bio": "Acme Bank KYC update. Your KYC is expired, update now or your account will be blocked. Call +91 90000 12345 and share OTP", "links": []}, "user", 1)
        db.commit()
        svc.run_analysis(db, 1)
    r = client.patch(f"/api/watchlist/{w['id']}", headers=analyst_H, json={"check_now": True}).json()
    assert r["status"] == "spreading"
    assert any("acmebank_kyc_new" in a["detail"] for a in client.get("/api/alerts?unread=true&limit=5", headers=analyst_H).json())
    assert client.get("/api/campaigns/9", headers=analyst_H).json()["size"] == 7          # it joined the KYC ring through the shared phone
    with session_scope() as db:                                                         # clean up so later tests see the original demo data
        e = db.query(Entity).filter_by(key="instagram:acmebank_kyc_new").one()
        db.query(StageHistory).filter_by(entity_id=e.id).delete()
        db.query(Alert).filter_by(entity_id=e.id).delete()
        db.delete(e)
        db.commit()
        svc.run_analysis(db, 1)
    assert client.get("/api/campaigns/9", headers=analyst_H).json()["size"] == 6


def test_watchlist_crud(client, analyst_H, H):
    w = _add(client, analyst_H, "app", "com.acmebank.kyc.update", rules={"cert": False})
    assert w["rules"]["cert"] is False and w["rules"]["dns"] is True
    assert client.patch(f"/api/watchlist/{w['id']}", headers=analyst_H, json={"rules": {"title": False}}).json()["rules"]["title"] is False
    assert client.delete(f"/api/watchlist/{w['id']}", headers=analyst_H).status_code == 200
    assert client.delete(f"/api/watchlist/{w['id']}", headers=analyst_H).status_code == 404
    assert client.post("/api/watchlist", headers=analyst_H, json={"kind": "email", "value": "x@y.zz"}).status_code == 422


def test_alert_read_flow(client, analyst_H):
    unread = client.get("/api/alerts?unread=true", headers=analyst_H).json()
    assert unread
    a = client.post(f"/api/alerts/{unread[0]['id']}/read", headers=analyst_H).json()
    assert a["read"] is True
    assert all(x["id"] != a["id"] for x in client.get("/api/alerts?unread=true&limit=200", headers=analyst_H).json())
    assert client.post("/api/alerts/999999/read", headers=analyst_H).status_code == 404


def test_scheduled_jobs_run_and_are_audited(client, H, monkeypatch):
    monkeypatch.setattr(live, "resolve", lambda d, timeout=3.0: {"a": ["1.1.1.1"], "mx": []})
    monkeypatch.setattr(live, "crtsh_info", lambda d, timeout=8.0: {})
    monkeypatch.setattr(live, "safe_fetch", lambda d, **k: {})
    assert jobs.watchlist_job() >= 6
    before = client.get("/api/dashboard", headers=H).json()
    res = jobs.nightly_job()
    assert res["Acme Bank"]["campaigns"] == 2
    after = client.get("/api/dashboard", headers=H).json()
    assert [k["value"] for k in before["kpis"]] == [k["value"] for k in after["kpis"]]         # a nightly refresh does not change the headline numbers
    actions = [a["action"] for a in client.get("/api/audit?limit=20", headers=H).json()]
    assert "nightly job" in actions and "watchlist check" in actions
    from app.models import Metric
    with session_scope() as db:
        assert db.query(Metric).filter_by(source="live", key="fake_profiles", brand_id=1).count() == 1


def test_nightly_analysis_records_stage_changes_when_entities_age(client, H):
    with session_scope() as db:
        e = db.query(Entity).filter_by(key="acmebank-offers.shop").one()
        before = db.query(StageHistory).filter_by(entity_id=e.id).count()
        e.stage = 1                                       # pretend the previous run saw it as Normal
        db.commit()
    jobs.nightly_job()
    with session_scope() as db:
        e = db.query(Entity).filter_by(key="acmebank-offers.shop").one()
        assert db.query(StageHistory).filter_by(entity_id=e.id).count() == before + 1


def test_integrations_are_admin_only_and_never_expose_keys(client, H, analyst_H):
    r = client.get("/api/settings/integrations", headers=H).json()
    by = {i["name"]: i for i in r}
    assert {"dns", "rdap", "crtsh", "urlhaus", "abuseipdb", "virustotal"} <= set(by)
    assert by["dns"]["enabled"] and not by["virustotal"]["enabled"] and by["virustotal"]["needs_key"] and not by["virustotal"]["key_present"]
    bad = client.put("/api/settings/integrations", headers=H, json=[{"name": "virustotal", "enabled": True, "config": {"api_key": "SECRET"}}])
    assert bad.status_code == 422
    assert client.put("/api/settings/integrations", headers=H, json=[{"name": "nope", "enabled": True}]).status_code == 422
    ok = client.put("/api/settings/integrations", headers=H, json=[{"name": "rdap", "enabled": False, "config": {}}])
    assert ok.status_code == 200 and {i["name"]: i for i in ok.json()}["rdap"]["enabled"] is False
    client.put("/api/settings/integrations", headers=H, json=[{"name": "rdap", "enabled": True, "config": {}}])
    assert client.get("/api/settings/integrations", headers=analyst_H).status_code == 403


def test_disabling_dns_skips_live_checks(client, H, monkeypatch):
    called = []
    monkeypatch.setattr(live, "live_scan", lambda *a, **k: called.append(1) or ([], 0))
    client.put("/api/settings/integrations", headers=H, json=[{"name": "dns", "enabled": False, "config": {}}])
    import time
    jid = client.post("/api/scan", headers=H, json={"mode": "live"}).json()["job_id"]
    for _ in range(100):
        j = client.get(f"/api/jobs/{jid}", headers=H).json()
        if j["state"] != "running":
            break
        time.sleep(0.1)
    client.put("/api/settings/integrations", headers=H, json=[{"name": "dns", "enabled": True, "config": {}}])
    assert j["state"] == "done" and not called
    assert any("switched off" in s["detail"] for s in j["steps"])
