"""Test environment: a throw-away data directory, no scheduler, no pacing, rate limits off (they have their own test)."""
import os
import sys
import tempfile
from pathlib import Path

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="scammind_tests_")
os.environ["DATABASE_URL"] = ""
os.environ["SCAN_PACING"] = "0"
os.environ["SCHEDULER_ENABLED"] = "false"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["ADMIN_PASSWORD"] = "TestAdmin!123"
os.environ["SECRET_KEY"] = "test-secret-key-test-secret-key-0123456789"
os.environ["LLM_API_KEY"] = ""
os.environ["DEMO_MODE"] = "true"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def login(client, email="admin@company.com", password="TestAdmin!123"):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def admin(client):
    return login(client)


@pytest.fixture(scope="session")
def H(admin):
    """Auth headers for the admin."""
    return {"Authorization": f"Bearer {admin['access_token']}"}


def make_user(client, H, role, email):
    r = client.post("/api/users", headers=H, json={"name": role.title(), "email": email, "password": "Passw0rd!xyz", "role": role})
    assert r.status_code in (201, 409), r.text
    return {"Authorization": f"Bearer {login(client, email, 'Passw0rd!xyz')['access_token']}"}


@pytest.fixture(scope="session")
def analyst_H(client, H):
    return make_user(client, H, "analyst", "analyst@test.local")


@pytest.fixture(scope="session")
def viewer_H(client, H):
    return make_user(client, H, "viewer", "viewer@test.local")
