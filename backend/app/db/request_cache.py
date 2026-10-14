"""Per-session memo for repeated identical reads (the settings table is read many times per request).

The database can be far away (every query costs a network round trip), so a request that asks for the same row ten times pays ten
trips. The memo lives in `Session.info`, is dropped on every flush, commit and rollback, and therefore never outlives a write.
"""
from __future__ import annotations

from collections.abc import Callable, Hashable
from typing import Any

from sqlalchemy import event
from sqlalchemy.orm import Session

_KEY = "request_memo"


def memo(db: Session, key: Hashable, load: Callable[[], Any]) -> Any:
    store: dict = db.info.setdefault(_KEY, {})
    if key not in store:
        store[key] = load()
    return store[key]


def _clear(session: Session, *_a: Any) -> None:
    session.info.pop(_KEY, None)


event.listen(Session, "after_flush", _clear)
event.listen(Session, "after_commit", _clear)
event.listen(Session, "after_rollback", _clear)
