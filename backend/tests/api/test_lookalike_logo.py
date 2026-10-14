import io
import random

import pytest
from PIL import Image, ImageDraw, ImageEnhance, ImageOps

from app.core.pipeline.logo_compare import verdict_for

URL = "/api/lookalike/test-logo"


def make_logo(seed: int, size: int = 300) -> Image.Image:
    rnd = random.Random(seed)
    img = Image.new("RGB", (size, size), tuple(rnd.randint(0, 255) for _ in range(3)))
    d = ImageDraw.Draw(img)
    for _ in range(5):
        fg = tuple(rnd.randint(0, 255) for _ in range(3))
        x0, y0 = rnd.randint(0, size // 2), rnd.randint(0, size // 2)
        x1, y1 = rnd.randint(size // 2, size), rnd.randint(size // 2, size)
        kind = rnd.choice(["rect", "ellipse", "poly"])
        if kind == "rect":
            d.rectangle([x0, y0, x1, y1], fill=fg)
        elif kind == "ellipse":
            d.ellipse([x0, y0, x1, y1], fill=fg)
        else:
            d.polygon([(x0, y1), (x1, y1), ((x0 + x1) // 2, y0)], fill=fg)
    return img


def enc(img: Image.Image, fmt: str = "PNG") -> bytes:
    buf = io.BytesIO()
    img.save(buf, fmt)
    return buf.getvalue()


def files(candidate: bytes, reference: bytes | None = None, ctype: str = "image/png") -> dict:
    out = {"file": ("anything.png", candidate, ctype)}
    if reference is not None:
        out["reference"] = ("ref.png", reference, "image/png")
    return out


OFFICIAL = make_logo(1)


@pytest.fixture
def with_logo(client, admin_h, brand):
    r = client.post(f"/api/brands/{brand['id']}/logo", files={"file": ("l.png", enc(OFFICIAL), "image/png")}, headers=admin_h)
    assert r.status_code == 200, r.text
    return brand


def post(client, h, **kw):
    return client.post(URL, headers=h, **kw)


def test_unauthenticated_401(client, brand):
    assert client.post(URL, files=files(enc(OFFICIAL))).status_code == 401


def test_exact_copy_and_ordering(client, viewer_h, with_logo):
    copy = post(client, viewer_h, files=files(enc(OFFICIAL))).json()  # viewers may use the tester
    resized = post(client, viewer_h, files=files(enc(OFFICIAL.resize((150, 150))))).json()
    unrelated = post(client, viewer_h, files=files(enc(make_logo(99)))).json()
    assert copy["similarity"] == 100.0 and copy["verdict"] == "same_logo"
    assert copy["similarity"] > resized["similarity"] > unrelated["similarity"]
    assert resized["verdict"] in ("same_logo", "very_similar")
    assert unrelated["verdict"] == "different" and unrelated["similarity"] < 55
    assert copy["mode"] == "official" and copy["best"] == {"id": "primary", "label": "Primary logo"}
    assert set(copy["algorithms"]) == {"phash", "dhash", "whash", "colorhash"}
    assert "not proof" in copy["explanation"]
    assert copy["thresholds"] == {"same_logo": 90.0, "very_similar": 80.0, "somewhat_similar": 55.0}


def test_recolour_crop_variants(client, admin_h, with_logo):
    recol = ImageEnhance.Color(OFFICIAL).enhance(0.3)
    w = OFFICIAL.size[0]
    cropped = OFFICIAL.crop((int(w * 0.03), int(w * 0.03), w, w)).resize((w, w))
    assert post(client, admin_h, files=files(enc(recol))).json()["similarity"] >= 55
    assert post(client, admin_h, files=files(enc(cropped))).json()["similarity"] >= 55


@pytest.mark.parametrize(
    ("sim", "verdict"),
    [(100, "same_logo"), (90, "same_logo"), (89.9, "very_similar"), (80, "very_similar"), (79.9, "somewhat_similar"), (55, "somewhat_similar"), (54.9, "different"), (0, "different")],
)
def test_verdict_mapping(sim, verdict):
    assert verdict_for(sim) == verdict


def test_multiple_official_logos_best_match(client, admin_h, with_logo):
    other = make_logo(7)
    r = client.post(f"/api/brands/{with_logo['id']}/logos?label=Dark%20mark", files={"file": ("x.png", enc(other), "image/png")}, headers=admin_h)
    assert r.status_code == 201, r.text
    extra_id = str(r.json()["id"])
    body = post(client, admin_h, files=files(enc(other))).json()
    assert body["best"] == {"id": extra_id, "label": "Dark mark"} and body["similarity"] == 100.0
    assert {x["id"] for x in body["results"]} == {"primary", extra_id}


def test_manual_reference_path(client, admin_h, brand):
    ref = make_logo(5)
    body = post(client, admin_h, files=files(enc(ref), enc(ref))).json()  # no official logo needed
    assert body["mode"] == "manual" and body["best"]["label"] == "Manual reference" and body["similarity"] == 100.0
    assert len(body["results"]) == 1


def test_manual_reference_overrides_official(client, admin_h, with_logo):
    body = post(client, admin_h, files=files(enc(OFFICIAL), enc(make_logo(5)))).json()
    assert body["mode"] == "manual" and body["verdict"] == "different"


def test_no_logo_no_reference_422(client, admin_h, brand):
    r = post(client, admin_h, files=files(enc(OFFICIAL)))
    assert r.status_code == 422
    assert r.json()["detail"] == "Add an official logo in Brand Registry or upload a reference logo."


def test_tiny_image_warns(client, admin_h, with_logo):
    body = post(client, admin_h, files=files(enc(OFFICIAL.resize((40, 40))))).json()
    assert any("very small" in w for w in body["warnings"])
    assert post(client, admin_h, files=files(enc(OFFICIAL.resize((8, 8))))).status_code == 422


def test_single_colour_warns(client, admin_h, with_logo):
    body = post(client, admin_h, files=files(enc(Image.new("RGB", (200, 200), (10, 120, 10))))).json()
    assert any("single colour" in w for w in body["warnings"])


def test_inverted_warns(client, admin_h, with_logo):
    body = post(client, admin_h, files=files(enc(ImageOps.invert(OFFICIAL)))).json()
    if body["similarity"] < 55:
        assert any("inverted" in w for w in body["warnings"])


def test_corrupt_wrong_type_oversized(client, admin_h, with_logo):
    corrupt = enc(OFFICIAL)[:200]
    assert post(client, admin_h, files=files(corrupt)).status_code == 415
    assert post(client, admin_h, files=files(b"<svg xmlns='x'/>", ctype="image/svg+xml")).status_code == 415
    assert post(client, admin_h, files=files(b"GIF89a" + b"\0" * 100, ctype="image/gif")).status_code == 415
    big = enc(OFFICIAL) + b"\0" * (2 * 1024 * 1024 + 10)
    r = post(client, admin_h, files=files(big))
    assert r.status_code == 413 and "2 MB" in r.json()["detail"]
    r = post(client, admin_h, files=files(enc(OFFICIAL), corrupt))
    assert r.status_code == 415 and "reference" in r.json()["detail"]
    assert post(client, admin_h, files=files(enc(OFFICIAL), big)).status_code == 413


def test_oversized_dimensions_422(client, admin_h, with_logo):
    assert post(client, admin_h, files=files(enc(Image.new("1", (7000, 20))))).status_code == 422


def test_webp_and_jpeg_accepted(client, admin_h, with_logo):
    assert post(client, admin_h, files=files(enc(OFFICIAL, "WEBP"))).status_code == 200
    assert post(client, admin_h, files=files(enc(OFFICIAL, "JPEG"))).status_code == 200


def test_nothing_stored(client, admin_h, with_logo, settings, db):
    from app.models import AuditLog, CandidateImage, Detection

    def snapshot():
        return sorted(p.relative_to(settings.data_dir).as_posix() for p in settings.data_dir.rglob("*") if p.is_file())

    def counts():
        return (db.query(AuditLog).count(), db.query(CandidateImage).count(), db.query(Detection).count())

    before, c0 = snapshot(), counts()
    assert post(client, admin_h, files=files(enc(OFFICIAL), enc(make_logo(3)))).status_code == 200
    assert post(client, admin_h, files=files(enc(OFFICIAL))).status_code == 200
    db.expire_all()
    assert snapshot() == before and counts() == c0


def test_sample_note_follows_data_mode(client, admin_h, with_logo):
    body = post(client, admin_h, files=files(enc(OFFICIAL))).json()
    assert body["is_sample"] == (body["sample_note"] is not None)
