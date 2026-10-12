"""Similarity primitives, logo hashing and the SSRF guard (no database needed)."""
import io

from PIL import Image

from app.config import settings
from app.engine import live, seed_data, similarity as sim, ssrf

BRAND = {"name": "Acme Bank", "aliases": ["Acme"], "domains": ["acmebank.com"]}


def test_skeleton_collapses_homoglyphs():
    assert sim.skeleton("acrnebank") == sim.skeleton("acmebank")          # rn -> m
    assert sim.skeleton("acme-bank_") == sim.skeleton("AcmeBank")
    assert sim.skeleton("acmebаnk") == sim.skeleton("acmebank")           # Cyrillic a


def test_transposition_counts_as_one_edit():
    assert sim.dl_distance("acmebank", "acmebnak") == 1
    assert sim.dl_distance("kitten", "sitting") == 3
    assert sim.dl_distance("", "abc") == 3


def test_name_match_levels():
    assert sim.name_match("acrnebank", BRAND)["strength"] == 1.0
    assert sim.name_match("acme_refund_help", BRAND)["strength"] < 0.7
    assert sim.name_match("acmebank-refund", BRAND)["strength"] >= 0.95
    assert sim.name_match("acme_bakery", BRAND)["strength"] <= 0.5
    assert sim.name_match("acmebank", BRAND)["strength"] == 0.0
    assert sim.name_match("weather_news", BRAND)["strength"] == 0.0


def test_tfidf_cosine_orders_correctly():
    c = sim.Corpus(["pay a fee to claim your refund", "fresh sourdough bread daily", "claim refund pay fee now"])
    assert c.cosine("pay fee claim refund", "claim refund pay fee now") > c.cosine("pay fee claim refund", "fresh sourdough bread daily")


def test_logo_hash_survives_jpeg_and_resizing():
    seed_data.make_logos()
    L = settings.logo_dir
    off = sim.dhash(str(L / "official.png"))
    assert sim.hamming(sim.dhash(str(L / "copy_exact.jpg")), off) <= 2          # 160px + JPEG q70
    assert sim.hamming(sim.dhash(str(L / "bakery.png")), off) >= 16             # a different logo is far away
    # the same image re-encoded at several sizes and qualities stays within a few bits
    base = Image.open(L / "official.png").convert("RGB")
    for size, q in [(512, 95), (200, 60), (96, 40)]:
        buf = io.BytesIO()
        base.resize((size, size)).save(buf, "JPEG", quality=q)
        assert sim.hamming(sim.dhash(buf.getvalue()), off) <= 4
    va = [sim.dhash(str(L / f"va_{i}.jpg")) for i in range(4)]
    assert max(sim.hamming(va[0], x) for x in va) <= 3                          # one edited copy at four sizes/qualities
    assert sim.hamming(va[0], off) >= 4                                         # ...but it is not the official logo


def test_ssrf_blocks_private_loopback_and_metadata_addresses():
    for bad in ("127.0.0.1", "10.0.0.5", "10.255.255.254", "169.254.169.254", "192.168.1.1", "172.16.0.1", "::1", "0.0.0.0", "100.64.0.1"):
        assert ssrf.is_public_host(bad) is False, bad
    assert ssrf.is_public_host("8.8.8.8") is True
    assert ssrf.is_public_host("") is False
    assert ssrf.is_safe_url("http://169.254.169.254/latest/meta-data") is False
    assert ssrf.is_safe_url("file:///etc/passwd") is False
    assert live._public("127.0.0.1") is False
    assert live.safe_fetch("127.0.0.1") == {}
    assert live.safe_fetch("169.254.169.254") == {}
    assert live.safe_fetch("localhost") == {}


def test_safe_fetch_does_not_follow_redirects_into_private_space(monkeypatch):
    """A public host that redirects to an internal address must not be fetched."""
    calls = []

    class FakeResp:
        is_redirect = True
        headers = {"location": "http://169.254.169.254/latest/meta-data"}
        status_code = 302
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def iter_bytes(self): return iter(())

    class FakeClient:
        def __init__(self, *a, **k): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def stream(self, method, url):
            calls.append(url)
            return FakeResp()

    monkeypatch.setattr(live.httpx, "Client", FakeClient)
    monkeypatch.setattr(live, "_public", lambda h: h not in ("169.254.169.254",))
    assert live.safe_fetch("example.com") == {}
    assert all("169.254" not in u for u in calls)


def test_lookalike_generator_covers_the_classic_tricks():
    cands = dict(live.lookalikes("acmebank.com", "Acme Bank", limit=400))
    assert cands.get("acrnebank.com") == "homoglyph"
    assert "acmebnak.com" in cands and "acmebak.com" in cands and "acme-bank.com" in cands
    assert "acmebank-refund.com" in cands and "acmebank.shop" in cands
    assert "acmebank.com" not in cands
