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
