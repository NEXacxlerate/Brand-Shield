"""Two requests meeting an empty `sources` table together must not fail with a UNIQUE error (first page loads of new accounts)."""

from __future__ import annotations

import threading

from sqlalchemy import func, select

from app.core.collectors.orchestrator import SOURCE_PLATFORMS, ensure_sources
from app.db.base import Base
from app.db.session import make_engine, make_session_factory
from app.models import Source


def test_concurrent_first_calls_all_succeed_and_create_each_platform_once(tmp_path):
    engine = make_engine(f"sqlite:///{(tmp_path / 'race.db').as_posix()}")
    Base.metadata.create_all(engine)
    sf = make_session_factory(engine)
    errors: list[BaseException] = []
    barrier = threading.Barrier(6)

    def worker():
        try:
            with sf() as db:
                barrier.wait(timeout=10)
                rows = ensure_sources(db)
                assert len(rows) == len(SOURCE_PLATFORMS)
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(6)]
    [t.start() for t in threads]
    [t.join(30) for t in threads]
    assert errors == []
    with sf() as db:
        assert db.scalar(select(func.count()).select_from(Source)) == len(SOURCE_PLATFORMS)
