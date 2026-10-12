"""Auth: expired tokens, refresh rotation, logout, reset flow, and role enforcement on EVERY write endpoint."""
import time
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.config import settings
from app.main import app
from tests.conftest import login


def _token(sub, typ="access", minutes=15, **extra):
    now = datetime.now(UTC)
    return jwt.encode({"sub": str(sub), "type": typ, "iat": now, "exp": now + timedelta(minutes=minutes), "jti": f"t{time.time_ns()}", **extra},
                      settings.secret_key, algorithm="HS256")


def test_login_and_me(client):
    t = login(client)
    assert t["user"]["name"] == "Harini" and t["user"]["role"] == "admin" and t["expires_in"] == 15 * 60
    me = client.get("/api/me", headers={"Authorization": f"Bearer {t['access_token']}"}).json()
    assert me["email"] == "admin@company.com" and me["default_brand_id"] == 1
    assert "password" not in str(me)


def test_bad_credentials_and_missing_token(client):
    assert client.post("/api/auth/login", json={"email": "admin@company.com", "password": "nope"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "ghost@x.com", "password": "nope"}).status_code == 401
    assert client.get("/api/dashboard").status_code == 401
    assert client.get("/api/dashboard", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_expired_token_is_rejected(client):
    r = client.get("/api/me", headers={"Authorization": f"Bearer {_token(1, minutes=-5)}"})
    assert r.status_code == 401 and "expired" in r.json()["detail"].lower()


def test_wrong_token_type_and_forged_signature_rejected(client, admin):
    assert client.get("/api/me", headers={"Authorization": f"Bearer {admin['refresh_token']}"}).status_code == 401       # refresh used as access
    forged = jwt.encode({"sub": "1", "type": "access", "exp": datetime.now(UTC) + timedelta(minutes=5), "jti": "x"}, "another-secret-another-secret-123456", algorithm="HS256")
    assert client.get("/api/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_refresh_flow_rotates_and_revokes(client):
    t = login(client)
    r = client.post("/api/auth/refresh", json={"refresh_token": t["refresh_token"]})
    assert r.status_code == 200
    new = r.json()
    assert client.get("/api/me", headers={"Authorization": f"Bearer {new['access_token']}"}).status_code == 200
    assert client.post("/api/auth/refresh", json={"refresh_token": t["refresh_token"]}).status_code == 401     # old one is single-use
    assert client.post("/api/auth/refresh", json={"refresh_token": t["access_token"]}).status_code == 401      # access token is not a refresh token
    assert client.post("/api/auth/logout", json={"refresh_token": new["refresh_token"]}).status_code == 200
    assert client.post("/api/auth/refresh", json={"refresh_token": new["refresh_token"]}).status_code == 401


def test_register_is_admin_only(client, H, analyst_H, viewer_H):
    body = {"name": "New", "email": "new.user@test.local", "password": "Sup3rSecret!", "role": "viewer"}
    assert client.post("/api/auth/register", json=body).status_code == 401
    assert client.post("/api/auth/register", headers=viewer_H, json=body).status_code == 403
    assert client.post("/api/auth/register", headers=analyst_H, json=body).status_code == 403
    assert client.post("/api/auth/register", headers=H, json=body).status_code == 201
    assert client.post("/api/auth/register", headers=H, json=body).status_code == 409
    assert client.post("/api/auth/register", headers=H, json={**body, "email": "x@y.zz", "password": "short"}).status_code == 422


def test_password_reset_token_is_single_use(client, H, capsys):
    client.post("/api/users", headers=H, json={"name": "Reset Me", "email": "reset@test.local", "password": "OldPassw0rd!", "role": "viewer"})
    assert client.post("/api/auth/forgot", json={"email": "reset@test.local"}).status_code == 200
    assert client.post("/api/auth/forgot", json={"email": "nobody@test.local"}).status_code == 200        # same answer: no user enumeration
    out = capsys.readouterr().out
    token = out.split("password reset token for reset@test.local: ")[1].split()[0]
    assert client.post("/api/auth/reset", json={"token": token, "new_password": "BrandNewPass1!"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "reset@test.local", "password": "BrandNewPass1!"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "reset@test.local", "password": "OldPassw0rd!"}).status_code == 401
    assert client.post("/api/auth/reset", json={"token": token, "new_password": "AnotherPass2!"}).status_code == 400   # used already
    assert client.post("/api/auth/reset", json={"token": "junk", "new_password": "AnotherPass2!"}).status_code == 401


def test_deactivated_user_loses_access(client, H):
    client.post("/api/users", headers=H, json={"name": "Temp", "email": "temp@test.local", "password": "TempPassw0rd!", "role": "analyst"})
    tok = login(client, "temp@test.local", "TempPassw0rd!")
    uid = tok["user"]["id"]
    assert client.patch(f"/api/users/{uid}", headers=H, json={"active": False}).status_code == 200
    assert client.get("/api/me", headers={"Authorization": f"Bearer {tok['access_token']}"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "temp@test.local", "password": "TempPassw0rd!"}).status_code == 401


def test_admin_cannot_lock_themselves_out(client, H, admin):
    uid = admin["user"]["id"]
    assert client.patch(f"/api/users/{uid}", headers=H, json={"role": "viewer"}).status_code == 409
    assert client.patch(f"/api/users/{uid}", headers=H, json={"active": False}).status_code == 409


# Every write endpoint, with the lowest role allowed to call it.
WRITES = [
    ("POST", "/api/auth/register", "admin", {"name": "A", "email": "a@b.cc", "password": "Passw0rd!!"}),
    ("POST", "/api/users", "admin", {"name": "A", "email": "a@b.cc", "password": "Passw0rd!!"}),
    ("PATCH", "/api/users/1", "admin", {"name": "x"}),
    ("PUT", "/api/settings/integrations", "admin", []),
    ("POST", "/api/brands", "admin", None),
    ("PUT", "/api/brands/1", "admin", None),
    ("POST", "/api/investigations", "analyst", {"type": "url", "value": "example.com"}),
    ("PATCH", "/api/investigations/INV-2026-0001", "analyst", {"status": "resolved"}),
    ("POST", "/api/investigations/INV-2026-0001/notes", "analyst", {"text": "x"}),
    ("POST", "/api/apps/analyze", "analyst", {"package": "com.x.y"}),
    ("POST", "/api/campaigns/1/confirm", "analyst", None),
    ("POST", "/api/entities/1/action", "analyst", {"action": "confirm"}),
    ("POST", "/api/reports", "analyst", {"campaign_id": 1}),
    ("POST", "/api/reports/1/approve", "analyst", {}),
    ("POST", "/api/watchlist", "analyst", {"kind": "domain", "value": "x.example"}),
    ("PATCH", "/api/watchlist/1", "analyst", {"status": "stable"}),
    ("DELETE", "/api/watchlist/1", "analyst", None),
    ("POST", "/api/alerts/1/read", "analyst", None),
    ("POST", "/api/scan", "analyst", {"mode": "demo"}),
    ("POST", "/api/evidence", "analyst", None),
]


def _call(client, method, url, headers, body):
    kw = {"headers": headers}
    if body is not None:
        kw["json"] = body
    return client.request(method, url, **kw)


@pytest.mark.parametrize("method,url,role,body", WRITES)
def test_write_endpoints_require_authentication_and_role(client, viewer_H, analyst_H, method, url, role, body):
    assert _call(client, method, url, {}, body).status_code == 401
    assert _call(client, method, url, viewer_H, body).status_code == 403              # viewers are read-only everywhere
    if role == "admin":
        assert _call(client, method, url, analyst_H, body).status_code == 403


def test_every_mutating_route_is_covered_by_the_matrix():
    covered = {(m, u.split("?")[0]) for m, u, *_ in WRITES}
    import re
    norm = lambda p: re.sub(r"\{[^}]+\}", "X", p)
    covered_norm = {(m, norm(re.sub(r"/(\d+|INV-[\d-]+)", "/X", u))) for m, u in covered}
    exempt = {("POST", "/api/auth/login"), ("POST", "/api/auth/refresh"), ("POST", "/api/auth/logout"), ("POST", "/api/auth/forgot"),
              ("POST", "/api/auth/reset"), ("POST", "/api/simulator")}      # public auth flows; the simulator only reads
    missing = []
    for r in app.routes:
        for m in getattr(r, "methods", set()) & {"POST", "PUT", "PATCH", "DELETE"}:
            key = (m, norm(r.path))
            if key not in covered_norm and (m, r.path) not in exempt:
                missing.append(key)
    assert not missing, f"write routes without a role test: {missing}"


def test_analyst_cannot_use_admin_endpoints_but_can_investigate(client, analyst_H):
    assert client.get("/api/users", headers=analyst_H).status_code == 403
    assert client.get("/api/settings/integrations", headers=analyst_H).status_code == 403
    assert client.get("/api/audit", headers=analyst_H).status_code == 200
    r = client.post("/api/investigations", headers=analyst_H, json={"type": "url", "value": "acme-help-desk.com"})
    assert r.status_code == 201


def test_viewer_can_read_but_not_audit_or_users(client, viewer_H):
    for url in ("/api/dashboard", "/api/campaigns", "/api/investigations", "/api/reports", "/api/watchlist", "/api/alerts", "/api/evidence"):
        assert client.get(url, headers=viewer_H).status_code == 200, url
    assert client.get("/api/audit", headers=viewer_H).status_code == 403
    assert client.get("/api/users", headers=viewer_H).status_code == 403


def test_writes_land_in_the_audit_log(client, H, analyst_H):
    client.post("/api/investigations/INV-2026-0001/notes", headers=analyst_H, json={"text": "audit me please"})
    log = client.get("/api/audit?limit=50", headers=H).json()
    assert any(a["action"] == "note added" and a["actor"] == "Analyst" for a in log)
    assert any(a["action"] == "login" for a in log)


def test_rate_limit_on_login(client, monkeypatch):
    from app.security import limiter
    monkeypatch.setattr(limiter, "enabled", True)
    limiter.reset()
    codes = [client.post("/api/auth/login", json={"email": "x@y.zz", "password": "bad"}).status_code for _ in range(7)]
    assert codes[:5] == [401] * 5 and 429 in codes[5:]
    monkeypatch.setattr(limiter, "enabled", False)
    limiter.reset()
