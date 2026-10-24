"""Admin brand management: the admin lists every account's brands and can delete any of them; nobody else can."""

from __future__ import annotations

from tests.conftest import ADMIN, headers_for


def _user_with_brand(client, email: str, name: str) -> tuple[dict, int]:
    r = client.post("/api/auth/register", json={"name": "Some User", "email": email, "password": "Correct-Horse-9"})
    assert r.status_code == 201, r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    b = client.post("/api/brands", json={"name": name, "domains": [f"{name.lower()}.com"]}, headers=h)
    assert b.status_code == 201, b.text
    return h, b.json()["id"]


def test_admin_lists_and_deletes_any_brand(client):
    admin = headers_for(client, *ADMIN)
    user_h, bid = _user_with_brand(client, "carol@example.com", "Globex")

    rows = client.get("/api/admin/brands", headers=admin).json()
    row = next(r for r in rows if r["id"] == bid)
    assert row["owner_email"] == "carol@example.com"

    assert client.delete(f"/api/admin/brands/{bid}", headers=admin).status_code == 409  # exact name required
    assert client.delete(f"/api/admin/brands/{bid}?confirm=Globex", headers=admin).status_code == 200
    assert all(r["id"] != bid for r in client.get("/api/admin/brands", headers=admin).json())
    assert client.get("/api/brands", headers=user_h).json() == []
    assert client.delete(f"/api/admin/brands/{bid}?confirm=Globex", headers=admin).status_code == 404


def test_non_admin_cannot_use_admin_brand_endpoints(client):
    user_h, bid = _user_with_brand(client, "dave@example.com", "Initech")
    assert client.get("/api/admin/brands", headers=user_h).status_code == 403
    assert client.delete(f"/api/admin/brands/{bid}?confirm=Initech", headers=user_h).status_code == 403
    assert client.get("/api/admin/brands").status_code == 401


def test_list_hides_sample_and_demo_brands(client, db):
    from app.models import Brand

    admin = headers_for(client, *ADMIN)
    _, real = _user_with_brand(client, "erin@example.com", "RealCo")
    _, fake = _user_with_brand(client, "frank@example.com", "FakeCo")
    db.get(Brand, fake).source = "sample"
    db.commit()
    ids = [r["id"] for r in client.get("/api/admin/brands", headers=admin).json()]
    assert real in ids and fake not in ids


def test_same_brand_name_cannot_be_registered_twice(client):
    admin = headers_for(client, *ADMIN)
    h1, bid = _user_with_brand(client, "gina@example.com", "Umbrella")
    r = client.post("/api/auth/register", json={"name": "Hal", "email": "hal@example.com", "password": "Correct-Horse-9"})
    h2 = {"Authorization": f"Bearer {r.json()['access_token']}"}
    dup = client.post("/api/brands", json={"name": "  umbrella  ", "domains": ["other.com"]}, headers=h2)
    assert dup.status_code == 409
    other = client.post("/api/brands", json={"name": "Other Brand", "domains": ["other.com"]}, headers=h2).json()["id"]
    assert client.put(f"/api/brands/{other}", json={"name": "UMBRELLA", "domains": ["other.com"]}, headers=h2).status_code == 409
    # deleting frees the name
    assert client.delete(f"/api/admin/brands/{bid}?confirm=Umbrella", headers=admin).status_code == 200
    assert client.post("/api/brands", json={"name": "Umbrella", "domains": ["u.com"]}, headers=h2).status_code == 201
