"""The settings table is tiny and read many times per request: load it once (one round trip) and look keys up in memory."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.request_cache import memo
from app.models import Setting


def setting_row(db: Session, key: str) -> Setting | None:
    rows = memo(db, "settings_all", lambda: {r.key: r for r in db.scalars(select(Setting))})
    return rows.get(key)
