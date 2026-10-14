"""Changing the brand's name / aliases / keywords / domains must leave nothing of the old brand in any list."""

from __future__ import annotations

import time

from app.core.pipeline.lookalike import default_cases
from tests.scan_helpers import run_scan, set_mode, setup_brand


def _names(client, h) -> set[str]:
    return {d["name"].lower() for d in client.get("/api/detections?limit=200", headers=h).json()["items"]}


def _wait_idle(client, h) -> None:
    for _ in range(100):
        if client.get("/api/scan/status", headers=h).json().get("state") not in ("queued", "running"):
            return
        time.sleep(0.1)


def _rename(client, h, brand, name, **extra):
    body = {"name": name, "industry": brand.get("industry", ""), "aliases": brand["aliases"], "keywords": brand["keywords"], "domains": brand["domains"], **extra}
    return client.put(f"/api/brands/{brand['id']}", json=body, headers=h)


def test_rename_retires_old_results_and_rescan_shows_only_the_new_brand(client, admin_h):
    set_mode(client, admin_h, "sample")
    brand = setup_brand(client, admin_h)
    run_scan(client, admin_h)
    before = _names(client, admin_h)
    assert before

    r = _rename(client, admin_h, brand, "Zenith Pay", aliases=["ZenithPay"], keywords=["zenith pay"], domains=["zenithpay.example"])
    assert r.status_code == 200
    refresh = r.json()["refresh"]
    assert refresh["results_retired"] > 0 and refresh["rescan"] in ("started", "needed")
    _wait_idle(client, admin_h)

    run_scan(client, admin_h)
    after = _names(client, admin_h)
    assert after, "the new brand must have results"
    assert not (after & before), "no result of the old brand may survive"
    assert any("zenith" in n for n in after)
    assert client.get("/api/dashboard", headers=admin_h).json()["brand"]["name"] == "Zenith Pay"


def test_retired_results_leave_counts_and_dashboard(client, admin_h):
    set_mode(client, admin_h, "sample")
    brand = setup_brand(client, admin_h)
    run_scan(client, admin_h)
    assert client.get("/api/dashboard", headers=admin_h).json()["total_open"] > 0
    set_mode(client, admin_h, "live")  # live scans cost credits: no automatic rescan, so the lists stay empty until the user scans
    r = _rename(client, admin_h, brand, "Orbit Telecom", aliases=["Orbit"], keywords=["orbit telecom"], domains=["orbittelecom.example"])
    assert r.json()["refresh"]["rescan"] == "needed"
    d = client.get("/api/dashboard?source=all", headers=admin_h)
    set_mode(client, admin_h, "sample")
    assert client.get("/api/detections?limit=50", headers=admin_h).json()["total"] == 0
    assert d.status_code in (200, 404)


def test_description_or_industry_change_keeps_results(client, admin_h):
    set_mode(client, admin_h, "sample")
    brand = setup_brand(client, admin_h)
    run_scan(client, admin_h)
    total = client.get("/api/detections?limit=200", headers=admin_h).json()["total"]
    r = _rename(client, admin_h, brand, brand["name"], industry="Retail banking", description="A bank.")
    assert r.status_code == 200 and r.json()["refresh"] is None
    assert client.get("/api/detections?limit=200", headers=admin_h).json()["total"] == total


def test_builtin_lookalike_cases_follow_the_brand_name(client, admin_h):
    set_mode(client, admin_h, "sample")
    brand = setup_brand(client, admin_h)
    first = {c["name"] for c in client.get("/api/lookalike/test-cases", headers=admin_h).json()["items"]}
    assert "Acme Bank Support" in first
    _rename(client, admin_h, brand, "Zenith Pay", aliases=["ZenithPay"], keywords=["zenith pay"], domains=["zenithpay.example"])
    names = {c["name"] for c in client.get("/api/lookalike/test-cases", headers=admin_h).json()["items"]}
    assert "Zenith Pay Support" in names and "Acme Bank Support" not in names
    assert not any("acme" in n.lower() for n in names)


def test_default_cases_are_built_from_any_brand_name():
    for brand in ("Acme Bank", "Zenith Pay", "Orbit Telecom", "Zoho", "Northern Lights Mutual Insurance"):
        cases = default_cases(brand)
        assert 10 <= len(cases) <= 12
        assert {e for _, e in cases} == {"flagged", "not_flagged", "official"}
        assert (brand, "official") in cases
    assert ("acrnebank", "flagged") in default_cases("Acme Bank") and ("acme-bank", "flagged") in default_cases("Acme Bank")
