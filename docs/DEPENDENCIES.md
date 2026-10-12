# Dependencies (server/)

Licenses read from installed package metadata (`importlib.metadata`) in `server/.venv` on 2026-10-13.
Direct dependencies are listed in `server/requirements.txt` / `requirements-dev.txt`; the rest are transitive.

## Needs review

| Package | Version | License | Why flagged |
|---|---|---|---|
| psycopg | 3.3.6 | LGPL-3.0-only | Weak copyleft. Used unmodified as a normal import (PostgreSQL driver); generally acceptable, but legal should confirm for distribution. Alternative: none permissive for Postgres except `pg8000` (BSD-3). |
| psycopg-binary | 3.3.6 | LGPL-3.0-only | Same as above (bundled libpq and compiled extension). |
| certifi | 2026.7.22 | MPL-2.0 | File-level weak copyleft; only matters if we modify certifi files. Pulled in by httpx. |
| colorama | 0.4.6 | (License field empty; classifier says BSD License) | Metadata unclear but upstream is BSD-3-Clause. Windows-only dev/test dependency of pytest/click. |
| pillow | 12.3.0 | MIT-CMU | Permissive (HPND-style); listed only because the identifier is uncommon. |
| email-validator | 2.3.0 | Unlicense | Public-domain dedication; some legal teams prefer a named license. |
| python-dateutil | 2.9.0.post0 | "Dual License" (BSD and Apache-2.0 per its classifiers) | Transitive (rq -> croniter -> python-dateutil). Either license is permissive; the metadata `License` field just says "Dual License". |

No GPL or AGPL packages were found.

## All installed packages

| Package | Version | License | Direct? |
|---|---|---|---|
| alembic | 1.20.0 | MIT | yes |
| annotated-doc | 0.0.5 | MIT | no |
| annotated-types | 0.8.0 | MIT | no |
| anyio | 4.15.1 | MIT | no |
| bcrypt | 5.0.0 | Apache-2.0 | yes |
| certifi | 2026.7.22 | MPL-2.0 | no |
| click | 8.5.0 | BSD-3-Clause | no (rq dependency) |
| croniter | 6.2.4 | MIT | no (rq dependency, added in Phase 4) |
| colorama | 0.4.6 | BSD (classifier) | no |
| dnspython | 2.9.0 | ISC | no |
| email-validator | 2.3.0 | Unlicense | yes |
| fastapi | 0.143.0 | MIT | yes |
| greenlet | 3.5.6 | MIT AND PSF-2.0 | no |
| h11 | 0.16.0 | MIT | no |
| httpcore | 1.0.9 | BSD-3-Clause | no |
| httptools | 0.9.0 | MIT | no |
| httpx | 0.28.1 | BSD-3-Clause | yes |
| idna | 3.20 | BSD-3-Clause | no |
| iniconfig | 2.3.1 | MIT | no |
| Mako | 1.4.3 | MIT | no |
| MarkupSafe | 3.0.4 | BSD-3-Clause | no |
| opentelemetry-api | 1.45.1 | Apache-2.0 | no |
| packaging | 26.3 | Apache-2.0 OR BSD-2-Clause | no |
| pillow | 12.3.0 | MIT-CMU | yes |
| pip | 24.2 | MIT | no |
| pluggy | 1.6.0 | MIT | no |
| psycopg | 3.3.6 | LGPL-3.0-only | yes |
| psycopg-binary | 3.3.6 | LGPL-3.0-only | yes (extra) |
| pydantic | 2.14.1 | MIT | yes |
| pydantic-settings | 2.15.0 | MIT | yes |
| pydantic_core | 2.50.1 | MIT | no |
| Pygments | 2.21.0 | BSD-2-Clause | no |
| PyJWT | 2.15.1 | MIT | yes |
| pytest | 8.4.2 | MIT | dev |
| python-dateutil | 2.9.0.post0 | Dual License (classifiers: BSD and Apache Software License) | no (croniter dependency, added in Phase 4) |
| python-dotenv | 1.2.4 | BSD-3-Clause | no |
| redis | 6.4.0 | MIT | yes (Phase 4) |
| rq | 2.12.0 | BSD-2-Clause | yes (Phase 4) |
| six | 1.17.0 | MIT | no (python-dateutil dependency, added in Phase 4) |
| python-multipart | 0.0.32 | Apache-2.0 | yes |
| PyYAML | 6.0.3 | MIT | no |
| ruff | 0.17.0 | MIT | dev |
| SQLAlchemy | 2.0.54 | MIT | yes |
| starlette | 1.7.0 | BSD-3-Clause | no |
| typing-inspection | 0.4.4 | MIT | no |
| typing_extensions | 4.16.0 | PSF-2.0 | no |
| tzdata | 2026.5 | Apache-2.0 | no |
| uvicorn | 0.54.0 | BSD-3-Clause | yes |
| watchfiles | 1.3.0 | MIT | no |
| websockets | 17.2 | BSD-3-Clause | no |

## Phase 2 (detection engine)

No package was added to `requirements.txt`. The engine uses only the standard library, Pillow and pydantic (already present). pHash/dHash, the DCT, Damerau-Levenshtein and DP word segmentation are implemented in `server/app/engine/`; `imagehash` and `numpy` were not needed.

Optional packages, lazily imported, NOT installed and NOT in requirements (the engine works without them):

| Package | License (from package metadata) | Used by | Notes |
|---|---|---|---|
| anthropic | MIT (wheel METADATA: `License: MIT`, classifier MIT) | `engine/llm.py` `AnthropicScamIntentLLM`, only when `SCAM_LLM_ENABLED=true` and `ANTHROPIC_API_KEY` is set | Metadata of the wheel downloaded 2026-10-13 (version string 1.13.0 as shown by pip). Sends bio text to a third party when enabled; off by default. Pin a version when it is first installed. |
| open_clip_torch + torch | MIT (open_clip) / BSD-3-Clause (torch), from upstream project pages, NOT verified from metadata because not downloaded | `engine/logo_similarity.py` `ClipSimilarity` (optional CLIP embedder) | Heavy (hundreds of MB). Each pretrained model weight set has its own license; check before use. Unverified, do not install without a metadata check. |


## Phase 3 (collectors)

No package was added to `requirements.txt`. Everything uses `httpx` (already a direct dependency; its `MockTransport` is used in tests, so no `respx`).

Optional package, lazily imported, NOT installed and NOT in requirements (`server/app/collectors/google_play.py`):

| Package | License | Used by | Notes |
|---|---|---|---|
| google-play-scraper (import name `google_play_scraper`) | **UNVERIFIED.** Believed MIT from memory of the upstream project; metadata could not be checked offline and the package was not downloaded | `GooglePlayCollector` (search), only if the user installs it | **Needs review before use:** confirm the license from the wheel metadata, pin a version, and review the terms-of-use risk (it scrapes Google Play pages, there is no official search API). Without it the source reports `not_installed` and the app works. Tests inject a fake search function and never import it. |

External services (no package): Tavily Search API (needs `TAVILY_API_KEY`; plan terms apply), Apple iTunes Search API (no key, about 20 calls per minute), optional self-hosted SearXNG (AGPL-3.0 software run by the operator as a separate service, not linked or bundled; legal may want to note it).


## Phase 4 (scan pipeline, background worker)

Added to `server/requirements.txt` after reading the licenses from the installed package metadata (`importlib.metadata`, 2026-10-13):

| Package | Version | License (from metadata) | Why |
|---|---|---|---|
| rq | 2.12.0 | BSD-2-Clause (`License-Expression`; classifier "BSD License") | Redis queue + worker for scans (`python -m app.worker`). Imported lazily, so the app and the tests run without it being used. |
| redis | 6.4.0 | MIT (`License-Expression`; classifier "MIT License") | Redis client used by rq and by the job dispatcher. Lazy import. |
| croniter | 6.2.4 | MIT | Pulled in by rq (scheduled jobs; we do not use rq's scheduler). |
| python-dateutil | 2.9.0.post0 | Dual: BSD and Apache-2.0 (classifiers; the `License` field only says "Dual License") | Pulled in by croniter. |
| six | 1.17.0 | MIT | Pulled in by python-dateutil. |

No GPL or AGPL packages were added. `fakeredis` was NOT used (the tests inject fake `redis` / `rq` modules instead). Playwright (optional screenshot hook) is NOT installed and NOT in requirements; its license is unverified because it was never downloaded.

**Not verified:** a real Redis server and a real RQ worker run. Only the dispatch logic (queue name, function path, job id, fallback to a thread when Redis is unreachable) is tested, against fake modules.
