"""SQLAlchemy engine, session factory and migration runner."""
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import ROOT, settings


class Base(DeclarativeBase):
    pass


def _make_engine(url: str):
    kw = {}
    if url.startswith("sqlite"):
        kw["connect_args"] = {"check_same_thread": False, "timeout": 30}
    eng = create_engine(url, pool_pre_ping=True, **kw)
    if url.startswith("sqlite"):
        @event.listens_for(eng, "connect")
        def _pragmas(dbapi_con, _):
            cur = dbapi_con.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()
    return eng


engine = _make_engine(settings.db_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Apply Alembic migrations (falls back to create_all if the migration folder is missing)."""
    from . import models  # noqa: F401  (register tables)
    ini = Path(ROOT / "alembic.ini")
    if ini.exists():
        from alembic import command
        from alembic.config import Config
        cfg = Config(str(ini))
        cfg.set_main_option("script_location", str(ROOT / "alembic"))
        cfg.set_main_option("sqlalchemy.url", settings.db_url.replace("%", "%%"))
        command.upgrade(cfg, "head")
    else:
        Base.metadata.create_all(engine)
