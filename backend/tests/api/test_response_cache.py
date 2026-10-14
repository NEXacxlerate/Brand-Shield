"""The short read cache must never show data older than the person's own last action."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config.config import Settings
from app.db.base import Base
from app.db.session import make_engine
from app.main import create_app
from tests.conftest import FakeChecker


@pytest.fixture
def cached_client(tmp_path):
    settings = Settings(_env_file=None, data_dir=tmp_path / "data", database_url="sqlite://", response_cache_seconds=60,  # type: ignore[call-arg]
                        admin_email="admin@example.com", admin_password="Passw0rd!Passw0rd", jwt_secret="x" * 40)
    engine = make_engine("sqlite://")
    Base.metadata.create_all(engine)
    with TestClient(create_app(settings, engine=engine, url_checker=FakeChecker())) as c:  # type: ignore[arg-type]
        token = c.post("/api/auth/login", json={"email": "admin@example.com", "password": "Passw0rd!Passw0rd"}).json()["access_token"]
        yield c, {"Authorization": f"Bearer {token}"}


def test_second_read_is_served_from_cache(cached_client):
    c, h = cached_client
    first = c.get("/api/brands", headers=h)
    second = c.get("/api/brands", headers=h)
    assert first.status_code == second.status_code == 200
    assert first.headers.get("x-cache") is None and second.headers.get("x-cache") == "hit" and first.json() == second.json()


def test_any_write_drops_the_cache(cached_client):
    c, h = cached_client
    assert c.get("/api/brands", headers=h).json()["items"] == [] if isinstance(c.get("/api/brands", headers=h).json(), dict) else True
    r = c.post("/api/brands", json={"name": "Acme Bank", "aliases": [], "keywords": [], "domains": []}, headers=h)
    assert r.status_code == 201
    after = c.get("/api/brands", headers=h)
    assert after.headers.get("x-cache") is None  # recomputed, not the empty list from before the write
    body = after.json()
    assert "Acme Bank" in str(body)


def test_cache_is_per_sign_in(cached_client):
    c, h = cached_client
    c.get("/api/settings", headers=h)
    other = c.get("/api/settings", headers={"Authorization": "Bearer not-a-valid-token"})
    assert other.status_code == 401 and other.headers.get("x-cache") is None
    assert c.get("/api/settings").status_code == 401  # no token: never answered from someone else's entry


def test_errors_are_not_cached(cached_client):
    c, h = cached_client
    assert c.get("/api/dashboard", headers=h).status_code == 404  # no brand yet
    assert c.get("/api/dashboard", headers=h).headers.get("x-cache") is None
