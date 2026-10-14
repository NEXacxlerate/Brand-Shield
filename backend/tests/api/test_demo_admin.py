"""The public, GUARDED demo administrator (DEMO_ADMIN_EMAIL / DEMO_ADMIN_PASSWORD)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config.security import hash_password, verify_password
from app.models import User
from app.services.seed import demo_admin_enabled, is_demo_admin, seed_demo_admin
from tests.api.test_demo_login import ADMIN, DEMO, make
from tests.conftest import headers_for

DA = ("demoadmin@brandshield.app", "Demo-Admin-2026!")


@pytest.fixture
def env(tmp_path):
    app, settings = make(tmp_path, demo_email=DEMO[0], demo_password=DEMO[1], demo_admin_email=DA[0], demo_admin_password=DA[1])
    with TestClient(app) as c:
        yield c, app, settings


def _h(c, who):
    return headers_for(c, *who)


def test_shape_with_and_without_admin(tmp_path, env):
    c, _, _ = env
    r = c.get("/api/auth/demo")
    assert r.json() == {"enabled": True, "email": DEMO[0], "password": DEMO[1], "admin_enabled": True,
                        "admin": {"email": DA[0], "password": DA[1]}}
    assert r.headers["cache-control"] == "no-store"
    app, _ = make(tmp_path)
    with TestClient(app) as c2:
        assert c2.get("/api/auth/demo").json() == {"enabled": False, "admin_enabled": False}
    app, _ = make(tmp_path, demo_admin_email=DA[0], demo_admin_password=DA[1])  # admin demo without the analyst demo
    with TestClient(app) as c3:
        assert c3.get("/api/auth/demo").json() == {"enabled": False, "admin_enabled": True, "admin": {"email": DA[0], "password": DA[1]}}


def test_login_works_and_role_is_admin_named_demo_admin(env):
    c, app, _ = env
    r = c.post("/api/auth/login", json={"email": DA[0], "password": DA[1]})
    assert r.status_code == 200 and r.json()["user"]["role"] == "admin"
    with app.state.session_factory() as db:
        assert db.query(User).filter(User.email == DA[0]).one().name == "Demo Admin"


def test_half_configured_and_collisions_are_disabled_and_real_admin_is_never_advertised(tmp_path):
    cases = (
        dict(demo_admin_email=DA[0]),
        dict(demo_admin_password=DA[1]),
        dict(demo_admin_email=ADMIN[0].upper(), demo_admin_password="Other-Pass-2026!"),
        dict(demo_email=DEMO[0], demo_password=DEMO[1], demo_admin_email=DEMO[0].upper(), demo_admin_password="Other-Pass-2026!"),
    )
    for kw in cases:
        app, settings = make(tmp_path, **kw)
        assert not demo_admin_enabled(settings)
        with TestClient(app) as c:
            body = c.get("/api/auth/demo").json()
            assert body["admin_enabled"] is False and "admin" not in body
            assert ADMIN[1] not in str(body)
            assert c.post("/api/auth/login", json={"email": ADMIN[0], "password": "Other-Pass-2026!"}).status_code == 401


def test_not_seeded_over_an_existing_non_admin_account_and_not_advertised(tmp_path):
    app, settings = make(tmp_path, demo_admin_email=DA[0], demo_admin_password=DA[1])
    with app.state.session_factory() as db:
        db.add(User(name="Someone", email=DA[0], password_hash=hash_password("Original-Pass-1!"), role="analyst"))
        db.commit()
        assert seed_demo_admin(db, settings) is False
        u = db.query(User).filter(User.email == DA[0]).one()
        assert u.role == "analyst" and verify_password("Original-Pass-1!", u.password_hash)
    with TestClient(app) as c:
        body = c.get("/api/auth/demo").json()
        assert body["admin_enabled"] is False and "admin" not in body
        assert c.post("/api/auth/login", json={"email": DA[0], "password": DA[1]}).status_code == 401


def test_password_resync_and_reactivation(env):
    c, app, settings = env
    with app.state.session_factory() as db:
        db.query(User).filter(User.email == DA[0]).one().active = False
        db.commit()
        new = settings.model_copy(update={"demo_admin_password": "Brand-New-Admin-9!"})
        assert seed_demo_admin(db, new) is True
        assert db.query(User).filter(User.email == DA[0]).one().active
    assert c.post("/api/auth/login", json={"email": DA[0], "password": "Brand-New-Admin-9!"}).status_code == 200
    assert c.post("/api/auth/login", json={"email": DA[0], "password": DA[1]}).status_code == 401


def test_is_demo_admin_matches_only_the_demo_account(env):
    _, app, settings = env
    with app.state.session_factory() as db:
        assert is_demo_admin(db.query(User).filter(User.email == DA[0]).one(), settings)
        assert not is_demo_admin(db.query(User).filter(User.email == ADMIN[0]).one(), settings)


# ---- guard rails


def test_data_mode_only_sample_for_demo_admin_but_real_admin_free(env):
    c, _, _ = env
    d, a = _h(c, DA), _h(c, ADMIN)
    for mode in ("live", "auto"):
        r = c.put("/api/settings/data-mode", json={"data_mode": mode}, headers=d)
        assert r.status_code == 403 and r.json()["detail"].startswith("Disabled for the shared demo administrator:")
        assert c.put("/api/settings", json={"data_mode": mode}, headers=d).status_code == 403
    assert c.put("/api/settings/data-mode", json={"data_mode": "sample"}, headers=d).status_code == 200
    assert c.put("/api/settings", json={"data_mode": "sample"}, headers=d).status_code == 200
    assert c.put("/api/settings/data-mode", json={"data_mode": "live"}, headers=a).status_code == 200
    assert c.put("/api/settings", json={"data_mode": "auto"}, headers=a).status_code == 200


def test_provider_switch_refused_for_demo_admin_allowed_for_real_admin(env):
    c, _, _ = env
    r = c.put("/api/providers/active", json={"provider": "local"}, headers=_h(c, DA))
    assert r.status_code == 403 and "shared demo administrator" in r.json()["detail"]
    assert c.put("/api/providers/active", json={"provider": "local"}, headers=_h(c, ADMIN)).status_code == 200


def test_audit_shows_demo_admin_only_its_own_rows_but_real_admin_sees_all(env):
    c, _, _ = env
    c.post("/api/auth/register", json={"name": "Other Person", "email": "other.person@example.com", "password": "Another-Pass-2026!"})
    d, a = _h(c, DA), _h(c, ADMIN)
    own = c.get("/api/audit", headers=d).json()
    assert own["total"] >= 1 and len({i["actor_id"] for i in own["items"]}) == 1
    assert "other.person@example.com" not in c.get("/api/audit/export.csv", headers=d).text
    assert "other.person@example.com" in c.get("/api/audit", headers=a).text
    assert "other.person@example.com" in c.get("/api/audit/export.csv", headers=a).text


def test_webhook_cannot_be_set_by_demo_admin_and_its_view_hides_the_real_one(env):
    c, _, _ = env
    d, a = _h(c, DA), _h(c, ADMIN)
    r = c.put("/api/settings", json={"notifications": {"webhook_url": "https://evil.example.com/x"}}, headers=d)
    assert r.status_code == 403 and r.json()["detail"].startswith("Disabled for the shared demo administrator:")
    assert c.put("/api/settings", json={"notifications": {"webhook_url": "https://hooks.example.com/real"}}, headers=a).status_code == 200
    view = c.get("/api/settings", headers=d).json()["notifications"]
    assert view["webhook_url"] == "" and view["webhook_configured"] is True
    # saving the rest of the form (empty webhook) neither fails nor clears the real one
    assert c.put("/api/settings", json={"notifications": {"email_alerts": False, "webhook_url": ""}}, headers=d).status_code == 200
    assert c.get("/api/settings", headers=a).json()["notifications"]["webhook_url"] == "https://hooks.example.com/real"
    assert c.put("/api/settings", json={"notifications": {"webhook_url": "https://hooks.example.com/new"}}, headers=a).status_code == 200


def test_other_settings_writes_stay_allowed_for_demo_admin(env):
    c, _, _ = env
    body = {"monitoring": {"sensitivity": 70, "schedule": "1d", "sources": {"telegram": True}, "impersonation_words": ["support"]},
            "notifications": {"weekly_digest": True}}
    r = c.put("/api/settings", json=body, headers=_h(c, DA))
    assert r.status_code == 200 and r.json()["monitoring"]["sensitivity"] == 70
    assert c.get("/api/health/details", headers=_h(c, DA)).status_code in (200, 503)
