"""Vercel entrypoint: a module-level ASGI `app` built by the same create_app() the container uses.

Vercel loads this module once per cold start (pyproject.toml: [tool.vercel] entrypoint = "api.index:app"). Nothing here runs when the
backend is started any other way (uvicorn app.main:create_app --factory, Docker, tests). It never starts the scheduler thread:
scheduled scans come from Vercel Cron (GET /api/cron/scan, see docs/DEPLOY_VERCEL.md).
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

_ROOT = str(Path(__file__).resolve().parents[1])
if _ROOT not in sys.path:  # `app` lives next to this folder; do not rely on the platform's working directory
    sys.path.insert(0, _ROOT)

from app.main import create_app  # noqa: E402
from app.services.seed import seed_admin, seed_demo  # noqa: E402

log = logging.getLogger("app")

app = create_app()


def cold_start() -> bool:
    """Create the admin user (ADMIN_EMAIL / ADMIN_PASSWORD) if it does not exist yet. Idempotent; never raises, so a database that is
    not migrated yet (or briefly unreachable) cannot break the import: /health reports the problem and the next cold start retries."""
    try:
        with app.state.session_factory() as db:
            created = seed_admin(db, app.state.settings)
            seed_demo(db, app.state.settings)
            return created
    except Exception as exc:  # noqa: BLE001 - missing table, connection error, anything: report, never crash the import
        log.warning("admin seed skipped at cold start (%s): run alembic upgrade head and check DATABASE_URL", type(exc).__name__)
        return False


cold_start()
