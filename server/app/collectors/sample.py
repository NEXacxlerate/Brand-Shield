"""Sample collector: deterministic, clearly synthetic candidates for ANY brand profile.

Used when the data mode resolves to `sample` (never in live mode). EVERY candidate has source="sample".
It produces, seeded by brand id and name:
  * echoes of the brand's own official assets (to prove the allowlist excludes them),
  * mutated look-alikes with lure bios and young accounts (engine techniques, see engine/synthetic.py),
  * hard negatives: other businesses that share one word with the brand.
Names are derived only from the user's own brand profile plus generic business words. It never invents
real people or real brands.
"""

from __future__ import annotations

import random
import re
from datetime import timedelta

from app.collectors.base import BrandQuery, Candidate, CollectContext, Collector
from app.engine.synthetic import BENIGN_SUFFIXES, generate_cases
from app.engine.urls import parse_profile_url, parse_store_url

SOURCE = "sample"
_LURES = [
    "Official customer support. DM us to verify your KYC and claim your cashback today.",
    "24x7 helpline. Account blocked? Message us now to unblock. Rewards and refund claims here.",
    "Congratulations! You have won a reward. Click the link in bio to claim before it expires.",
    "Official support desk. Share your account details in DM for instant refund.",
    "Update your KYC within 24 hours to avoid suspension. Contact our helpline.",
]
_NEUTRAL_BIOS = [
    "Family run business serving the neighbourhood since 2009.",
    "Fresh every day. Open 9 to 6, closed Sundays.",
    "Local shop and online orders. Say hello!",
]
_SOCIAL = ("instagram", "facebook", "x", "telegram", "linkedin")
_STORES = ("google_play", "app_store", "third_party_apk")
_HANDLE_MAX = {"instagram": 30, "x": 15, "telegram": 32, "facebook": 50, "linkedin": 100}


def _slug(text: str, platform: str) -> str:
    s = re.sub(r"[^a-z0-9._]", "", text.lower().replace(" ", "").replace("-", "_"))[: _HANDLE_MAX.get(platform, 30)]
    if platform == "x":
        s = s.replace(".", "")
    if platform == "telegram":
        s = s.replace(".", "_").lstrip("0123456789_")
    return s


def _profile_url(platform: str, handle: str) -> str:
    return {
        "instagram": f"https://www.instagram.com/{handle}/",
        "facebook": f"https://www.facebook.com/{handle}",
        "x": f"https://x.com/{handle}",
        "telegram": f"https://t.me/{handle}",
        "linkedin": f"https://www.linkedin.com/company/{handle}",
    }[platform]


def _valid_profile(platform: str, url: str) -> bool:
    p = parse_profile_url(url)
    return p.ok and p.platform == platform


class SampleCollector(Collector):
    name = "sample"
    kind = "mixed"
    platforms = ("instagram", "facebook", "x", "telegram", "linkedin", "google_play", "app_store", "third_party_apk")

    def __init__(self, *, seed: int = 3, lookalikes: int = 8, hard_negatives: int = 4, app_lookalikes: int = 3) -> None:
        super().__init__()
        self.seed = seed
        self.n_look = lookalikes
        self.n_neg = hard_negatives
        self.n_apps = app_lookalikes

    def collect(self, brand: BrandQuery, ctx: CollectContext) -> list[Candidate]:
        self.warnings = []
        now = ctx.now()
        rnd = random.Random(f"{self.seed}:{brand.brand_id}:{brand.name}")
        out: list[Candidate] = []
        out.extend(self._official_echoes(brand, now))
        out.extend(self._lookalikes(brand, rnd, now))
        out.extend(self._hard_negatives(brand, rnd, now))
        out.extend(self._app_candidates(brand, rnd, now))
        keep = [c for c in out if c.platform in ctx.platforms]
        for c in keep:
            c.source = SOURCE
            c.extras["data_source"] = SOURCE
        return keep

    # ------------------------------------------------------------------
    def _official_echoes(self, brand: BrandQuery, now) -> list[Candidate]:
        out = []
        for platform, handles in sorted(brand.official_handles.items()):
            if platform not in _SOCIAL:
                continue
            for h in handles:
                out.append(
                    Candidate(
                        platform=platform, kind="social", handle=h, display_name=brand.name, profile_url=_profile_url(platform, h),
                        source=SOURCE, fetched_at=now, bio=f"The official {brand.name} page.", followers=250_000, verified=True,
                        created_at=(now - timedelta(days=2400)).date(), extras={"sample_role": "official_echo"},
                    )
                )
        for name, package_id, publisher in brand.official_apps:
            out.append(
                Candidate(
                    platform="google_play", kind="app", handle=package_id, display_name=name,
                    profile_url=f"https://play.google.com/store/apps/details?id={package_id}", source=SOURCE, fetched_at=now,
                    bio=f"Official {brand.name} app.", store="google_play", publisher=publisher, rating=4.4, rating_count=120_000,
                    extras={"sample_role": "official_echo"},
                )
            )
        return out

    def _lookalikes(self, brand: BrandQuery, rnd: random.Random, now) -> list[Candidate]:
        positives = [c for c in generate_cases(brand.name, seed=self.seed, per_technique=4) if c.expect_flagged]
        rnd.shuffle(positives)
        out: list[Candidate] = []
        used: set[tuple[str, str]] = set()
        i = 0
        for case in positives:
            if len(out) >= self.n_look:
                break
            platform = _SOCIAL[i % len(_SOCIAL)]
            handle = _slug(case.text, platform)
            if len(handle) < 4 or (platform, handle) in used or not _valid_profile(platform, _profile_url(platform, handle)):
                continue
            used.add((platform, handle))
            i += 1
            age = rnd.randint(3, 60)
            out.append(
                Candidate(
                    platform=platform, kind="social", handle=handle, display_name=case.text.title() if case.text.isascii() else case.text,
                    profile_url=_profile_url(platform, handle), source=SOURCE, fetched_at=now, bio=rnd.choice(_LURES),
                    followers=rnd.randint(20, 900), following=rnd.randint(300, 4000), posts=rnd.randint(0, 9), verified=False,
                    created_at=(now - timedelta(days=age)).date(),
                    extras={"sample_role": "lookalike", "technique": case.technique, "account_age_days": age},
                )
            )
        return out

    def _hard_negatives(self, brand: BrandQuery, rnd: random.Random, now) -> list[Candidate]:
        first = brand.name.split()[0]
        suffixes = rnd.sample(BENIGN_SUFFIXES, k=min(self.n_neg, len(BENIGN_SUFFIXES)))
        out = []
        for i, suffix in enumerate(suffixes):
            platform = _SOCIAL[(i + 1) % len(_SOCIAL)]
            name = f"{first} {suffix}"
            handle = _slug(name, platform)
            if len(handle) < 4 or not _valid_profile(platform, _profile_url(platform, handle)):
                continue
            age = rnd.randint(700, 3000)
            out.append(
                Candidate(
                    platform=platform, kind="social", handle=handle, display_name=name, profile_url=_profile_url(platform, handle),
                    source=SOURCE, fetched_at=now, bio=rnd.choice(_NEUTRAL_BIOS), followers=rnd.randint(300, 20_000),
                    following=rnd.randint(50, 400), posts=rnd.randint(40, 900), verified=False,
                    created_at=(now - timedelta(days=age)).date(),
                    extras={"sample_role": "hard_negative", "account_age_days": age},
                )
            )
        return out

    def _app_candidates(self, brand: BrandQuery, rnd: random.Random, now) -> list[Candidate]:
        positives = [c for c in generate_cases(brand.name, seed=self.seed + 1, per_technique=3) if c.expect_flagged and c.text.isascii()]
        rnd.shuffle(positives)
        out: list[Candidate] = []
        for case in positives:
            if len(out) >= self.n_apps:
                break
            slug = re.sub(r"[^a-z0-9]", "", case.text.lower())
            if len(slug) < 4:
                continue
            platform = _STORES[len(out) % len(_STORES)]
            pkg = f"com.{slug}.app"
            if platform == "google_play":
                url, store = f"https://play.google.com/store/apps/details?id={pkg}", "google_play"
                ok = parse_store_url(url).ok
            elif platform == "app_store":
                app_id = str(rnd.randint(1_000_000_000, 1_999_999_999))
                url, store = f"https://apps.apple.com/in/app/{slug}/id{app_id}", "apple_app_store"
                ok = parse_store_url(url).ok
            else:
                url, store = f"https://apkpure.com/{slug}/{pkg}", "apkpure"
                ok = parse_store_url(url).ok
            if not ok:
                continue
            extras = {"sample_role": "lookalike", "technique": case.technique}
            if platform == "app_store":
                extras["apple_app_id"] = app_id
            if platform == "third_party_apk":
                extras["mirror"] = store
            out.append(
                Candidate(
                    platform=platform, kind="app", handle=pkg, display_name=case.text.title(), profile_url=url, source=SOURCE,
                    fetched_at=now, bio=rnd.choice(_LURES), store=store, publisher=f"{slug[:8].title()} Apps Ltd",
                    rating=round(rnd.uniform(2.1, 3.6), 1), rating_count=rnd.randint(3, 400), extras=extras,
                )
            )
        return out
