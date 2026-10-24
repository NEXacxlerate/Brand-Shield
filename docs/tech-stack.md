# Technology stack

**Plain-language summary**

- BrandShield has three parts: a Python web service (the "backend"), a React web app (the "frontend"), and a second React app called Brand Studio that is served under `/studio/`.
- Data lives in a PostgreSQL database (Supabase in the Vercel setup) or a local SQLite file for development.
- Outside services (Tavily, Google Gemini, Groq, Pollinations, Google Safe Browsing, Hugging Face, Sentry) are all optional and switched on only by keys.
- Versions below are the constraints written in the repo's dependency files (for example `>=0.115,<1` means "0.115 or newer, but below 1.0"). They are **not** the exact installed versions; no lock file exists for the Python side.

---

## 1. Languages and runtimes

| Technology | Version (as written) | Where it is used | Source |
|---|---|---|---|
| Python | `>=3.11` required; Docker image `python:3.12-slim`; CI tests 3.11 and 3.12; Vercel default noted as 3.12 | Backend | `backend/pyproject.toml:10`, `backend/Dockerfile:8,21`, `.github/workflows/ci.yml:26,55,98`, `docs/DEPLOY_VERCEL.md` (platform facts table) |
| TypeScript | frontend `~6.0.2`; studio `~5.8.2` | Both React apps | `frontend/package.json:36`, `studio/package.json:33` |
| Node.js | `22` (CI and both Dockerfiles) | Build and tooling | `.github/workflows/ci.yml:35-37`, `frontend/Dockerfile:8`, `studio/Dockerfile:8` |
| Node (root helper) | no version pinned | `scripts/dev.mjs` uses only Node built-ins | `scripts/dev.mjs:5-9`, `package.json:1-9` |
| Shell / SQL | POSIX `sh`; Alembic migrations 0001-0012 | Container entrypoint, DB schema | `backend/docker-entrypoint.sh`, `backend/alembic/versions/` |

## 2. Backend (Python) runtime dependencies

All from `backend/requirements.txt` (also read by Vercel through `pyproject.toml`, `backend/pyproject.toml:16-17`).

| Package | Version constraint | Why / where | Source line |
|---|---|---|---|
| FastAPI | `>=0.115,<1` | Web framework; routers in `backend/app/api/*`, app factory `create_app` in `backend/app/main.py:50` | `backend/requirements.txt:1` |
| Uvicorn (`standard`) | `>=0.30,<1` | ASGI server (`uvicorn app.main:create_app --factory`) | `requirements.txt:2`, `backend/docker-entrypoint.sh:20` |
| SQLAlchemy | `>=2.0,<2.1` | ORM, 2.0 style models in `backend/app/models/*` | `requirements.txt:3` |
| Alembic | `>=1.13,<2` | Schema migrations (`backend/alembic/versions/0001...0012`), run via `backend/scripts/migrate.py` | `requirements.txt:4` |
| psycopg (`binary`) | `>=3.2,<4` | PostgreSQL driver (URLs `postgresql+psycopg://`) | `requirements.txt:5` |
| pydantic | `>=2.7,<3` | Request/response schemas | `requirements.txt:6` |
| pydantic-settings | `>=2.3,<3` | `Settings` from environment (`backend/app/config/config.py:17`) | `requirements.txt:7` |
| email-validator | `>=2.1,<3` | `EmailStr` on login/sign-up (`backend/app/schemas/auth.py:7,47`) | `requirements.txt:8` |
| httpx | `>=0.27,<1` | All outbound HTTP (collectors, Safe Browsing, Studio AI, SSRF-safe fetchers) | `requirements.txt:9` |
| PyJWT | `>=2.8,<3` | Access and refresh tokens (`backend/app/config/security.py:6,35`) | `requirements.txt:10` |
| bcrypt | `>=4.1,<6` | Password hashing, 12 rounds (`security.py:11,15-16`) | `requirements.txt:11` |
| Pillow | `>=10.3` (no upper cap) | Logo/image validation, hashing, re-encode (`backend/app/core/pipeline/logo.py`, `image_fetch.py`) | `requirements.txt:12` |
| redis (client) | `>=5,<7` | Scan queue connection and worker health (`backend/app/worker.py:92-95`) | `requirements.txt:13` |
| rq | `>=1.16,<3` | Background job queue for scans (`backend/app/services/jobs.py`) | `requirements.txt:14` |
| python-multipart | `>=0.0.9` | File uploads (logos, images, imports) | `requirements.txt:15` |
| tldextract | `>=5.1,<6` | Registrable domain via the bundled public-suffix snapshot, no runtime download | `requirements.txt:16` |
| rapidfuzz | `>=3.9,<4` | String-similarity signal for domains; voice fast path (`backend/app/services/voice.py:32`) | `requirements.txt:17` |
| google-genai | `>=1.20,<3` | Gemini function calling for the voice agent | `requirements.txt:18` |
| idna | `>=3.7,<4` | IDN/punycode handling | `requirements.txt:19` |

### 2.1 Optional backend extras (`backend/requirements-extra.txt`)

Installed only when you run `pip install -r requirements-extra.txt` or build Docker with `INSTALL_EXTRAS=true` (`backend/Dockerfile:15-17`). Each is imported lazily and enabled by a setting.

| Package | Version constraint | Why / where | Source line |
|---|---|---|---|
| sentry-sdk | `>=2.0,<3` | Error reporting when `SENTRY_DSN` is set (`backend/app/config/observability.py`) | `requirements-extra.txt:3` |
| ImageHash | `>=4.3,<5` | Optional image-similarity backend (`IMAGE_SIMILARITY_BACKEND=imagehash`); pulls numpy, scipy, PyWavelets | `requirements-extra.txt:4` |
| google-genai | `>=2.30,<3` | Gemini text provider (`SCAM_LLM_PROVIDER=gemini`) | `requirements-extra.txt:5` |
| huggingface_hub | `>=1.0,<2` | Optional Hugging Face text provider (capped below 2 because fastembed needs `<2.0`) | `requirements-extra.txt:6` |
| google-play-scraper | `>=1.2,<2` | Google Play search adapter | `requirements-extra.txt:7` |
| fastembed | `>=0.9,<1` | CLIP image embeddings for the Look-alike Lab (ONNX, no torch; model downloads on first use into `DATA_DIR/models`) | `requirements-extra.txt:8` |

**Needs confirmation:** `google-genai` appears in both files with different constraints (`>=1.20,<3` in `requirements.txt:18`, `>=2.30,<3` in `requirements-extra.txt:5`). Confirm which version range is actually intended when both files are installed (pip must satisfy both, so effectively `>=2.30,<3`).

### 2.2 Backend dev dependencies (`backend/requirements-dev.txt`)

| Package | Constraint | Use | Source |
|---|---|---|---|
| pytest | `>=8,<9` | Test runner (`backend/pyproject.toml:19-22`) | `requirements-dev.txt:2` |
| ruff | `>=0.5` | Linter (rules E, F, I, UP, B; line length 140) | `requirements-dev.txt:3`, `backend/pyproject.toml:24-31` |

## 3. Frontend (BrandShield, `frontend/package.json`)

| Package | Constraint | Why | Source line |
|---|---|---|---|
| react, react-dom | `^19.2.8` | UI library | `frontend/package.json:21-22` |
| react-router-dom | `^7.18.4` | Client-side routing and guards (`frontend/src/App.tsx:2`) | `package.json:23` |
| lucide-react | `^1.55.0` | Icons | `package.json:20` |
| d3-geo (+ `@types/d3-geo`) | `^3.1.1` | Map drawing for the dashboard (data in `frontend/public/states.geojson`) | `package.json:18-19` |
| Vite | `^8.3.0` | Dev server and bundler (`frontend/vite.config.ts`) | `package.json:37` |
| @vitejs/plugin-react | `^6.1.1` | React support in Vite | `package.json:33` |
| Vitest | `^5.0.4` | Unit/component tests (jsdom) | `package.json:38` |
| jsdom | `^29.1.1` | Test DOM | `package.json:34` |
| @testing-library/react / jest-dom / user-event | `^16.3.3` / `^7.0.1` / `^14.6.7` | Component testing helpers | `package.json:27-29` |
| @playwright/test | `^1.64.0` | Browser end-to-end tests (`frontend/e2e/*.spec.ts`) | `package.json:26` |
| oxlint | `^1.81.0` | Linter | `package.json:35` |
| TypeScript | `~6.0.2` | Type-check (`tsc -b`) | `package.json:36` |
| @types/node, @types/react, @types/react-dom | `^24.13.3`, `^19.2.18`, `^19.2.7` | Type definitions | `package.json:30-32` |

Scripts: `dev` (vite), `build` (`tsc -b && vite build`), `lint` (oxlint), `typecheck`, `test` (`vitest run`), `test:e2e` (`playwright test`) (`frontend/package.json:6-16`). Fonts: Manrope from Google Fonts (`frontend/index.html:8-10`). The frontend uses no state-management or HTTP library; it has its own fetch wrapper (`frontend/src/api/client.ts`).

## 4. Brand Studio (`studio/package.json`)

Line numbers below refer to `studio/package.json`.

| Package | Constraint | Why | Line |
|---|---|---|---|
| react, react-dom | `^19.0.0` | UI | 21, 23 |
| Vite | `^6.4.4` | Bundler; `base: '/studio/'` (`studio/vite.config.ts:10`) | 34 |
| @vitejs/plugin-react | `^5.0.4` | React in Vite | 16 |
| Tailwind CSS + @tailwindcss/vite | `^4.1.14` | Styling | 15, 32 |
| tailwind-merge, clsx | `^3.5.0`, `^2.1.1` | Class helpers | 25, 18 |
| chart.js + react-chartjs-2 | `^4.5.1`, `^5.3.1` | Analytics charts | 17, 22 |
| motion | `^12.23.24` | Animations | 20 |
| react-markdown | `^10.1.0` | Rendering AI answers | 24 |
| lucide-react | `^0.546.0` | Icons | 19 |
| Vitest, jsdom, Testing Library | `^3.2.4`, `^26.1.0`, `^6.6.3` / `^16.3.0` | Tests | 28, 29, 31, 35 |
| TypeScript | `~5.8.2` | `tsc --noEmit` is the "lint" script | 33 |

Studio has no AI SDK of its own: all AI calls go through the BrandShield backend (`studio/src/services/gemini.ts:1-6`, `studio/src/lib/ai.ts`). Font: Inter from Google Fonts (`studio/index.html:9-12`).

## 5. Datastores, queue, cache

| Technology | Version | Role | Source |
|---|---|---|---|
| PostgreSQL | `postgres:17-alpine` image (Compose and CI service); Supabase-hosted Postgres in the Vercel deployment (version chosen by Supabase, not pinned in the repo) | Primary database in production | `docker-compose.yml:39`, `.github/workflows/ci.yml:78`, `docs/DEPLOY_VERCEL.md` |
| SQLite | Python stdlib | Default for local runs and most tests (`sqlite:///.../data/scammind.db`, WAL mode, foreign keys on) | `backend/app/config/config.py:28`, `backend/app/db/session.py:12-43` |
| Supabase | hosted service | Managed Postgres; runtime uses the transaction pooler (port 6543, prepared statements off), migrations use a direct/session URL (5432) | `backend/app/db/session.py:30-31`, `backend/app/config/config.py:35-37` |
| Redis | `redis:7.2-alpine` (Compose only) | Backing store for the RQ scan queue; AOF on, password required | `docker-compose.yml:55-67` |
| RQ | `rq>=1.16,<3` | Job queue; worker is `python -m app.worker` | `backend/app/worker.py:93-100` |
| In-process thread runner | stdlib | Scan runner when no Redis | `backend/app/services/jobs.py:61-65` |
| In-process response cache | custom | 15 s cache of heavy read endpoints, dropped by any write | `backend/app/config/response_cache.py:1-18` |
| Per-session memo | custom | Repeated identical reads within one request | `backend/app/db/request_cache.py:1-30` |
| File store | custom | Local files under `DATA_DIR` or rows in `stored_files` table | `backend/app/core/storage.py:1-10,169-176` |
| Local named volumes | Docker | `pgdata`, `redisdata`, `scammind-data` | `docker-compose.yml:163-166` |

There is no separate cache server: Redis is used for the queue only (`docs`/code show no other Redis use).

## 6. Cloud and third-party services

| Service | Used for | Required? | Where | Key variable |
|---|---|---|---|---|
| Vercel | Hosting: three "services" on one domain plus Cron | Optional (one deployment target; documented as never deployed) | `vercel.json`, `docs/DEPLOY_VERCEL.md:7-12` | `VERCEL` (set by platform), `CRON_SECRET` |
| Supabase | Managed Postgres | Optional | see above | `DATABASE_URL`, `MIGRATION_DATABASE_URL` |
| Tavily | Live web search collector (`POST https://api.tavily.com/search`) | Optional | `backend/app/core/collectors/tavily.py:38` | `TAVILY_API_KEY` |
| SearXNG | Optional self-hosted search fallback | Optional | `backend/app/core/collectors/searxng.py` | `SEARXNG_BASE_URL` |
| Apple iTunes Search API | App store collector, no key | Used in live mode | `backend/app/core/collectors/itunes.py:34` | none |
| Google Play (scraper) | App store collector | Optional package | `backend/app/core/collectors/google_play.py` | none |
| Google Safe Browsing v4 | URL reputation (`threatMatches:find`) | Optional | `backend/app/core/providers/safe_browsing.py:42` | `GOOGLE_SAFE_BROWSING_API_KEY` |
| Google Gemini | Scan text analysis, Studio chat fallback, voice agent | Optional | `backend/app/services/studio_ai.py:40`, `backend/app/core/providers/text/gemini.py:36` | `GEMINI_API_KEY`, `VOICE_GEMINI_API_KEY` |
| Groq | Studio chat (primary) | Optional | `backend/app/services/studio_ai.py:39` | `GROQ_API_KEY` |
| Pollinations | Studio image generation | Optional | `backend/app/services/studio_ai.py:41` | `POLLINATIONS_API_KEY` |
| Hugging Face Inference | Optional text provider; also hosts the CLIP model weights downloaded by fastembed | Optional | `backend/app/core/providers/text/huggingface.py`, `backend/requirements-extra.txt:6,8` | `HUGGINGFACE_API_TOKEN` |
| Sentry | Error reporting | Optional | `backend/app/config/observability.py` | `SENTRY_DSN` |
| Google Fonts | Manrope and Inter web fonts (allowed in CSP) | Browser loads it | `frontend/index.html:8-10`, `vercel.json:114` | none |
| GitHub Actions | CI | n/a | `.github/workflows/ci.yml` | none (no secrets) |

## 7. Containers and web servers

| Item | Version | Source |
|---|---|---|
| Backend image base | `python:3.12-slim` (multi-stage, non-root uid 10001, venv in `/opt/venv`) | `backend/Dockerfile:8,21,25-26` |
| Frontend and Studio runtime | `nginxinc/nginx-unprivileged:1.27-alpine` (port 8080) | `frontend/Dockerfile:17`, `studio/Dockerfile:15` |
| Frontend/Studio build image | `node:22-alpine` | `frontend/Dockerfile:8`, `studio/Dockerfile:8` |
| Docker Compose project | name `scammind` | `docker-compose.yml:13` |

## 8. Dev tooling and CI

| Tool | Purpose | Where |
|---|---|---|
| ruff | Python lint (`ruff check .` in `backend/`) | `.github/workflows/ci.yml:29-33`, `backend/pyproject.toml:24-55` |
| oxlint | Frontend lint (`npm run lint`) | `ci.yml:42-44`, `frontend/.oxlintrc.json` |
| tsc | Type-check (`tsc -b` frontend; `tsc --noEmit` studio) | `ci.yml:45-47,147-149` |
| pytest | Backend tests; SQLite by default, Postgres via `TEST_DATABASE_URL` | `ci.yml:66-68,110-112`, `backend/tests/conftest.py` |
| Vitest | Frontend and Studio unit tests | `ci.yml:127-129,150-152` |
| Playwright (Chromium) | Browser end-to-end tests against the real API with sample data | `ci.yml:157-198`, `frontend/playwright.config.ts` |
| Vite | Dev servers and production builds | `frontend/vite.config.ts`, `studio/vite.config.ts` |
| Canary script | `python -m scripts.canary`: in-memory detection self-check | `ci.yml:69-71`, `backend/scripts/canary.py:1-5` |
| Docker buildx | Image builds in CI (no push) | `ci.yml:201-231` |

### 8.1 GitHub Actions jobs (`.github/workflows/ci.yml`)

Triggers: push to `main`, and pull requests (`ci.yml:6-9`). Read-only permissions and per-ref concurrency (`ci.yml:11-16`).

| Job | What it does | Depends on | Lines |
|---|---|---|---|
| `lint` | ruff on backend; oxlint and type-check on frontend (Python 3.12, Node 22) | none | 19-47 |
| `test-server` | pytest on SQLite for Python 3.11 and 3.12, plus canary | none | 49-71 |
| `test-server-postgres` | Postgres 17 service; runs migrations twice (second must be a no-op), then pytest on Postgres | none | 73-112 |
| `test-frontend` | Vitest and production build | none | 114-132 |
| `test-studio` | tsc, Vitest, build | none | 134-155 |
| `e2e` | Playwright with real API on SQLite and sample collector; uploads traces on failure | test-server, test-frontend, test-studio | 157-198 |
| `build` | Builds the three Docker images without pushing | lint, test-server, test-frontend, test-studio | 201-231 |
| `publish` (commented out) | Optional push to ghcr.io | disabled | 233-261 |

The workflow file states it was written and YAML-checked locally but never run (`ci.yml:3-5`).

## 9. Why these choices (as recorded in the code)

- **SQLite + Postgres:** same SQLAlchemy models run on both; SQLite keeps local setup to zero services (`backend/app/db/session.py:10-45`).
- **Optional everything external:** a fresh install runs on sample data with no keys (`backend/app/core/collectors/selection.py:77-100`).
- **Lazy imports:** `rq`, `redis`, Sentry, Gemini, Hugging Face and CLIP are imported only when used, so the app and tests start without them (`backend/app/services/jobs.py:8-9`, `backend/requirements-extra.txt:1-2`).
- **httpx with pinned-IP connections:** outbound fetches resolve the host once and connect to that IP (see `docs/auth-and-security.md`, SSRF).
