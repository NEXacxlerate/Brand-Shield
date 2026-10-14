"""CLIP-based logo tester: calibration, combination policy, response shape with and without CLIP, fallbacks. Uses a FAKE embedder."""

import io
import os
import random
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

from app.core.engine import logo_similarity as ls

URL = "/api/lookalike/test-logo"


def png(img: Image.Image) -> bytes:
    b = io.BytesIO()
    img.save(b, "PNG")
    return b.getvalue()


def logo(seed: int) -> Image.Image:
    rnd = random.Random(seed)
    img = Image.new("RGB", (200, 200), tuple(rnd.randint(0, 255) for _ in range(3)))
    d = ImageDraw.Draw(img)
    for _ in range(4):
        d.ellipse([rnd.randint(0, 90), rnd.randint(0, 90), rnd.randint(110, 200), rnd.randint(110, 200)], fill=tuple(rnd.randint(0, 255) for _ in range(3)))
    return img


class FakeEmbedder:
    """Deterministic: the vector is chosen by the image's top-left pixel red channel (a lookup table), so tests control cosines."""

    def __init__(self, table: dict[int, list[float]]) -> None:
        self.table = table

    def __call__(self, img):
        return self.table[img.convert("RGB").getpixel((0, 0))[0]]


def solid(red: int) -> Image.Image:
    img = Image.new("RGB", (300, 300), (red, 0, 0))
    ImageDraw.Draw(img).rectangle([80, 80, 200, 200], fill=(255, 255, 255))
    return img


def vec_with_cosine(c: float) -> list[float]:
    return [c, (1 - c * c) ** 0.5]


# ---- calibration

@pytest.mark.parametrize("cos,score", [(0.30, 0), (0.62, 0), (0.80, 55), (0.88, 80), (0.97, 90), (1.0, 100), (1.2, 100)])
def test_clip_to_score_knots_and_clamp(cos, score):
    assert ls.clip_to_score(cos) == score


def test_clip_to_score_between_knots():
    assert ls.clip_to_score(0.71) == 27.5
    assert ls.clip_to_score(0.84) == 67.5
    assert ls.clip_to_score(0.925) == 85.0
    assert ls.clip_to_score(0.985) == 95.0
    xs = [0.5 + i * 0.01 for i in range(60)]
    ys = [ls.clip_to_score(x) for x in xs]
    assert ys == sorted(ys)


# ---- policy

def test_policy_clip_leads():
    assert ls.combine_clip_hash(70, 30) == 70
    assert ls.combine_clip_hash(95, 10) == 95


def test_policy_high_hash_lifts_similar_clip_only():
    assert ls.combine_clip_hash(60, 96) == 96
    assert ls.combine_clip_hash(85, 91) == 91


def test_policy_never_raises_low_clip_because_of_hash():
    assert ls.combine_clip_hash(40, 100) == 40
    assert ls.combine_clip_hash(54.9, 99) == 54.9
    assert ls.combine_clip_hash(20, 89) == 20


def test_calibrated_scan_backend_uses_calibration():
    emb = FakeEmbedder({1: vec_with_cosine(1.0), 2: vec_with_cosine(0.88)})
    # cosine between the two vectors is 0.88 (first one is [1, 0])
    sim = ls.CalibratedClipSimilarity(emb).similarity(solid(1), solid(2))
    assert sim == 80.0


# ---- API

@pytest.fixture
def with_logo(client, admin_h, brand):
    r = client.post(f"/api/brands/{brand['id']}/logo", files={"file": ("l.png", png(solid(1)), "image/png")}, headers=admin_h)
    assert r.status_code == 200, r.text
    return brand


def use_clip(monkeypatch, table):
    emb = FakeEmbedder(table)
    monkeypatch.setattr(ls, "get_clip_embedder", lambda cache_dir: emb)
    return emb


def post(client, h, img, ref=None):
    files = {"file": ("a.png", png(img), "image/png")}
    if ref is not None:
        files["reference"] = ("r.png", png(ref), "image/png")
    return client.post(URL, headers=h, files=files)


def test_response_without_clip_is_hash_only(client, admin_h, with_logo):
    d = post(client, admin_h, solid(1)).json()
    assert d["method"] == "hash"
    assert d["clip"]["available"] is False and d["clip"]["reason"] == "not_installed"
    assert "pip install fastembed" in d["clip"]["hint"]
    assert d["similarity"] == d["hash_similarity"]
    assert d["results"][0]["clip"] is None
    assert "not proof of reuse" in d["explanation"] and "AI" not in d["explanation"]


def test_response_with_clip(client, admin_h, with_logo, monkeypatch):
    use_clip(monkeypatch, {1: [1.0, 0.0], 2: vec_with_cosine(0.97), 3: vec_with_cosine(0.50)})
    d = post(client, admin_h, solid(2)).json()
    assert d["method"] == "clip+hash"
    assert d["clip"] == {"available": True, "cosine": 0.97, "score": 90.0, "model": ls.CLIP_MODEL}
    assert d["similarity"] >= 90 and d["verdict"] == "same_logo"
    assert d["results"][0]["clip"]["score"] == 90.0
    assert set(d["algorithms"]) == {"phash", "dhash", "whash", "colorhash"}
    assert "AI visual-similarity" in d["explanation"] and "not proof" in d["explanation"]
    assert any("First comparison" in w for w in d["warnings"])  # fake embedder never marks the model as loaded
    low = post(client, admin_h, solid(3)).json()
    assert low["similarity"] == 0 and low["verdict"] == "different"


def test_high_hash_never_rescues_low_clip(client, admin_h, with_logo, monkeypatch):
    use_clip(monkeypatch, {1: [1.0, 0.0], 5: vec_with_cosine(0.60)})
    same_shape = solid(1)  # identical picture: hash 100
    same_shape.putpixel((0, 0), (5, 0, 0))  # but the fake embedder sees it as an unrelated vector
    d = post(client, admin_h, same_shape).json()
    assert d["hash_similarity"] >= 90
    assert d["similarity"] == 0 and d["verdict"] == "different"


def test_per_logo_best_chosen_by_final_score(client, admin_h, with_logo, monkeypatch):
    r = client.post(f"/api/brands/{with_logo['id']}/logos", files={"file": ("x.png", png(solid(7)), "image/png")}, data={"label": "Dark"}, headers=admin_h)
    assert r.status_code in (200, 201), r.text
    use_clip(monkeypatch, {1: [1.0, 0.0], 7: vec_with_cosine(0.90), 9: [0.9, (1 - 0.81) ** 0.5]})
    # candidate 9 -> cosine 0.9 with primary (vec 1), cosine of (0.9, 0.436) with (0.9, 0.436)-ish vec 7 is higher
    d = post(client, admin_h, solid(9)).json()
    scores = {row["id"]: row["clip"]["score"] for row in d["results"]}
    assert len(scores) == 2
    assert d["best"]["id"] == max(d["results"], key=lambda r: r["similarity"])["id"]


def test_setting_off(client, admin_h, with_logo, monkeypatch, app):
    use_clip(monkeypatch, {1: [1.0, 0.0]})
    app.state.settings.logo_compare_clip = "off"
    d = post(client, admin_h, solid(1)).json()
    assert d["method"] == "hash" and d["clip"]["reason"] == "off"


def test_model_unavailable_falls_back(client, admin_h, with_logo, monkeypatch):
    def boom(cache_dir):
        raise ls.NotAvailable("weights missing", "model_unavailable")

    monkeypatch.setattr(ls, "get_clip_embedder", boom)
    r = post(client, admin_h, solid(1))
    assert r.status_code == 200
    assert r.json()["clip"]["reason"] == "model_unavailable" and r.json()["method"] == "hash"


def test_logo_engine_status(client, admin_h, monkeypatch, tmp_path):
    d = client.get("/api/lookalike/logo-engine", headers=admin_h).json()
    assert d["available"] is False and d["reason"] == "not_installed" and "pip install fastembed" in d["hint"]
    monkeypatch.setattr(ls, "fastembed_installed", lambda: True)
    d = client.get("/api/lookalike/logo-engine", headers=admin_h).json()
    assert d["available"] is True and d["cached"] is False and d["model"] == ls.CLIP_MODEL
    assert client.get("/api/lookalike/logo-engine").status_code == 401


def test_loader_reports_missing_fastembed(tmp_path):
    ls.reset_clip_for_tests()
    with pytest.raises(ls.NotAvailable) as ei:
        ls.get_clip_embedder(tmp_path)
    assert ei.value.reason == "not_installed"


def test_scan_backend_clip_falls_back_to_hash(settings):
    from app.core.pipeline.scan_pipeline import _image_impl

    settings.image_similarity_backend = "clip"
    impl, name = _image_impl(settings)
    assert name == "image-1" and isinstance(impl, ls.HashSimilarity)


def test_scan_backend_clip_when_available(settings, monkeypatch):
    from app.core.pipeline.scan_pipeline import _image_impl

    monkeypatch.setattr("app.core.pipeline.scan_pipeline.get_clip_embedder", lambda d: FakeEmbedder({}))
    settings.image_similarity_backend = "clip"
    assert _image_impl(settings)[1] == "image-3-clip"


# ---- optional integration with the real weights (only when fastembed and the cached weights exist)

def _real_dir() -> Path:
    return Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parents[2] / "data")) / "models"


@pytest.mark.skipif(not __import__("importlib").util.find_spec("fastembed"), reason="fastembed not installed")
def test_real_clip_weights():
    d = _real_dir()
    if not ls.model_cached(d):
        pytest.skip("CLIP weights not cached yet")
    from PIL import ImageFont

    def mark(word: str) -> Image.Image:
        img = Image.new("RGB", (400, 400), (20, 60, 160))
        dr = ImageDraw.Draw(img)
        dr.ellipse([100, 40, 300, 240], fill=(250, 200, 30))
        dr.text((200, 320), word, fill=(255, 255, 255), font=ImageFont.load_default(size=60), anchor="mm")
        return img

    emb = ls.FastembedClipEmbedder(d)
    base = mark("Zenith")
    ref = emb(base)
    copy = ls.clip_to_score(ls.cosine(ref, emb(base.copy())))
    resized = ls.clip_to_score(ls.cosine(ref, emb(base.resize((200, 200)))))
    other_logo = Image.new("RGB", (400, 400), (240, 240, 240))
    ImageDraw.Draw(other_logo).text((200, 200), "byteXL", fill=(30, 30, 30), font=ImageFont.load_default(size=70), anchor="mm")
    other = ls.clip_to_score(ls.cosine(ref, emb(other_logo)))
    assert copy >= 99 and resized >= 90 and other < 55
