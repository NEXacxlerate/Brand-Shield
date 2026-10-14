"""Short in-process cache for the heavy, read-only API pages (dashboard, lists, sources, settings).

The database can be far away (every query is a network round trip), so a page that needs ten queries is slow even when the code is
fast. Cached answers live for RESPONSE_CACHE_SECONDS (default 15) and are dropped at once by ANY write request (POST, PUT, PATCH,
DELETE) and when a scan starts or finishes, so a person never looks at numbers older than their own last action. Entries are kept
per sign-in (the Authorization header), because some answers differ by role. One process only: a separate worker's writes are seen
after at most the TTL. Set RESPONSE_CACHE_SECONDS=0 to turn it off (the tests do).
"""
from __future__ import annotations

import hashlib
import threading
import time

CACHEABLE = frozenset({
    "/api/dashboard", "/api/sources", "/api/settings", "/api/detections", "/api/detections/excluded", "/api/detections/false-positives",
    "/api/brands", "/api/reports", "/api/lookalike/test-cases", "/api/scans", "/api/scans/latest", "/api/providers",
})
_MAX_ENTRIES = 400
_lock = threading.Lock()
_store: dict[tuple, tuple[float, bytes, str]] = {}


def key_for(path: str, query: str, auth: str | None) -> tuple:
    return (path, query, hashlib.sha256((auth or "").encode()).hexdigest()[:16])


def get(key: tuple, ttl: float) -> tuple[bytes, str] | None:
    with _lock:
        hit = _store.get(key)
        if hit is None or time.monotonic() - hit[0] > ttl:
            return None
        return hit[1], hit[2]


def put(key: tuple, body: bytes, media_type: str) -> None:
    with _lock:
        if len(_store) >= _MAX_ENTRIES:
            _store.clear()
        _store[key] = (time.monotonic(), body, media_type)


def bust() -> None:
    with _lock:
        _store.clear()
