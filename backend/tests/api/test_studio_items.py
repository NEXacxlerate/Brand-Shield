"""Brand Studio saved items: owner-only, validated, capped."""

from __future__ import annotations

import base64
import json

import pytest

from app.models import StudioItem
from tests.scan_helpers import png_bytes

PALETTE = {"paletteName": "Ocean", "mood": "calm", "colors": [{"name": "Deep", "hex": "#123456", "role": "Primary", "description": "x"}], "usage": "u"}


def _user(client, name: str, email: str) -> dict:
    r = client.post("/api/auth/register", json={"name": name, "email": email, "password": "Correct-Horse-9"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def ua(client):
    return _user(client, "Una Studio", "una@example.com")


@pytest.fixture
def ub(client):
    return _user(client, "Ben Studio", "ben@example.com")


def save(client, h, type_="palette", label="Ocean palette", data=PALETTE, **extra):
    return client.post("/api/studio/items", json={"type": type_, "label": label, "data": data, **extra}, headers=h)


def test_requires_sign_in(client):
    assert client.get("/api/studio/items").status_code == 401
    assert client.post("/api/studio/items", json={"type": "logo", "label": "x"}).status_code == 401
    assert client.delete("/api/studio/items/1").status_code == 401
    assert client.get("/api/studio/items/1/image").status_code == 401


def test_create_list_delete_matches_the_saved_item_shape(client, ua):
    r = save(client, ua)
    assert r.status_code == 201, r.text
    item = r.json()
    assert set(item) == {"id", "userId", "type", "label", "data", "url", "timestamp", "created_at"}
    assert isinstance(item["id"], str) and isinstance(item["userId"], str) and isinstance(item["timestamp"], int)
    assert item["type"] == "palette" and item["label"] == "Ocean palette" and item["data"] == PALETTE and item["url"] is None
    lst = client.get("/api/studio/items", headers=ua).json()
    assert lst["total"] == 1 and lst["items"][0]["id"] == item["id"]
    assert client.get(f"/api/studio/items/{item['id']}/image", headers=ua).status_code == 404  # no picture on this one
    assert client.delete(f"/api/studio/items/{item['id']}", headers=ua).json() == {"ok": True, "detail": ""}
    assert client.get("/api/studio/items", headers=ua).json()["total"] == 0
    assert client.delete(f"/api/studio/items/{item['id']}", headers=ua).status_code == 404


def test_all_six_types_and_filter_paging_order(client, ua):
    for i, t in enumerate(("logo", "palette", "brand_name", "content", "audit", "sentiment")):
        assert save(client, ua, t, f"item {i}", {"n": i}).status_code == 201
    assert client.get("/api/studio/items", headers=ua).json()["total"] == 6
    only = client.get("/api/studio/items?type=audit", headers=ua).json()
    assert only["total"] == 1 and only["items"][0]["type"] == "audit"
    page = client.get("/api/studio/items?limit=2&offset=1", headers=ua).json()
    assert page["total"] == 6 and [i["label"] for i in page["items"]] == ["item 4", "item 3"]  # newest first
    assert client.get("/api/studio/items?type=bogus", headers=ua).status_code == 422
    assert client.get("/api/studio/items?limit=0", headers=ua).status_code == 422
    assert client.get("/api/studio/items?limit=501", headers=ua).status_code == 422


def test_validation(client, ua):
    assert save(client, ua, "nope").status_code == 422
    assert save(client, ua, label="   ").status_code == 422
    assert save(client, ua, label="x" * 201).status_code == 422
    assert save(client, ua, label="x" * 200).status_code == 201
    assert client.post("/api/studio/items", content=b"[1]", headers={**ua, "Content-Type": "application/json"}).status_code == 422
    assert client.post("/api/studio/items", content=b"{", headers={**ua, "Content-Type": "application/json"}).status_code == 422
    assert client.post("/api/studio/items", content=b"x", headers={**ua, "Content-Type": "text/plain"}).status_code == 415


def test_data_size_cap_is_64_kb(client, ua):
    assert save(client, ua, data={"t": "a" * 60000}).status_code == 201
    big = save(client, ua, data={"t": "a" * 70000})
    assert big.status_code == 413 and "64 KB" in big.json()["detail"]
    assert save(client, ua, data=None).status_code == 201


def test_per_user_cap_is_500(client, ua, ub, app):
    with app.state.session_factory() as db:
        uid = int(client.get("/api/me", headers=ua).json()["id"])
        db.add_all([StudioItem(user_id=uid, type="logo", label=f"l{i}") for i in range(500)])
        db.commit()
    r = save(client, ua)
    assert r.status_code == 409 and "500" in r.json()["detail"]
    assert save(client, ub).status_code == 201  # the cap is per user


def test_image_base64_roundtrip_and_reencoding(client, ua):
    raw = png_bytes((10, 90, 200))
    r = save(client, ua, "logo", "My logo", {"brand": "Acme"}, image_base64=base64.b64encode(raw).decode())
    assert r.status_code == 201, r.text
    item = r.json()
    assert item["url"] == f"/api/studio/items/{item['id']}/image"
    img = client.get(item["url"], headers=ua)
    assert img.status_code == 200 and img.headers["content-type"] == "image/png" and img.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert img.headers["x-content-type-options"] == "nosniff" and "private" in img.headers["cache-control"]
    # a data: URL works too, and the same picture twice shares one file
    r2 = save(client, ua, "logo", "Again", None, image_base64="data:image/png;base64," + base64.b64encode(raw).decode())
    assert r2.status_code == 201
    assert client.delete(f"/api/studio/items/{item['id']}", headers=ua).status_code == 200
    assert client.get(r2.json()["url"], headers=ua).status_code == 200  # the shared file survived the first delete
    assert client.delete(f"/api/studio/items/{r2.json()['id']}", headers=ua).status_code == 200


def test_image_validation(client, ua):
    assert save(client, ua, "logo", image_base64="not base64 !!").status_code == 422
    assert save(client, ua, "logo", image_base64=base64.b64encode(b"GIF89a....").decode()).status_code == 415
    assert save(client, ua, "logo", image_base64=base64.b64encode(b"<svg xmlns='http://www.w3.org/2000/svg'/>").decode()).status_code == 415
    assert save(client, ua, "logo", image_base64=base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"junk").decode()).status_code == 415
    too_big = png_bytes(size=300) + b"\x00" * (2 * 1024 * 1024)
    assert save(client, ua, "logo", image_base64=base64.b64encode(too_big).decode()).status_code == 413
    assert save(client, ua, "logo", image_base64=123).status_code == 422
    assert client.get("/api/studio/items", headers=ua).json()["total"] == 0  # nothing half saved


def test_multipart_upload(client, ua):
    r = client.post("/api/studio/items", data={"type": "logo", "label": "From form", "data": json.dumps({"style": "Minimalist"})},
                    files={"file": ("logo.png", png_bytes(), "image/png")}, headers=ua)
    assert r.status_code == 201, r.text
    assert r.json()["data"] == {"style": "Minimalist"} and r.json()["url"]
    no_file = client.post("/api/studio/items", data={"type": "audit", "label": "No picture"}, files={"x": ("", b"")}, headers=ua)
    assert no_file.status_code == 201 and no_file.json()["url"] is None
    bad = client.post("/api/studio/items", data={"type": "audit", "label": "Bad", "data": "{nope"}, files={"x": ("", b"")}, headers=ua)
    assert bad.status_code == 422
    txt = client.post("/api/studio/items", data={"type": "logo", "label": "x"}, files={"file": ("a.png", b"not an image", "image/png")}, headers=ua)
    assert txt.status_code == 415


def test_other_users_items_are_invisible_and_untouchable(client, ua, ub):
    mine = save(client, ua, "logo", "private logo", {"secret": "A"}, image_base64=base64.b64encode(png_bytes()).decode()).json()
    assert client.get("/api/studio/items", headers=ub).json() == {"total": 0, "limit": 100, "offset": 0, "items": []}
    assert client.get(f"/api/studio/items/{mine['id']}/image", headers=ub).status_code == 404
    assert client.delete(f"/api/studio/items/{mine['id']}", headers=ub).status_code == 404
    assert client.get(f"/api/studio/items/{mine['id']}/image", headers=ua).status_code == 200  # still there for the owner
    assert client.get("/api/studio/items?type=logo", headers=ub).json()["total"] == 0


def test_admin_cannot_read_a_users_items_either(client, ua, admin_h):
    mine = save(client, ua).json()
    assert client.get("/api/studio/items", headers=admin_h).json()["total"] == 0
    assert client.delete(f"/api/studio/items/{mine['id']}", headers=admin_h).status_code == 404


def test_odd_ids_are_404(client, ua):
    for bad in ("abc", "0", "99999999999999999999", "-1", "1.5"):
        assert client.delete(f"/api/studio/items/{bad}", headers=ua).status_code == 404
        assert client.get(f"/api/studio/items/{bad}/image", headers=ua).status_code == 404


def test_viewers_can_use_their_own_collection(client, viewer_h):
    assert save(client, viewer_h).status_code == 201
    assert client.get("/api/studio/items", headers=viewer_h).json()["total"] == 1
