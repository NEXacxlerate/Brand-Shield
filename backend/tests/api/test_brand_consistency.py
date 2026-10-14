"""A registered brand's own name must be the only brand text anywhere: no demo-brand strings in any screen's JSON."""

from __future__ import annotations

import json

from app.core.engine.domain_match import analyze_domain
from app.core.pipeline.lookalike import domain_examples
from tests.scan_helpers import run_scan, set_mode


def _register_zenith(client, h) -> dict:
    b = client.post("/api/brands", json={"name": "Zenith Pay", "aliases": ["ZenithPay"], "keywords": ["zenithpay"], "domains": ["zenithpay.example"]}, headers=h)
    assert b.status_code == 201, b.text
    bid = b.json()["id"]
    assert client.post(f"/api/brands/{bid}/accounts", json={"platform": "instagram", "handle": "zenithpay"}, headers=h).status_code == 201
    return b.json()


def test_no_demo_brand_text_in_any_screen(client, admin_h):
    set_mode(client, admin_h, "sample")
    _register_zenith(client, admin_h)
    run_scan(client, admin_h)

    paths = ["/api/dashboard", "/api/detections?limit=200", "/api/detections/excluded", "/api/detections/false-positives", "/api/lookalike/test-cases",
             "/api/lookalike/test-urls", "/api/reports/preview", "/api/settings", "/api/sources", "/api/brands"]
    items = client.get("/api/detections?limit=200", headers=admin_h).json()["items"]
    assert items
    paths.append(f"/api/detections/{items[0]['id']}")
    for path in paths:
        r = client.get(path, headers=admin_h)
        assert r.status_code == 200, (path, r.text)
        assert "acme" not in json.dumps(r.json(), ensure_ascii=False).lower(), path
    r = client.post("/api/lookalike/test-url", json={"url": "zenithpay.net"}, headers=admin_h)
    assert r.status_code == 200 and "acme" not in json.dumps(r.json()).lower()
    r = client.post("/api/lookalike/test", json={"name": "zenithpay support"}, headers=admin_h)
    assert "acme" not in json.dumps(r.json()).lower()


def test_domain_examples_follow_the_brand():
    for name, doms in [("Zenith Pay", ["zenithpay.com"]), ("Big Co Ltd", ["bigco.co.uk"]), ("Nova", ["nova.io"])]:
        ex = domain_examples(name, doms)
        assert ex["derived"] is False and ex["note"] is None
        assert ex["items"][0] == {"input": ex["official_domain"], "expected": "official", "technique": "The official domain itself"}
        kinds = {i["expected"] for i in ex["items"]}
        assert kinds == {"official", "lookalike", "unrelated"}
        assert "acme" not in json.dumps(ex).lower()
        for i in ex["items"]:
            assert analyze_domain(i["input"], name, doms).verdict == i["expected"], (name, i)
    zen = domain_examples("Zenith Pay", ["zenithpay.com"])
    inputs = {i["input"] for i in zen["items"]}
    assert {"zenithpay.com.verify-account.test", "zenithpay-support.com", "zenithpay.net", "zenithpay.co", "zenith-pay.com", "zenithbakery.com"} <= inputs
    assert any(i.startswith("xn--") for i in inputs) and "zenithpаy.com" in inputs


def test_domain_examples_without_domains_are_derived():
    ex = domain_examples("Zenith Pay", [])
    assert ex["derived"] is True and ex["official_domain"] == "zenithpay.com" and "derived" in ex["note"]
    assert domain_examples("", [])["official_domain"] == "brand.com"


def test_test_url_endpoint(client, app, admin_h, viewer_h):
    _register_zenith(client, admin_h)
    post = lambda url, h=admin_h: client.post("/api/lookalike/test-url", json={"url": url}, headers=h)  # noqa: E731
    r = post("https://zenithpay.example/login").json()
    assert r["verdict"] == "official" and r["compared_with"] == "zenithpay.example" and r["parts"]["registrable_domain"] == "zenithpay.example"
    r = post("zenithpay.example.verify-account.test").json()
    assert r["verdict"] == "lookalike" and "Brand in the subdomain" in r["techniques"] and r["parts"]["subdomain_labels"]
    r = post("zenithpаy.example").json()  # Cyrillic a
    assert r["verdict"] == "lookalike" and r["parts"]["is_idn"] and r["parts"]["punycode"].startswith("xn--")
    r = post("https://user@zenithpay.test:8443/").json()
    assert r["parts"]["has_credentials"] is True and r["parts"]["port"] == 8443
    r = post("zenithbakery.com").json()
    assert r["verdict"] == "unrelated" and r["reputation_checked"] is False and "NOT checked" in r["reputation_note"]
    assert post("http://127.0.0.1/").json()["verdict"] == "not_comparable"
    assert post("not a url").json()["verdict"] == "not_comparable"
    assert post("<script>alert(1)</script>.com").status_code == 200  # untrusted text: returned as data
    assert post("   ").status_code == 422
    assert post("a" * 2049).status_code == 422
    assert client.post("/api/lookalike/test-url", json={"url": "x.com"}).status_code == 401
    from tests.conftest import hand_brand_to

    hand_brand_to(app, "viewer@example.com")
    assert post("zenithpay.net", viewer_h).status_code == 200
    ex = client.get("/api/lookalike/test-urls", headers=viewer_h).json()
    assert ex["official_domain"] == "zenithpay.example" and ex["derived"] is False
