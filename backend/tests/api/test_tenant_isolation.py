"""Every account owns its own brand and workspace: nothing of brand A is readable, listable, downloadable or changeable by account B
(or by the admin), and a foreign id answers 404 (never 403) so its existence does not leak. Sample mode, no network."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api.common import get_brand_or_404, resolve_brand
from app.models import AuditLog, Brand, Detection, LookalikeCase, Scan, User
from tests.conftest import ADMIN, headers_for
from tests.scan_helpers import all_detections, make_client, png_bytes, run_scan, set_mode


def _register(client, name: str, email: str) -> dict:
    r = client.post("/api/auth/register", json={"name": name, "email": email, "password": "Correct-Horse-9"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _brand(client, h, name: str, domain: str, handle: str) -> dict:
    r = client.post("/api/brands", json={"name": name, "aliases": [name.split()[0]], "keywords": [handle], "domains": [domain]}, headers=h)
    assert r.status_code == 201, r.text
    b = r.json()
    bid = b["id"]
    assert client.post(f"/api/brands/{bid}/accounts", json={"platform": "instagram", "handle": handle}, headers=h).status_code == 201
    assert client.post(f"/api/brands/{bid}/apps", json={"name": f"{name} App", "package_id": f"com.{handle}.app", "publisher": f"{name} Ltd",
                       "stores": ["google_play"]}, headers=h).status_code == 201
    return b


class World:
    """Account A (the victim), account B (the intruder) and the admin, each with a brand of their own, scanned in sample mode."""

    def __init__(self, client: TestClient) -> None:
        self.c = client
        self.admin = headers_for(client, *ADMIN)
        set_mode(client, self.admin, "sample")
        self.a = _register(client, "Alice A", "alice@example.com")
        self.b = _register(client, "Bob B", "bob@example.com")
        self.brand_a = _brand(client, self.a, "Acme Bank", "acmebank.com", "acmebank")
        self.brand_b = _brand(client, self.b, "Zenith Pay", "zenithpay.net", "zenithpay")
        self.brand_admin = _brand(client, self.admin, "Orbit Telecom", "orbittel.com", "orbittel")
        self.aid = self.brand_a["id"]
        # A's data of every kind
        pr = client.post(f"/api/brands/{self.aid}/publishers", json={"store": "google_play", "name": "Acme Ltd", "publisher_id": "acme-ltd"}, headers=self.a)
        assert pr.status_code == 201, pr.text
        self.publisher_id = pr.json()["id"]
        assert client.post(f"/api/brands/{self.aid}/logo", files={"file": ("l.png", png_bytes((200, 30, 30)), "image/png")}, headers=self.a).status_code == 200
        ex = client.post(f"/api/brands/{self.aid}/logos", files={"file": ("l2.png", png_bytes((30, 30, 200), shape="circle"), "image/png")}, headers=self.a)
        assert ex.status_code == 201, ex.text
        self.extra_logo_id = ex.json()["id"]
        full = client.get(f"/api/brands/{self.aid}", headers=self.a).json()
        self.account_id = full["official_accounts"][0]["id"]
        self.app_id = full["official_apps"][0]["id"]
        for h in (self.a, self.b, self.admin):
            run_scan(client, h)
        self.det_a = all_detections(client, self.a)
        self.det_b = all_detections(client, self.b)
        assert self.det_a and self.det_b
        self.did = self.det_a[0]["id"]
        self.scan_a = client.get("/api/scans/latest", headers=self.a).json()["scan"]
        rep = client.post("/api/reports", json={"format": "csv", "detection_ids": [self.did]}, headers=self.a)
        assert rep.status_code == 201, rep.text
        self.report_id = rep.json()["id"]
        img = client.post("/api/candidate-images", files={"file": ("c.png", png_bytes((10, 150, 10)), "image/png")}, headers=self.a)
        assert img.status_code == 201, img.text
        self.cand_image_id = img.json()["id"]
        cases = client.get("/api/lookalike/test-cases", headers=self.a).json()["items"]
        self.case_id = cases[0]["id"]


@pytest.fixture
def w(client) -> World:
    return World(client)


def _png() -> dict:
    return {"file": ("x.png", png_bytes(), "image/png")}


def foreign_requests(w: World) -> list[tuple[str, str, dict]]:
    """Everything that names A's brand or one of A's objects. Each must be a 404 for B and for the admin."""
    a = w.aid
    q = f"?brand_id={a}"
    return [
        ("GET", f"/api/brands/{a}", {}),
        ("PUT", f"/api/brands/{a}", {"json": {"name": "Hijacked"}}),
        ("POST", f"/api/brands/{a}/logo", {"files": _png()}),
        ("GET", f"/api/brands/{a}/logo", {}),
        ("POST", f"/api/brands/{a}/logos", {"files": _png()}),
        ("GET", f"/api/brands/{a}/logos/{w.extra_logo_id}/file", {}),
        ("DELETE", f"/api/brands/{a}/logos/{w.extra_logo_id}", {}),
        ("POST", f"/api/brands/{a}/publishers", {"json": {"store": "any", "name": "Evil Ltd"}}),
        ("DELETE", f"/api/brands/{a}/publishers/{w.publisher_id}", {}),
        ("GET", f"/api/brands/{a}/accounts", {}),
        ("POST", f"/api/brands/{a}/accounts", {"json": {"platform": "x", "handle": "evilhandle"}}),
        ("DELETE", f"/api/brands/{a}/accounts/{w.account_id}", {}),
        ("GET", f"/api/brands/{a}/apps", {}),
        ("POST", f"/api/brands/{a}/apps", {"json": {"name": "Evil", "package_id": "com.evil.app", "publisher": "Evil", "stores": ["google_play"]}}),
        ("PATCH", f"/api/brands/{a}/apps/{w.app_id}", {"json": {"apple_app_id": "123456789"}}),
        ("DELETE", f"/api/brands/{a}/apps/{w.app_id}", {}),
        ("PUT", f"/api/brands/{a}/verification", {"json": {"asset_type": "domain", "asset_key": "acmebank.com", "status": "verified", "method": "dns_txt"}}),
        ("DELETE", f"/api/brands/{a}?confirm=Acme Bank", {}),
        ("POST", f"/api/brands/{a}/restore", {}),
        ("GET", f"/api/dashboard{q}", {}),
        ("GET", f"/api/detections{q}", {}),
        ("GET", f"/api/detections/excluded{q}", {}),
        ("GET", f"/api/detections/false-positives{q}", {}),
        ("GET", f"/api/detections/{w.did}", {}),
        ("GET", f"/api/detections/{w.did}/evidence", {}),
        ("GET", f"/api/detections/{w.did}/evidence/screenshot", {}),
        ("POST", f"/api/detections/{w.did}/status", {"json": {"status": "confirmed"}}),
        ("POST", f"/api/detections/{w.did}/resolution", {"json": {"resolution": "true_positive"}}),
        ("POST", f"/api/detections/{w.did}/confirm", {}),
        ("POST", f"/api/detections/{w.did}/dismiss", {}),
        ("POST", f"/api/detections/{w.did}/keep-reviewing", {}),
        ("POST", f"/api/detections/{w.did}/mark-official", {}),
        ("POST", "/api/scan", {"json": {"scope": "all", "brand_id": a}}),
        ("GET", f"/api/scan/status{q}", {}),
        ("GET", f"/api/scans{q}", {}),
        ("GET", f"/api/scans/latest{q}", {}),
        ("GET", f"/api/scans/{w.scan_a['id']}", {}),
        ("GET", f"/api/jobs/{w.scan_a['job_id']}", {}),
        ("GET", f"/api/reports{q}", {}),
        ("GET", f"/api/reports/preview{q}", {}),
        ("GET", f"/api/reports/preview.html{q}", {}),
        ("POST", "/api/reports", {"json": {"format": "csv", "brand_id": a}}),
        ("GET", f"/api/reports/{w.report_id}", {}),
        ("GET", f"/api/reports/{w.report_id}/preview", {}),
        ("GET", f"/api/reports/{w.report_id}/export.csv", {}),
        ("GET", f"/api/reports/{w.report_id}/export.html", {}),
        ("GET", f"/api/reports/{w.report_id}/download", {}),
        ("POST", f"/api/reports/{w.report_id}/approve", {}),
        ("POST", f"/api/candidates/social{q}", {"json": {"platform": "instagram", "handle": "acmebank_fake"}}),
        ("POST", f"/api/candidates/app{q}", {"json": {"store": "google_play", "package_id": "com.fake.acme", "name": "Acme Fake"}}),
        ("POST", f"/api/candidates/web{q}", {"json": {"url": "https://acme-bank-login.example"}}),
        ("POST", f"/api/candidates/import?kind=web&format=json&brand_id={a}", {"files": {"file": ("c.json", b'[{"url": "https://x.example"}]', "application/json")}}),
        ("POST", f"/api/candidate-images{q}", {"files": _png()}),
        ("GET", f"/api/candidate-images/{w.cand_image_id}/file", {}),
        ("POST", "/api/lookalike/test", {"json": {"name": "acrnebank", "brand_id": a}}),
        ("POST", "/api/lookalike/test-url", {"json": {"url": "acmebank.co", "brand_id": a}}),
        ("POST", f"/api/lookalike/test-logo{q}", {"files": _png()}),
        ("GET", f"/api/lookalike/test-urls{q}", {}),
        ("GET", f"/api/lookalike/test-cases{q}", {}),
        ("POST", f"/api/lookalike/test-cases{q}", {"json": {"name": "evilcase", "expected": "flagged"}}),
        ("DELETE", f"/api/lookalike/test-cases/{w.case_id}", {}),
        ("POST", f"/api/lookalike/test-cases/run{q}", {}),
        ("GET", f"/api/evaluation{q}", {}),
        ("POST", f"/api/evaluation/run{q}", {}),
    ]


def _call(client, method: str, path: str, h: dict, kw: dict):
    return client.request(method, path, headers=h, **kw)


def test_every_foreign_id_is_404_for_another_user(w):
    for method, path, kw in foreign_requests(w):
        r = _call(w.c, method, path, w.b, kw)
        # B is an analyst: the admin-only routes answer 403 for the ROLE before they look at the id; everything else is a 404
        admin_only = "?confirm=" in path or path.endswith("/restore") or (method in ("POST", "DELETE") and "/api/lookalike/test-cases" in path and "/run" not in path)
        assert r.status_code == (403 if admin_only else 404), (method, path, r.status_code, r.text[:200])
        assert "Acme" not in r.text, (method, path)


def test_every_foreign_id_is_404_for_the_admin_too(w):
    """No cross-tenant access for the admin: the admin owns Orbit Telecom, not Acme Bank."""
    for method, path, kw in foreign_requests(w):
        r = _call(w.c, method, path, w.admin, kw)
        assert r.status_code == 404, (method, path, r.status_code, r.text[:200])


def test_owner_still_has_access_to_all_of_it(w):
    """Sanity: the same requests that are 404 for others work for the owner (so the 404s above are about ownership, not broken routes)."""
    ok = [
        ("GET", f"/api/brands/{w.aid}"), ("GET", f"/api/brands/{w.aid}/logo"), ("GET", f"/api/brands/{w.aid}/logos/{w.extra_logo_id}/file"),
        ("GET", f"/api/dashboard?brand_id={w.aid}"), ("GET", f"/api/detections/{w.did}"), ("GET", f"/api/detections/{w.did}/evidence"),
        ("GET", f"/api/scans/{w.scan_a['id']}"), ("GET", f"/api/jobs/{w.scan_a['job_id']}"), ("GET", f"/api/reports/{w.report_id}"),
        ("GET", f"/api/reports/{w.report_id}/export.csv"), ("GET", f"/api/reports/{w.report_id}/export.html"), ("GET", f"/api/reports/{w.report_id}/download"),
        ("GET", f"/api/candidate-images/{w.cand_image_id}/file"), ("GET", f"/api/lookalike/test-cases?brand_id={w.aid}"),
        ("GET", f"/api/brands/{w.aid}/accounts"), ("GET", f"/api/brands/{w.aid}/apps"), ("GET", f"/api/scan/status?brand_id={w.aid}"),
    ]
    for method, path in ok:
        assert w.c.request(method, path, headers=w.a).status_code == 200, path


def test_downloads_are_not_possible_across_accounts(w):
    for path in (f"/api/brands/{w.aid}/logo", f"/api/brands/{w.aid}/logos/{w.extra_logo_id}/file", f"/api/candidate-images/{w.cand_image_id}/file",
                 f"/api/reports/{w.report_id}/export.csv", f"/api/reports/{w.report_id}/export.html", f"/api/reports/{w.report_id}/download",
                 f"/api/detections/{w.did}/evidence/screenshot"):
        for h in (w.b, w.admin):
            r = w.c.get(path, headers=h)
            assert r.status_code == 404 and r.headers["content-type"].startswith("application/json"), path
    # and nothing in B's own listing mentions A's files
    assert w.c.get(f"/api/brands/{w.brand_b['id']}/logo", headers=w.b).status_code == 404  # B has none: not A's


def test_lists_never_contain_the_other_accounts_rows(w):
    ids_a = {d["id"] for d in w.det_a}
    ids_b = {d["id"] for d in w.det_b}
    assert ids_a and ids_b and not (ids_a & ids_b)
    assert {d["id"] for d in all_detections(w.c, w.a)} == ids_a
    assert {d["id"] for d in all_detections(w.c, w.b)} == ids_b
    assert not ({d["id"] for d in all_detections(w.c, w.admin)} & (ids_a | ids_b))
    for h, mine in ((w.a, "Acme Bank"), (w.b, "Zenith Pay"), (w.admin, "Orbit Telecom")):
        brands = w.c.get("/api/brands", headers=h).json()
        assert [b["name"] for b in brands] == [mine]
        assert [s["brand_id"] for s in w.c.get("/api/scans", headers=h).json()["items"]] == [brands[0]["id"]]
        assert w.c.get("/api/me", headers=h).json()["default_brand_id"] == brands[0]["id"]
    assert w.c.get("/api/reports", headers=w.b).json()["total"] == 0
    assert w.c.get("/api/reports", headers=w.a).json()["total"] == 1


def test_dashboard_numbers_are_separate(w):
    da = w.c.get("/api/dashboard", headers=w.a).json()
    db_ = w.c.get("/api/dashboard", headers=w.b).json()
    assert da["brand"]["id"] == w.aid and da["brand"]["name"] == "Acme Bank"
    assert db_["brand"]["id"] == w.brand_b["id"] and db_["brand"]["name"] == "Zenith Pay"
    assert da["last_scan"]["id"] != db_["last_scan"]["id"]
    # a decision by A changes A's numbers only
    before_b = w.c.get("/api/detections", headers=w.b).json()["counts"]
    assert w.c.post(f"/api/detections/{w.did}/confirm", headers=w.a).status_code == 200
    assert w.c.get("/api/detections", headers=w.b).json()["counts"] == before_b
    assert w.c.get("/api/detections", headers=w.a).json()["counts"] != before_b


def test_scan_without_brand_id_uses_the_callers_own_brand(w):
    assert w.c.get("/api/scan/status", headers=w.b).status_code == 200
    scan = run_scan(w.c, w.b)
    mine = {s["id"] for s in w.c.get("/api/scans", headers=w.b).json()["items"]}
    assert scan["id"] in mine and mine.isdisjoint({s["id"] for s in w.c.get("/api/scans", headers=w.a).json()["items"]})
    with_id = w.c.post("/api/scan", json={"scope": "all", "brand_id": w.brand_b["id"]}, headers=w.b)
    assert with_id.status_code == 202


def test_a_new_account_without_a_brand_gets_the_usual_404(client):
    h = _register(client, "Fresh User", "fresh@example.com")
    for path in ("/api/dashboard", "/api/detections", "/api/scans", "/api/reports", "/api/lookalike/test-cases", "/api/evaluation"):
        r = client.get(path, headers=h)
        assert r.status_code == 404 and r.json() == {"detail": "No brand profile yet. Create one first."}, path
    assert client.get("/api/brands", headers=h).json() == []
    assert client.get("/api/me", headers=h).json()["default_brand_id"] is None
    assert client.post("/api/scan", json={"scope": "all"}, headers=h).status_code == 409  # the existing "create the brand first" answer


def test_many_brands_per_account_and_many_accounts(client):
    a, b = _register(client, "A One", "a1@example.com"), _register(client, "B Two", "b2@example.com")
    assert client.post("/api/brands", json={"name": "Same Name"}, headers=a).status_code == 201
    assert client.post("/api/brands", json={"name": "Same Name"}, headers=b).status_code == 409  # a brand name can only be registered once
    assert client.post("/api/brands", json={"name": "Other Name"}, headers=b).status_code == 201
    assert client.post("/api/brands", json={"name": "Second"}, headers=a).status_code == 201
    other = client.get("/api/brands", headers=b).json()
    assert len(other) == 1 and other[0]["name"] == "Other Name"  # a's brands never show up for b
    foreign = client.get("/api/brands", headers=a).json()[0]["id"]
    assert client.post(f"/api/brands/{foreign}/select", headers=b).status_code == 404  # cannot select another account's brand


def test_archive_and_restore_are_per_owner(w):
    r = w.c.delete(f"/api/brands/{w.brand_admin['id']}?confirm=Orbit Telecom", headers=w.admin)
    assert r.status_code == 200
    assert [b["name"] for b in w.c.get("/api/brands", headers=w.a).json()] == ["Acme Bank"]  # untouched
    assert w.c.get("/api/dashboard", headers=w.a).status_code == 200
    # the admin may create a new brand now (their own old one is archived), without touching anyone else's
    assert w.c.post("/api/brands", json={"name": "Orbit Two"}, headers=w.admin).status_code == 201
    assert w.c.post(f"/api/brands/{w.brand_admin['id']}/restore", headers=w.admin).status_code == 200  # several brands are allowed


def test_lookalike_cases_are_per_brand(w):
    ca = w.c.get("/api/lookalike/test-cases", headers=w.a).json()["items"]
    cb = w.c.get("/api/lookalike/test-cases", headers=w.b).json()["items"]
    assert len(ca) == len(cb) == 12
    assert {c["id"] for c in ca}.isdisjoint({c["id"] for c in cb})
    assert any("acme" in c["name"].lower() for c in ca) and not any("acme" in c["name"].lower() for c in cb)
    assert any("zenith" in c["name"].lower() for c in cb) and not any("zenith" in c["name"].lower() for c in ca)
    # an admin's own custom case stays on the admin's brand
    added = w.c.post("/api/lookalike/test-cases", json={"name": "orbit-only-case", "expected": "flagged"}, headers=w.admin)
    assert added.status_code == 201
    for h in (w.a, w.b):
        assert "orbit-only-case" not in str(w.c.get("/api/lookalike/test-cases", headers=h).json())
        assert w.c.get("/api/lookalike/test-cases", headers=h).json()["total"] == 12
    # running the cases uses the caller's own brand
    run_b = w.c.post("/api/lookalike/test-cases/run", headers=w.b).json()
    assert run_b["total"] == 12 and all(i["id"] in {c["id"] for c in cb} for i in run_b["items"])
    # renaming A's brand rebuilds A's built-in cases only
    assert w.c.put(f"/api/brands/{w.aid}", json={"name": "Apex Bank", "domains": ["acmebank.com"]}, headers=w.a).status_code == 200
    assert {c["id"] for c in w.c.get("/api/lookalike/test-cases", headers=w.b).json()["items"]} == {c["id"] for c in cb}
    assert any("apex" in c["name"].lower() for c in w.c.get("/api/lookalike/test-cases", headers=w.a).json()["items"])


def test_lookalike_testers_use_the_callers_brand(w):
    ra = w.c.post("/api/lookalike/test", json={"name": "acme bank"}, headers=w.a).json()
    rb = w.c.post("/api/lookalike/test", json={"name": "acme bank"}, headers=w.b).json()
    assert ra["brand"] == "Acme Bank" and ra["verdict"] == "official"
    assert rb["brand"] == "Zenith Pay" and rb["verdict"] != "official"
    assert w.c.post("/api/lookalike/test-url", json={"url": "https://acmebank.com/login"}, headers=w.a).json()["verdict"] == "official"
    assert w.c.post("/api/lookalike/test-url", json={"url": "https://acmebank.com/login"}, headers=w.b).json()["verdict"] != "official"
    assert w.c.get("/api/lookalike/test-urls", headers=w.b).json()["official_domain"] == "zenithpay.net"


def test_an_image_id_of_another_account_is_never_read_by_my_scan(w, app):
    """A candidate that points at A's uploaded image must not make B's scan read it (the image id is brand scoped)."""
    from app.core.pipeline import scan_pipeline as sp

    with app.state.session_factory() as db:
        brand_b = db.get(Brand, w.brand_b["id"])
        env = sp._Env(app.state.scan_ctx, db, brand_b)
        cand = type("C", (), {"extras": {"image_id": w.cand_image_id}})()
        assert sp._intake_image(env, cand) is None  # A's image: refused
        cand.extras = {"image_id": 999999}
        assert sp._intake_image(env, cand) is None


def test_settings_sensitivity_preview_counts_only_my_detections(w, db):
    a = w.c.post("/api/settings/sensitivity-preview", json={"sensitivity": 70}, headers=w.a).json()
    b = w.c.post("/api/settings/sensitivity-preview", json={"sensitivity": 70}, headers=w.b).json()
    assert a["total"] > 0 and b["total"] > 0
    mine = lambda bid: db.query(Detection).filter(Detection.brand_id == bid, Detection.source == "sample", Detection.status != "marked_official").count()  # noqa: E731
    assert a["total"] == mine(w.aid) and b["total"] == mine(w.brand_b["id"])
    assert w.c.get("/api/settings", headers=w.b).json()["account"]["organization"] == "Zenith Pay"
    assert w.c.get("/api/settings", headers=w.a).json()["account"]["organization"] == "Acme Bank"


# ---------------------------------------------------------------- audit log


def test_audit_log_shows_each_user_only_their_own_actions(w):
    a = w.c.get("/api/audit?limit=200", headers=w.a).json()
    b = w.c.get("/api/audit?limit=200", headers=w.b).json()
    adm = w.c.get("/api/audit?limit=200", headers=w.admin).json()
    assert a["total"] and b["total"]
    assert {i["actor"] for i in a["items"]} == {"Alice A"}
    assert {i["actor"] for i in b["items"]} == {"Bob B"}
    assert {"Alice A", "Bob B", "Test Admin"} <= {i["actor"] for i in adm["items"]}
    assert adm["total"] >= a["total"] + b["total"]
    assert any(i["action"] == "auth.registered" for i in a["items"])
    assert "Zenith" not in str(a) and "Acme" not in str(b)
    csv_a = w.c.get("/api/audit/export.csv", headers=w.a).text
    csv_b = w.c.get("/api/audit/export.csv", headers=w.b).text
    assert "Zenith" not in csv_a and "Alice" in csv_a and "Acme" not in csv_b and "Bob" in csv_b
    assert "Acme" in w.c.get("/api/audit/export.csv", headers=w.admin).text


def test_audit_filter_cannot_widen_the_scope(w):
    r = w.c.get("/api/audit", params={"actor": "Alice A"}, headers=w.b).json()
    assert r["total"] == 0 and r["items"] == []


# ---------------------------------------------------------------- memo and cache cannot leak


def test_brand_memo_is_keyed_by_user(w, db):
    ua = db.query(User).filter_by(email="alice@example.com").one()
    ub = db.query(User).filter_by(email="bob@example.com").one()
    # same session, no commit in between: the memo is live
    assert resolve_brand(db, None, ua).id == w.aid
    assert resolve_brand(db, None, ub).id == w.brand_b["id"]
    assert get_brand_or_404(db, w.aid, ua).id == w.aid
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as e:
        get_brand_or_404(db, w.aid, ub)
    assert e.value.status_code == 404
    with pytest.raises(HTTPException):
        resolve_brand(db, w.aid, ub)
    assert resolve_brand(db, None, ua).id == w.aid  # still A's after B's lookups


def test_response_cache_never_serves_one_users_page_to_another(settings, checker):
    cached = settings.model_copy(update={"response_cache_seconds": 60})
    with make_client(cached, checker) as c:
        w = World(c)
        warm = c.get(f"/api/detections?brand_id={w.aid}", headers=w.a)
        assert warm.status_code == 200
        again = c.get(f"/api/detections?brand_id={w.aid}", headers=w.a)
        assert again.headers.get("x-cache") == "hit"  # the cache is really on
        stolen = c.get(f"/api/detections?brand_id={w.aid}", headers=w.b)
        assert stolen.status_code == 404 and stolen.headers.get("x-cache") is None
        for path in ("/api/brands", "/api/dashboard", "/api/detections", "/api/reports", "/api/scans", "/api/lookalike/test-cases", "/api/settings"):
            ra, rb = c.get(path, headers=w.a), c.get(path, headers=w.b)
            c.get(path, headers=w.a)  # A's page is now cached
            rb2 = c.get(path, headers=w.b)
            assert rb2.status_code == rb.status_code and rb2.json() == rb.json(), path
            if path not in ("/api/settings",):
                assert ra.json() != rb.json() or ra.status_code != 200, path
        assert "Acme" not in c.get("/api/brands", headers=w.b).text


# ---------------------------------------------------------------- end to end


def test_signup_create_brand_scan_end_to_end_in_sample_mode(client, admin_h):
    set_mode(client, admin_h, "sample")
    h = _register(client, "New Founder", "founder@example.com")
    assert client.get("/api/me", headers=h).json()["role"] == "analyst"
    b = _brand(client, h, "Nimbus Cloud", "nimbuscloud.io", "nimbuscloud")
    assert client.get("/api/me", headers=h).json()["default_brand_id"] == b["id"]
    scan = run_scan(client, h)
    assert scan["state"] == "done"
    dets = all_detections(client, h)
    assert dets
    dash = client.get("/api/dashboard", headers=h).json()
    assert dash["brand"]["name"] == "Nimbus Cloud" and dash["last_scan"]["id"] == scan["id"]
    assert client.get("/api/lookalike/test-cases", headers=h).json()["total"] == 12
    assert client.get("/api/audit", headers=h).json()["total"] >= 4
    # the seeded admin has no brand and sees none of it
    assert client.get("/api/brands", headers=admin_h).json() == []
    assert client.get("/api/dashboard", headers=admin_h).status_code == 404


def test_scan_row_belongs_to_the_brand_in_the_database(w, db):
    rows = {s.brand_id for s in db.query(Scan)}
    assert rows == {w.aid, w.brand_b["id"], w.brand_admin["id"]}
    owners = {b.name: b.owner_id for b in db.query(Brand)}
    assert len(set(owners.values())) == 3
    assert db.query(LookalikeCase).filter(LookalikeCase.brand_id.is_(None)).count() == 0
    assert db.query(AuditLog).count() > 0
