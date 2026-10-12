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
| click | 8.5.0 | BSD-3-Clause | no |
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
| python-dotenv | 1.2.4 | BSD-3-Clause | no |
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
