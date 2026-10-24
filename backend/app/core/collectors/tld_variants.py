"""TLD-variant collector.

For every official brand domain (e.g. acmebank.com) this collector generates
candidates for the same label under every suspicious alternative TLD:

  acmebank.in  acmebank.net  acmebank.us  acmebank.co  …

These are fed to `candidate_from_web_url`, which normalises them into
`Candidate(kind="web")` objects.  The existing domain-match engine then scores
each one: a same-label / different-TLD domain already triggers the
`tld_swap` signal inside `analyze_domain`, so it will appear as suspicious.

No external API is called.  Candidates are generated deterministically from the
brand's registered domains and name.  The analyst sees only the ones whose
domain score clears the detection threshold.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime

from app.config.time import utcnow
from app.core.collectors.base import (
    BrandQuery,
    Candidate,
    CollectContext,
    Collector,
    candidate_from_web_url,
)

log = logging.getLogger("app.core.collectors.tld_variants")

# ── TLD list ─────────────────────────────────────────────────────────────────
# Ordered roughly by abuse frequency in brand-impersonation cases.
# Country-code TLDs are chosen for their market reach; the free/cheap ones
# (.tk .ml .ga .cf .gq) are historically abused in phishing campaigns.

SUSPICIOUS_TLDS: tuple[str, ...] = (
    # common generic
    "net", "org", "info", "biz", "co", "io",
    # new gTLDs popular for abuse
    "online", "site", "app", "shop", "store", "club", "pro", "xyz", "top",
    "live", "tech", "solutions", "services", "group", "global", "digital",
    # country codes – high-risk regions
    "in",   # India
    "us",   # United States
    "uk",   # United Kingdom (also .co.uk, but label.uk is registrable)
    "au",   # Australia
    "ca",   # Canada
    "de",   # Germany
    "fr",   # France
    "ru",   # Russia
    "cn",   # China
    "br",   # Brazil
    "mx",   # Mexico
    "pk",   # Pakistan
    "bd",   # Bangladesh
    "ng",   # Nigeria
    "gh",   # Ghana
    "ke",   # Kenya
    "za",   # South Africa
    "ph",   # Philippines
    "id",   # Indonesia
    "my",   # Malaysia
    "sg",   # Singapore
    "ae",   # UAE
    # free / cheap TLDs heavily used in phishing
    "tk", "ml", "ga", "cf", "gq",
)


def _label_of(domain: str) -> str | None:
    """Extract the registrable-domain label (the part before the last suffix)."""
    d = domain.strip().lstrip("*.").lower()
    parts = [p for p in d.split(".") if p]
    # For multi-label suffixes like co.uk, label is before them; simplify by taking first part.
    if len(parts) >= 2:
        return parts[0]
    return None


class TldVariantCollector(Collector):
    """Generates TLD-swapped web candidates for every official brand domain."""

    name = "tld_variants"
    kind = "web"
    platforms = ("web",)

    def __init__(self, tlds: tuple[str, ...] = SUSPICIOUS_TLDS) -> None:
        super().__init__()
        self._tlds = tlds

    def is_configured(self) -> bool:
        return True

    def collect(self, brand: BrandQuery, ctx: CollectContext) -> list[Candidate]:
        if "web" not in ctx.platforms:
            return []

        now: datetime = ctx.now() if callable(ctx.now) else utcnow()

        # Build the set of labels to vary: from official domains + the brand name itself
        labels: dict[str, str] = {}  # label -> source description

        for domain in brand.domains:
            lbl = _label_of(domain)
            if lbl and len(lbl) >= 3:
                labels[lbl] = domain

        # Also include the brand name slug (e.g. "acmebank" from "Acme Bank")
        name_slug = "".join(c for c in brand.name.lower() if c.isalnum())
        if len(name_slug) >= 4 and name_slug not in labels:
            labels[name_slug] = brand.name

        # For multi-word names, also try without spaces (already done above) and hyphenated
        if " " in brand.name:
            hyphen_slug = "-".join(brand.name.lower().split())
            hyphen_slug = "".join(c for c in hyphen_slug if c.isalnum() or c == "-")
            if len(hyphen_slug) >= 4 and hyphen_slug not in labels:
                labels[hyphen_slug] = brand.name

        if not labels:
            return []

        # Collect official TLDs so we can skip exact official domains
        official_labels_and_tlds: set[tuple[str, str]] = set()
        for domain in brand.domains:
            d = domain.strip().lstrip("*.").lower()
            parts = [p for p in d.split(".") if p]
            if len(parts) >= 2:
                official_labels_and_tlds.add((parts[0], ".".join(parts[1:])))

        candidates: list[Candidate] = []
        seen: set[str] = set()

        for label, origin in labels.items():
            for tld in self._tlds:
                # Skip if this is an exact official domain
                if (label, tld) in official_labels_and_tlds:
                    continue
                fake_host = f"{label}.{tld}"
                if fake_host in seen:
                    continue
                seen.add(fake_host)

                c = candidate_from_web_url(
                    f"https://{fake_host}",
                    source=self.name,
                    title=fake_host,
                    snippet=f"TLD variant of {origin}: same label with .{tld} instead of the official domain.",
                    fetched_at=now,
                    extras={"tld_variant_of": origin, "generated_tld": tld},
                )
                if c is not None:
                    candidates.append(c)

        log.debug("tld_variants: generated %d candidates for %d label(s)", len(candidates), len(labels))
        return candidates
