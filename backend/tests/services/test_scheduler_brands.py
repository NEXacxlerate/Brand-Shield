"""The scheduler / cron pass scans EVERY brand that is due (one per account), within the shared credit decision and a per-run cap."""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import SecretStr

from app.models import ApiUsage, Brand, Scan
from app.services.scheduler import scheduler_tick
from tests.conftest import ADMIN, headers_for
from tests.scan_helpers import StaticCollector, make_client, set_mode


def _account(c, n: int, assets: bool = True) -> dict:
    r = c.post("/api/auth/register", json={"name": f"Owner {n}", "email": f"owner{n}@example.com", "password": "Correct-Horse-9"})
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    b = c.post("/api/brands", json={"name": f"Brand{n} Bank", "keywords": [f"brand{n}"], "domains": [f"brand{n}bank.com"]}, headers=h).json()
    if assets:
        assert c.post(f"/api/brands/{b['id']}/accounts", json={"platform": "instagram", "handle": f"brand{n}bank"}, headers=h).status_code == 201
    return h


def _scans(c, h):
    return c.get("/api/scans", headers=h).json()["items"]


def test_every_due_brand_is_scanned_once_as_scheduler(settings, checker):
    s = settings.model_copy(update={"scheduler_enabled": True, "scan_interval_minutes": 30})
    with make_client(s, checker) as c:
        set_mode(c, headers_for(c, *ADMIN), "sample")
        hs = [_account(c, n) for n in (1, 2, 3)]
        d = scheduler_tick(c.app_ref.state.scan_ctx)
        assert d.run is True
        for h in hs:
            scans = _scans(c, h)
            assert len(scans) == 1 and scans[0]["started_by"] == "scheduler" and scans[0]["status"] == "completed"
        assert scheduler_tick(c.app_ref.state.scan_ctx).run is False  # nothing is due again right away
        assert all(len(_scans(c, h)) == 1 for h in hs)


def test_a_brand_waiting_for_its_first_official_asset_is_skipped_not_blocking(settings, checker):
    s = settings.model_copy(update={"scheduler_enabled": True, "scan_interval_minutes": 30})
    with make_client(s, checker) as c:
        set_mode(c, headers_for(c, *ADMIN), "sample")
        empty, ready = _account(c, 1, assets=False), _account(c, 2)
        assert scheduler_tick(c.app_ref.state.scan_ctx).run is True
        assert _scans(c, empty) == [] and len(_scans(c, ready)) == 1


def test_at_most_n_brands_per_run(settings, checker):
    s = settings.model_copy(update={"scheduler_enabled": True, "scan_interval_minutes": 30, "scheduler_max_brands_per_run": 2})
    with make_client(s, checker) as c:
        set_mode(c, headers_for(c, *ADMIN), "sample")
        hs = [_account(c, n) for n in (1, 2, 3, 4)]
        scheduler_tick(c.app_ref.state.scan_ctx)
        assert sorted(len(_scans(c, h)) for h in hs) == [0, 0, 1, 1]
        scheduler_tick(c.app_ref.state.scan_ctx)  # the next pass picks up the two that were left (the first two are not due yet)
        assert [len(_scans(c, h)) for h in hs] == [1, 1, 1, 1]
        scheduler_tick(c.app_ref.state.scan_ctx)
        assert [len(_scans(c, h)) for h in hs] == [1, 1, 1, 1]


def test_a_running_scan_of_one_brand_does_not_stop_the_others(settings, checker):
    s = settings.model_copy(update={"scheduler_enabled": True, "scan_interval_minutes": 30})
    with make_client(s, checker) as c:
        set_mode(c, headers_for(c, *ADMIN), "sample")
        h1, h2 = _account(c, 1), _account(c, 2)
        with c.app_ref.state.session_factory() as db:
            b1 = db.query(Brand).order_by(Brand.id).first()
            db.add(Scan(job_id="job_busy", brand_id=b1.id, state="running", started_at=datetime.now(UTC), created_at=datetime.now(UTC)))
            db.commit()
        scheduler_tick(c.app_ref.state.scan_ctx)
        assert len(_scans(c, h2)) == 1 and _scans(c, h2)[0]["started_by"] == "scheduler"
        assert [s_["job_id"] for s_ in _scans(c, h1)] == ["job_busy"]


def test_low_credits_stop_the_whole_pass(settings, checker):
    s = settings.model_copy(update={"scheduler_enabled": True, "scan_interval_minutes": 60, "tavily_api_key": SecretStr("tvly-test-not-real-0123456789"),
                                    "tavily_monthly_budget": 100, "tavily_max_queries_per_scan": 12})
    with make_client(s, checker, [StaticCollector([])]) as c:
        set_mode(c, headers_for(c, *ADMIN), "live")
        hs = [_account(c, n) for n in (1, 2)]
        month = c.app_ref.state.collector_runtime.ledger.snapshot()["month"]
        with c.app_ref.state.session_factory() as db:
            db.add(ApiUsage(provider="tavily", month=month, credits=95))
            db.commit()
        d = scheduler_tick(c.app_ref.state.scan_ctx)
        assert d.run is False and d.skipped_for_credits is True
        assert all(_scans(c, h) == [] for h in hs)


def test_cron_endpoint_runs_every_due_brand(settings, checker):
    s = settings.model_copy(update={"scheduler_enabled": False, "scan_interval_minutes": 30, "cron_secret": SecretStr("cron-secret-for-tests-0123")})
    with make_client(s, checker) as c:
        set_mode(c, headers_for(c, *ADMIN), "sample")
        hs = [_account(c, n) for n in (1, 2)]
        r = c.get("/api/cron/scan", headers={"Authorization": "Bearer cron-secret-for-tests-0123"})
        assert r.status_code == 200 and r.json()["ran"] is True
        assert all(len(_scans(c, h)) == 1 for h in hs)
