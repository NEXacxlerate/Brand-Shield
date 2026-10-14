import os
from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool


def make_engine(url: str) -> Engine:
    kwargs: dict = {}
    if url.startswith("sqlite"):
        # wait up to 30 s for a writer instead of failing with "database is locked" (a scan thread and a page request can write together)
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
        in_memory = ":memory:" in url or url in ("sqlite://", "sqlite:///")
        if in_memory:
            kwargs["poolclass"] = StaticPool
    elif url.startswith("postgresql"):
        # Hosted poolers (Supabase session mode allows only 15 clients in total), far-away databases: small pool, and no
        # extra round trip per request for a liveness ping; recycle idle connections before the pooler drops them instead.
        kwargs["pool_size"] = int(os.environ.get("DB_POOL_SIZE") or 5)
        kwargs["max_overflow"] = int(os.environ.get("DB_MAX_OVERFLOW") or 2)
        kwargs["pool_recycle"] = int(os.environ.get("DB_POOL_RECYCLE") or 1800)
        kwargs["pool_pre_ping"] = (os.environ.get("DB_PRE_PING") or "").lower() in ("1", "true", "yes")
        # TCP keepalives keep the pooler / NAT from dropping idle connections (a new one costs 1-2 s to a far-away database)
        connect_args: dict = {"keepalives": 1, "keepalives_idle": 30, "keepalives_interval": 10, "keepalives_count": 3}
        if ":6543/" in url:  # Supabase transaction pooler: no server-side prepared statements
            connect_args["prepare_threshold"] = None
        kwargs["connect_args"] = connect_args
    engine = create_engine(url, **kwargs)
    if url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _fk_pragma(dbapi_conn, _):  # noqa: ANN001
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA busy_timeout=30000")
            if not in_memory:
                cur.execute("PRAGMA journal_mode=WAL")  # readers no longer block the writer
            cur.close()

    return engine


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db(request: Request) -> Iterator[Session]:
    db = request.app.state.session_factory()
    try:
        yield db
    finally:
        db.close()
