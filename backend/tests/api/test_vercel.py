"""Vercel support: environment-aware defaults, CORS regex, MIGRATION_DATABASE_URL, the cron endpoint and the api/index.py entrypoint."""

from __future__ import annotations

import importlib
import sys
from datetime import timedelta
from pathlib import Path

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import inspect, select

from alembic import command
from app.config.config import DatabaseSettings, Settings
from app.config.time import utcnow
from app.db.session import make_engine
from app.models import AuditLog, Scan, User
from tests.conftest import ADMIN, headers_for
from tests.scan_helpers import make_client, set_mode, setup_brand

BACKEND = Path(__file__).resolve().parents[2]


def mk(**kw) -> Settings:
    return Settings(_env_file=None, jwt_secret="x" * 20, **kw)  # type: ignore[call-arg]


# ---- environment-aware defaults -----------------------------------------------------------------------------


def test_defaults_are_unchanged_without_vercel(monkeypatch):
    for name in ("VERCEL", "SCAN_EXECUTOR", "SCHEDULER_ENABLED"):  # the suite's own conftest values are not the defaults
        monkeypatch.delenv(name, raising=False)
    s = mk()
    assert (s.scan_executor, s.scheduler_enabled, s.response_cache_seconds, s.storage_backend) == ("auto", True, 15, "local")
    assert s.data_dir == BACKEND / "data" and s.cors_origin_regex is None and s.cron_secret is None


def test_vercel_defaults(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    s = mk()
    assert s.scan_executor == "inline" and s.scheduler_enabled is False and s.response_cache_seconds == 0
    assert s.storage_backend == "database" and s.data_dir == Path("/tmp/brandshield")


def test_explicit_values_win_on_vercel(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("RESPONSE_CACHE_SECONDS", "30")
    s = mk(scan_executor="thread")
    assert s.storage_backend == "local" and s.response_cache_seconds == 30 and s.scan_executor == "thread"


def test_pool_defaults_on_vercel_and_elsewhere(monkeypatch):
    url = "postgresql+psycopg://u:p@h.pooler.supabase.com:6543/postgres"
    for name in ("DB_POOL_SIZE", "DB_MAX_OVERFLOW", "DB_POOL_RECYCLE", "DB_PRE_PING"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    e = make_engine(url)
    assert (e.pool.size(), e.pool._max_overflow, e.pool._recycle, e.pool._pre_ping) == (5, 2, 1800, False)
    monkeypatch.setenv("VERCEL", "1")
    e = make_engine(url)
    assert (e.pool.size(), e.pool._max_overflow, e.pool._recycle, e.pool._pre_ping) == (1, 1, 300, False)
    monkeypatch.setenv("DB_POOL_SIZE", "3")  # explicit wins
    assert make_engine(url).pool.size() == 3


def test_transaction_pooler_disables_prepared_statements(monkeypatch):
    """psycopg 3 auto-prepares a statement after 5 uses; the Supabase transaction pooler (port 6543) does not support that.
    create_engine does not connect, so this inspects the driver arguments only (no network)."""
    import app.db.session as session

    seen: dict[str, dict] = {}
    real = session.create_engine

    def spy(url, **kw):
        seen[url] = kw
        return real(url, **kw)

    monkeypatch.setattr(session, "create_engine", spy)
    u6543 = "postgresql+psycopg://u:p@h.pooler.supabase.com:6543/postgres"
    u5432 = "postgresql+psycopg://u:p@h.pooler.supabase.com:5432/postgres"
    make_engine(u6543)
    make_engine(u5432)
    assert seen[u6543]["connect_args"]["prepare_threshold"] is None  # prepared statements off
    assert "prepare_threshold" not in seen[u5432]["connect_args"]  # session mode keeps psycopg's default


def test_startup_names_the_vercel_mode(monkeypatch, capsys):
    from app.main import create_app

    monkeypatch.delenv("VERCEL", raising=False)
    create_app(mk(database_url="sqlite://"), engine=make_engine("sqlite://"))
    assert "Vercel mode" not in capsys.readouterr().err  # silent elsewhere
    monkeypatch.setenv("VERCEL", "1")
    create_app(mk(database_url="sqlite://"), engine=make_engine("sqlite://"))
    assert "Vercel mode: executor=inline scheduler=False storage=database cache_s=0" in capsys.readouterr().err


# ---- CORS ---------------------------------------------------------------------------------------------------


def test_cors_regex_allows_preview_origins_only(settings, checker):
    s = settings.model_copy(update={"cors_origins": "https://prod.example.com", "cors_origin_regex": r"https://.*\.vercel\.app"})
    with make_client(s, checker, []) as c:
        def acao(origin):
            r = c.options("/api/brands", headers={"Origin": origin, "Access-Control-Request-Method": "GET"})
            return r.headers.get("access-control-allow-origin")

        assert acao("https://prod.example.com") == "https://prod.example.com"
        assert acao("https://brandshield-git-x-team.vercel.app") == "https://brandshield-git-x-team.vercel.app"
        assert acao("https://evil.example.com") is None
        assert acao("https://x.vercel.app.evil.com") is None


def test_no_regex_means_exact_list_only(settings, checker):
    with make_client(settings, checker, []) as c:
        r = c.options("/api/brands", headers={"Origin": "https://x.vercel.app", "Access-Control-Request-Method": "GET"})
        assert r.headers.get("access-control-allow-origin") is None


# ---- MIGRATION_DATABASE_URL ---------------------------------------------------------------------------------


def test_migration_url_falls_back_to_database_url(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///runtime.db")
    monkeypatch.delenv("MIGRATION_DATABASE_URL", raising=False)
    assert DatabaseSettings(_env_file=None).migration_url == "sqlite:///runtime.db"  # type: ignore[call-arg]
    monkeypatch.setenv("MIGRATION_DATABASE_URL", "sqlite:///session.db")
    assert DatabaseSettings(_env_file=None).migration_url == "sqlite:///session.db"  # type: ignore[call-arg]
    monkeypatch.setenv("MIGRATION_DATABASE_URL", "")  # blank = not set
    assert DatabaseSettings(_env_file=None).migration_url == "sqlite:///runtime.db"  # type: ignore[call-arg]


def test_alembic_env_uses_the_migration_url(tmp_path, monkeypatch):
    """env.py with no sqlalchemy.url option (how `alembic upgrade head` runs) migrates MIGRATION_DATABASE_URL, not DATABASE_URL."""
    runtime, migration = tmp_path / "runtime.db", tmp_path / "migration.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{runtime.as_posix()}")
    monkeypatch.setenv("MIGRATION_DATABASE_URL", f"sqlite:///{migration.as_posix()}")
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    command.upgrade(cfg, "head")
    assert "stored_files" in inspect(make_engine(f"sqlite:///{migration.as_posix()}")).get_table_names()
    assert not runtime.exists()


def test_scripts_migrate_reads_the_migration_url(tmp_path, monkeypatch):
    from scripts import migrate

    migration = tmp_path / "m.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'runtime.db').as_posix()}")
    monkeypatch.setenv("MIGRATION_DATABASE_URL", f"sqlite:///{migration.as_posix()}")
    assert migrate.main() == 0
    assert "stored_files" in inspect(make_engine(f"sqlite:///{migration.as_posix()}")).get_table_names()
    assert not (tmp_path / "runtime.db").exists()


# ---- cron ---------------------------------------------------------------------------------------------------

SECRET = "cron-secret-for-tests-0123456789"


@pytest.fixture
def cron_client(settings, checker):
    s = settings.model_copy(update={"cron_secret": SecretStr(SECRET), "scan_interval_minutes": 1440})
    with make_client(s, checker, None) as c:
        yield c


def bearer(value: str) -> dict:
    return {"Authorization": f"Bearer {value}"}


def test_cron_is_inert_without_a_secret(client):
    assert client.get("/api/cron/scan").status_code == 503
    assert client.get("/api/cron/scan", headers=bearer("anything")).status_code == 503


def test_cron_rejects_missing_and_wrong_credentials(cron_client):
    assert cron_client.get("/api/cron/scan").status_code == 401
    assert cron_client.get("/api/cron/scan", headers=bearer("wrong")).status_code == 401
    assert cron_client.get("/api/cron/scan", headers={"Authorization": SECRET}).status_code == 401  # no "Bearer"
    assert cron_client.get("/api/cron/scan", headers=bearer(SECRET + "x")).status_code == 401


def test_cron_skips_when_there_is_no_brand(cron_client):
    r = cron_client.get("/api/cron/scan", headers=bearer(SECRET))
    assert r.status_code == 200 and r.json()["ran"] is False and r.json()["skipped"] is True and "brand" in r.json()["reason"].lower()


def test_cron_runs_one_inline_scan_when_due_and_audits_it(cron_client):
    c = cron_client
    h = headers_for(c, *ADMIN)
    set_mode(c, h, "sample")
    setup_brand(c, h)
    r = c.get("/api/cron/scan", headers=bearer(SECRET))
    body = r.json()
    assert r.status_code == 200 and body["ran"] is True and body["skipped"] is False and body["scan_id"], body
    with c.app_ref.state.session_factory() as db:
        scan = db.get(Scan, body["scan_id"])
        assert scan.started_by == "scheduler" and scan.state == "completed"  # finished inside the request
        rows = db.scalars(select(AuditLog).where(AuditLog.action == "scan.started")).all()
        assert rows and rows[-1].actor == "scheduler"
    # right after a scan the schedule says "not due"
    again = c.get("/api/cron/scan", headers=bearer(SECRET)).json()
    assert again["ran"] is False and "not due" in again["reason"]
    # Hobby cron may fire up to an hour "early" relative to the last run: 23 h 20 min later is still treated as due (daily interval)
    with c.app_ref.state.session_factory() as db:
        s = db.get(Scan, body["scan_id"])
        s.created_at = utcnow() - timedelta(minutes=1400)
        db.commit()
    assert c.get("/api/cron/scan", headers=bearer(SECRET)).json()["ran"] is True


# ---- the Vercel entrypoint ----------------------------------------------------------------------------------


@pytest.fixture
def entry(tmp_path, monkeypatch):
    """Import api/index.py exactly as Vercel would, against a migrated temp SQLite database."""
    from app.config import config

    db_file = tmp_path / "v.db"
    url = f"sqlite:///{db_file.as_posix()}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("ADMIN_EMAIL", "vercel-admin@example.com")
    monkeypatch.setenv("ADMIN_PASSWORD", "Vercel-Admin-Pass-1")
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "scratch"))
    config.get_settings.cache_clear()
    sys.modules.pop("api.index", None)
    yield url
    sys.modules.pop("api.index", None)
    config.get_settings.cache_clear()


def test_entrypoint_exposes_an_asgi_app_and_seeds_the_admin(entry):
    from scripts.migrate import upgrade

    upgrade(entry)
    mod = importlib.import_module("api.index")
    assert hasattr(mod.app, "router") and mod.app.state.settings.storage_backend == "database"
    assert mod.app.state.scheduler_loop is None  # never a scheduler thread
    with mod.app.state.session_factory() as db:
        assert db.scalar(select(User.id).where(User.email == "vercel-admin@example.com"))
    assert mod.cold_start() is False  # idempotent: already seeded
    with TestClient(mod.app) as c:
        assert c.get("/health/live").status_code == 200
        assert c.post("/api/auth/login", json={"email": "vercel-admin@example.com", "password": "Vercel-Admin-Pass-1"}).status_code == 200


def test_entrypoint_import_survives_an_unmigrated_database(entry):
    mod = importlib.import_module("api.index")  # no tables yet: the seed is skipped, the import does not raise
    assert hasattr(mod.app, "router")
    assert mod.cold_start() is False
