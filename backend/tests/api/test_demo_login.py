"""The public demo account behind the login page's "Use demo credentials" button."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config.config import Settings
from app.config.security import hash_password
from app.db.base import Base
from app.db.session import make_engine
from app.main import create_app
from app.models import User
from app.services.seed import demo_enabled, seed_demo
from tests.conftest import FakeChecker

ADMIN = ("admin@example.com", "Passw0rd!Passw0rd")
DEMO = ("demo@brandshield.app", "Demo-Brand-2026!")


def make(tmp_path, **kw):
    base = dict(_env_file=None, data_dir=tmp_path / "data", database_url="sqlite://", response_cache_seconds=0,
                admin_email=ADMIN[0], admin_password=ADMIN[1], jwt_secret="x" * 40)
    base.update(kw)
    settings = Settings(**base)  # type: ignore[call-arg]
    engine = make_engine("sqlite://")
    Base.metadata.create_all(engine)
    return create_app(settings, engine=engine, url_checker=FakeChecker()), settings  # type: ignore[arg-type]


@pytest.fixture
def demo_client(tmp_path):
    app, _ = make(tmp_path, demo_email=DEMO[0], demo_password=DEMO[1])
    with TestClient(app) as c:
        yield c, app


def test_enabled_returns_the_credentials_uncached(demo_client):
    c, _ = demo_client
    r = c.get("/api/auth/demo")
    assert r.status_code == 200
    assert r.json() == {"enabled": True, "email": DEMO[0], "password": DEMO[1], "admin_enabled": False}
    assert r.headers["cache-control"] == "no-store"


def test_demo_credentials_sign_in_as_a_non_admin_analyst_without_admin_rights(demo_client):
    c, _ = demo_client
    creds = c.get("/api/auth/demo").json()
    login = c.post("/api/auth/login", json={"email": creds["email"], "password": creds["password"]})
    assert login.status_code == 200
    assert login.json()["user"]["role"] == "analyst"
    h = {"Authorization": "Bearer " + login.json()["access_token"]}
    assert c.put("/api/settings/data-mode", json={"data_mode": "live"}, headers=h).status_code == 403  # admin-only


def test_disabled_without_settings_and_leaks_nothing(tmp_path):
    app, _ = make(tmp_path)
    with TestClient(app) as c:
        r = c.get("/api/auth/demo")
        assert r.json() == {"enabled": False, "admin_enabled": False}
        assert c.post("/api/auth/login", json={"email": DEMO[0], "password": DEMO[1]}).status_code == 401


def test_half_configured_is_disabled(tmp_path):
    app, _ = make(tmp_path, demo_email=DEMO[0])
    with TestClient(app) as c:
        assert c.get("/api/auth/demo").json() == {"enabled": False, "admin_enabled": False}


def test_demo_email_equal_to_admin_email_is_refused(tmp_path):
    app, settings = make(tmp_path, demo_email=ADMIN[0], demo_password="Another-Demo-Pass1!")
    assert not demo_enabled(settings)
    with TestClient(app) as c:
        assert c.get("/api/auth/demo").json() == {"enabled": False, "admin_enabled": False}
        # the admin's own password still works and the demo password does not log in as the admin
        assert c.post("/api/auth/login", json={"email": ADMIN[0], "password": "Another-Demo-Pass1!"}).status_code == 401
        assert c.post("/api/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]}).status_code == 200


def test_changed_demo_password_is_applied_at_the_next_start(tmp_path):
    app, settings = make(tmp_path, demo_email=DEMO[0], demo_password=DEMO[1])
    with TestClient(app):
        pass
    # the next start: same database, DEMO_PASSWORD changed in the environment
    new_settings = settings.model_copy(update={"demo_password": "A-Brand-New-Demo-Pass9"})
    restarted = create_app(new_settings, engine=app.state.engine, url_checker=FakeChecker())  # type: ignore[arg-type]
    with TestClient(restarted) as c:
        assert c.post("/api/auth/login", json={"email": DEMO[0], "password": "A-Brand-New-Demo-Pass9"}).status_code == 200
        assert c.post("/api/auth/login", json={"email": DEMO[0], "password": DEMO[1]}).status_code == 401


def test_an_existing_non_analyst_account_is_never_touched(tmp_path):
    app, settings = make(tmp_path, demo_email=DEMO[0], demo_password=DEMO[1])
    with app.state.session_factory() as db:
        db.add(User(name="Real Admin", email=DEMO[0], password_hash=hash_password("Original-Admin-Pass1!"), role="admin"))
        db.commit()
        assert seed_demo(db, settings) is False
        assert db.query(User).filter(User.email == DEMO[0]).one().role == "admin"
    with TestClient(app) as c:
        assert c.post("/api/auth/login", json={"email": DEMO[0], "password": "Original-Admin-Pass1!"}).status_code == 200


def test_demo_account_owns_its_own_brand_like_any_other_account(demo_client):
    c, _ = demo_client
    creds = c.get("/api/auth/demo").json()
    token = c.post("/api/auth/login", json={"email": creds["email"], "password": creds["password"]}).json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    r = c.post("/api/brands", json={"name": "Demo Brand", "aliases": [], "keywords": [], "domains": []}, headers=h)
    assert r.status_code == 201
    admin = c.post("/api/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]}).json()["access_token"]
    assert "Demo Brand" not in c.get("/api/brands", headers={"Authorization": f"Bearer {admin}"}).text
