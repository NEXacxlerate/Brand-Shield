"""File storage: the same behaviour on the local store (default) and the database store (Vercel)."""

from __future__ import annotations

import hashlib
import io

import pytest
from PIL import Image

from app.config.config import Settings
from app.core.storage import DatabaseFileStore, LocalFileStore, build_store, clean_rel_path
from app.db.base import Base
from app.db.session import make_engine, make_session_factory
from app.models import Brand, Detection, StoredFile
from tests.conftest import ADMIN, headers_for
from tests.scan_helpers import StaticCollector, all_detections, make_client, png_bytes, run_scan, set_mode, setup_brand, social

BACKENDS = ["local", "database"]


@pytest.fixture(params=BACKENDS)
def backend(request) -> str:
    return request.param


@pytest.fixture
def bsettings(tmp_path, backend) -> Settings:
    return Settings(_env_file=None, data_dir=tmp_path / "data", database_url="sqlite://", response_cache_seconds=0, storage_backend=backend)  # type: ignore[call-arg]


def logo_png(color=(20, 60, 200)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (300, 300), color).save(out, format="PNG")
    return out.getvalue()


def test_build_store_follows_the_setting(tmp_path):
    sf = make_session_factory(make_engine("sqlite://"))
    assert isinstance(build_store(Settings(_env_file=None, data_dir=tmp_path, database_url="sqlite://"), sf), LocalFileStore)  # type: ignore[call-arg]
    s = Settings(_env_file=None, data_dir=tmp_path, database_url="sqlite://", storage_backend="database")  # type: ignore[call-arg]
    assert isinstance(build_store(s, sf), DatabaseFileStore)
    with pytest.raises(ValueError):
        build_store(Settings(_env_file=None, data_dir=tmp_path, database_url="sqlite://", storage_backend="s3"), sf)  # type: ignore[call-arg]


@pytest.fixture
def store(bsettings):
    engine = make_engine("sqlite://")
    Base.metadata.create_all(engine)
    return build_store(bsettings, make_session_factory(engine))


def test_store_roundtrip_overwrite_delete(store):
    assert store.read("a/b.png") is None and not store.exists("a/b.png")
    store.write("a/b.png", b"one")
    assert store.read("a/b.png") == b"one" and store.exists("a/b.png")
    store.write("a/b.png", b"two")  # same path: replaced, not duplicated
    assert store.read("a/b.png") == b"two"
    store.delete("a/b.png")
    store.delete("a/b.png")  # deleting twice is fine
    assert store.read("a/b.png") is None


@pytest.mark.parametrize("bad", ["../x", "a/../../x", "/etc/passwd", "a\\b", "C:/x", "", None, "x\x00y", "a/" + "b" * 400])
def test_store_refuses_paths_outside_the_store(store, bad):
    assert store.read(bad) is None and not store.exists(bad)
    store.delete(bad)  # no error, nothing happens
    if bad:
        with pytest.raises(ValueError):
            store.write(bad, b"x")
    assert clean_rel_path(bad) is None


def test_local_store_does_not_follow_a_traversal_even_if_the_file_exists(tmp_path):
    (tmp_path / "secret.txt").write_bytes(b"s")
    root = tmp_path / "data"
    root.mkdir()
    assert LocalFileStore(root).read("../secret.txt") is None


@pytest.fixture
def client_for(bsettings, checker):
    with make_client(bsettings, checker, []) as c:
        h = headers_for(c, *ADMIN)
        r = c.post("/api/brands", json={"name": "Acme Bank", "aliases": ["Acme"]}, headers=h)
        assert r.status_code == 201, r.text
        yield c, h, r.json()


def test_logo_upload_and_serve(client_for):
    c, h, brand = client_for
    r = c.post(f"/api/brands/{brand['id']}/logo", files={"file": ("l.png", logo_png(), "image/png")}, headers=h)
    assert r.status_code == 200, r.text
    got = c.get(f"/api/brands/{brand['id']}/logo", headers=h)
    assert got.status_code == 200 and got.headers["content-type"] == "image/png"
    assert got.headers["x-content-type-options"] == "nosniff" and got.headers["etag"]
    assert Image.open(io.BytesIO(got.content)).size == (300, 300)
    # same relative path layout as before; replacing the logo removes the old file
    with c.app_ref.state.session_factory() as db:
        old_path = db.get(Brand, brand["id"]).logo_path
    assert old_path.startswith(f"logos/brand_{brand['id']}/") and old_path.endswith(".png")
    r2 = c.post(f"/api/brands/{brand['id']}/logo", files={"file": ("l.png", logo_png((200, 20, 20)), "image/png")}, headers=h)
    assert r2.status_code == 200
    assert not c.app_ref.state.file_store.exists(old_path)
    assert c.get(f"/api/brands/{brand['id']}/logo", headers=h).status_code == 200


def test_missing_logo_file_is_a_404(client_for):
    c, h, brand = client_for
    c.post(f"/api/brands/{brand['id']}/logo", files={"file": ("l.png", logo_png(), "image/png")}, headers=h)
    with c.app_ref.state.session_factory() as db:
        path = db.get(Brand, brand["id"]).logo_path
    c.app_ref.state.file_store.delete(path)
    r = c.get(f"/api/brands/{brand['id']}/logo", headers=h)
    assert r.status_code == 404 and r.json()["detail"] == "Logo file is missing"


def test_extra_logo_add_and_serve(client_for):
    c, h, brand = client_for
    r = c.post(f"/api/brands/{brand['id']}/logos?label=Dark", files={"file": ("l.png", logo_png((5, 5, 5)), "image/png")}, headers=h)
    assert r.status_code == 201, r.text
    body = r.json()
    got = c.get(body["url"], headers=h)
    assert got.status_code == 200 and got.headers["content-type"] == "image/png" and hashlib.sha256(got.content).hexdigest() == body["sha256"]
    assert c.get(f"/api/brands/{brand['id']}/logos/99999/file", headers=h).status_code == 404


def test_candidate_image_upload_and_serve(client_for):
    c, h, _brand = client_for
    r = c.post("/api/candidate-images", files={"file": ("../../evil.php", logo_png(), "text/html")}, headers=h)
    assert r.status_code == 201, r.text
    got = c.get(r.json()["url"], headers=h)
    assert got.status_code == 200 and got.headers["content-type"] == "image/png"
    assert got.headers["content-disposition"] == "inline" and got.headers["x-content-type-options"] == "nosniff"
    again = c.post("/api/candidate-images", files={"file": ("x.png", logo_png(), "image/png")}, headers=h)
    assert again.json()["id"] == r.json()["id"]


def test_lookalike_logo_test_reads_official_logos_from_the_store(client_for):
    c, h, brand = client_for
    png = logo_png()
    c.post(f"/api/brands/{brand['id']}/logo", files={"file": ("l.png", png, "image/png")}, headers=h)
    r = c.post("/api/lookalike/test-logo", files={"file": ("c.png", png, "image/png")}, headers=h)
    assert r.status_code == 200, r.text


def test_evidence_snapshot_hash_is_verified_and_tampering_detected(bsettings, checker, backend):
    with make_client(bsettings, checker, [StaticCollector([social("instagram", "acrnebank", "Acrnebank", bio="hello")])]) as c:
        h = headers_for(c, *ADMIN)
        set_mode(c, h, "live")
        setup_brand(c, h, accounts=(), apps=())
        run_scan(c, h)
        det = all_detections(c, h)[0]
        bundle = c.get(f"/api/detections/{det['id']}/evidence", headers=h).json()
        assert bundle["hash_verified"] is True and bundle["snapshot"]["handle"]
        with c.app_ref.state.session_factory() as db:
            stored = db.get(Detection, det["id"]).evidence
        rel = stored["snapshot_path"]
        assert rel.startswith("evidence/") and rel.endswith(".json")
        store = c.app_ref.state.file_store
        raw = store.read(rel)
        assert hashlib.sha256(raw).hexdigest() == bundle["sha256"]
        assert c.get(f"/api/detections/{det['id']}/evidence/screenshot", headers=h).status_code == 404
        store.write(rel, raw + b" ")  # tampering is detected
        assert c.get(f"/api/detections/{det['id']}/evidence", headers=h).json()["hash_verified"] is False
        if backend == "database":
            with c.app_ref.state.session_factory() as db:
                assert db.get(StoredFile, rel).size_bytes == len(raw) + 1  # really in the table


class FakeShots:
    def __init__(self, png: bytes) -> None:
        self.png = png

    def capture(self, url):
        return self.png


def test_screenshot_is_stored_and_served(bsettings, checker):
    shots = FakeShots(png_bytes())
    cands = [social("instagram", "acrnebank", "Acrnebank", bio="hello")]
    with make_client(bsettings, checker, [StaticCollector(cands)], screenshot_provider=shots) as c:
        h = headers_for(c, *ADMIN)
        set_mode(c, h, "live")
        setup_brand(c, h, accounts=(), apps=())
        run_scan(c, h)
        det = all_detections(c, h)[0]
        d = c.get(f"/api/detections/{det['id']}", headers=h).json()
        r = c.get(d["evidence"]["screenshot_url"], headers=h)
        assert r.status_code == 200 and r.headers["content-type"] == "image/png" and r.content == shots.png
        assert r.headers["x-content-type-options"] == "nosniff"


def test_sample_scan_reads_the_official_logo_through_the_store(bsettings, checker):
    with make_client(bsettings, checker, None) as c:
        h = headers_for(c, *ADMIN)
        set_mode(c, h, "sample")
        b = setup_brand(c, h)
        c.post(f"/api/brands/{b['id']}/logo", files={"file": ("l.png", logo_png(), "image/png")}, headers=h)
        scan = run_scan(c, h)
        assert scan["state"] == "done" and scan["counts"]["detections_new"] > 0


def test_health_data_dir_check_works_for_both_stores(bsettings, checker):
    with make_client(bsettings, checker, []) as c:
        r = c.get("/health")
        assert r.status_code == 200, r.text
        assert r.json()["components"]["data_dir"] == "ok"
