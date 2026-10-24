"""Certificate Transparency (crt.sh) collector.

Queries the public crt.sh API — no key required — to find TLS certificates
issued for domains that contain the brand name or are related to the brand's
official domains. Every hit is a domain that had a certificate issued, which is
strong evidence of an active website.

Two complementary query strategies:
  1. Wildcard-by-name  : %<brand>%   – any domain containing the brand keyword
  2. Wildcard-by-domain: %.<domain>  – subdomains of each official domain (picks
                                       up phishing sub-domains)

Results go to `candidate_from_web_url`, which normalises the host and creates
a `Candidate(kind="web")`. The scan pipeline's domain-match engine then scores
every web candidate independently.

Rate-limit: crt.sh imposes no public quota, but we cap queries per scan and
de-duplicate aggressively to keep latency low. Connections time out in 12 s.
"""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Callable
from datetime import datetime
from typing import Any

import httpx

from app.config.time import utcnow
from app.core.collectors.base import (
    BrandQuery,
    Candidate,
    CollectContext,
    Collector,
    SourceUnavailable,
    candidate_from_web_url,
    default_client_factory,
)

log = logging.getLogger("app.core.collectors.crtsh")

CRTSH_URL = "https://crt.sh/"
_WILDCARD_RE = re.compile(r"^\*\.")


class CrtshCollector(Collector):
    """Certificate Transparency collector powered by crt.sh (no API key required)."""

    name = "crtsh"
    kind = "web"
    platforms = ("web",)

    def __init__(
        self,
        *,
        client_factory: Callable[[], httpx.Client] = default_client_factory(12.0),
        max_queries_per_scan: int = 8,
        max_domains_per_query: int = 60,
    ) -> None:
        super().__init__()
        self._client_factory = client_factory
        self.max_queries = max_queries_per_scan
        self.max_domains = max_domains_per_query

    def is_configured(self) -> bool:
        return True

    def collect(self, brand: BrandQuery, ctx: CollectContext) -> list[Candidate]:
        if "web" not in ctx.platforms:
            return []

        queries: list[str] = []

        # Strategy 1: brand name and all aliases/keywords (wildcarded on both sides)
        for term in brand.terms[:4]:
            safe = re.sub(r"[^\w\-]", "", term.replace(" ", ""))  # letters/digits/hyphens only
            if len(safe) >= 4:
                queries.append(f"%{safe}%")

        # Strategy 2: subdomains of each official domain
        for domain in brand.domains[:3]:
            d = domain.strip().lstrip("*.").lower()
            if d:
                queries.append(f"%.{d}")

        if not queries:
            return []

        queries = queries[: self.max_queries]
        collected: dict[str, Candidate] = {}
        now = ctx.now() if callable(ctx.now) else utcnow()

        with self._client_factory() as client:
            for q in queries:
                try:
                    rows = self._fetch(client, q)
                except SourceUnavailable:
                    raise
                except Exception as exc:  # noqa: BLE001
                    log.warning("crtsh: query %r failed: %s", q, exc)
                    continue

                for row in rows[: self.max_domains]:
                    for raw_host in _expand(row.get("name_value", "")):
                        if not raw_host or len(raw_host) > 253:
                            continue
                        c = candidate_from_web_url(
                            f"https://{raw_host}",
                            source=self.name,
                            title=raw_host,
                            snippet=f"Certificate found in crt.sh (issuer: {row.get('issuer_cn', '')})",
                            fetched_at=now,
                            extras={
                                "crtsh_id": row.get("id"),
                                "issuer": row.get("issuer_cn", ""),
                                "not_before": row.get("not_before", ""),
                                "not_after": row.get("not_after", ""),
                            },
                        )
                        if c is not None:
                            key = c.key
                            # skip official domains (exact match on registrable domain)
                            reg = c.extras.get("registrable_domain", "")
                            if any(reg == _reg(d) for d in brand.domains if d):
                                continue
                            if key not in collected:
                                collected[key] = c

                # Small pause between queries so we don't hammer crt.sh
                time.sleep(0.4)

        return list(collected.values())

    # ------------------------------------------------------------------

    def _fetch(self, client: httpx.Client, q: str) -> list[dict[str, Any]]:
        try:
            resp = client.get(CRTSH_URL, params={"q": q, "output": "json"}, timeout=12.0)
        except httpx.TimeoutException as exc:
            raise SourceUnavailable("timeout", f"crt.sh timed out for query {q!r}.") from exc
        except httpx.TransportError as exc:
            raise SourceUnavailable("unreachable", f"crt.sh unreachable: {exc}") from exc

        if resp.status_code == 429:
            raise SourceUnavailable("rate_limited", "crt.sh rate limit hit — try again later.", retry_after=60)
        if resp.status_code >= 500:
            raise SourceUnavailable("bad_response", f"crt.sh returned HTTP {resp.status_code}.")
        if resp.status_code >= 400:
            log.debug("crtsh: HTTP %s for query %r", resp.status_code, q)
            return []

        text = resp.text.strip()
        if not text or text == "null":
            return []
        try:
            data = resp.json()
        except Exception:  # noqa: BLE001
            return []
        return data if isinstance(data, list) else []


# ---------------------------------------------------------------------------
# helpers


def _expand(name_value: str) -> list[str]:
    """Split multi-line name_value fields; strip wildcards; lower-case."""
    out = []
    for part in re.split(r"[\n,\s]+", name_value):
        part = part.strip().lower()
        part = _WILDCARD_RE.sub("", part)  # drop "*." prefix
        if part and "." in part and not part.startswith("."):
            out.append(part)
    return out


def _reg(domain: str) -> str:
    """Best-effort registrable domain from a brand domain string (no tldextract dependency here)."""
    d = domain.strip().lstrip("*.").lower()
    parts = d.split(".")
    if len(parts) >= 2:
        return ".".join(parts[-2:])
    return d
