"""Evidence snapshots: the candidate data saved in the file store (DATA_DIR or the database), content-addressed, with its SHA-256.

The stored bytes ARE what was hashed, so anyone can re-hash the file and compare with `evidence.sha256`.
Volatile fields (fetch time) are left out of the snapshot so an unchanged listing keeps the same hash.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.core.collectors.base import Candidate
from app.core.storage import FileStore

_VOLATILE = {"fetched_at", "cached_at", "stale"}


def snapshot_payload(c: Candidate) -> dict[str, Any]:
    d = c.to_dict()
    return {k: v for k, v in d.items() if k not in _VOLATILE}


def snapshot_bytes(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"), default=str).encode("utf-8")


def save_snapshot(store: FileStore, payload: dict[str, Any], db: Session | None = None) -> tuple[str, str]:
    """Write the snapshot (once per distinct content). Returns (sha256 hex, path relative to the store root)."""
    raw = snapshot_bytes(payload)
    sha = hashlib.sha256(raw).hexdigest()
    rel = (Path("evidence") / sha[:2] / f"{sha}.json").as_posix()
    store.write_if_absent(rel, raw, db)
    return sha, rel


def save_screenshot(store: FileStore, png: bytes, db: Session | None = None) -> tuple[str, str]:
    sha = hashlib.sha256(png).hexdigest()
    rel = (Path("evidence") / "screenshots" / sha[:2] / f"{sha}.png").as_posix()
    store.write_if_absent(rel, png, db)
    return sha, rel


def read_file(store: FileStore, rel: str | None) -> bytes | None:
    """The stored bytes for a relative path, or None when it is missing or outside the store."""
    return store.read(rel)


def read_snapshot(store: FileStore, rel: str | None, expected_sha: str | None) -> tuple[dict | None, bool]:
    """(snapshot json, hash_matches). Missing/unreadable file -> (None, False)."""
    raw = store.read(rel)
    if raw is None:
        return None, False
    ok = bool(expected_sha) and hashlib.sha256(raw).hexdigest() == expected_sha
    try:
        return json.loads(raw.decode("utf-8")), ok
    except (ValueError, UnicodeDecodeError):
        return None, False
