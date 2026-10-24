# Configuration reference

**Plain-language summary**

- BrandShield is configured only through environment variables (and, for local runs, a `backend/.env` file that is never committed).
- Only one value is truly mandatory for the backend to start: `JWT_SECRET`. Everything else has a safe default or is optional.
- Features that call outside services (web search, AI, link reputation) stay off until the matching key is set. Without keys the app runs on built-in sample data.
- This page lists every variable by area: what it does, its default, whether it is required, and the file that reads it. No real values appear here.
- Secrets are named but never shown. Put them in `.env` locally or in the Vercel / Docker environment, never in code.

---

## 1. How configuration is loaded

| Mechanism | Detail | Source |
|---|---|---|
| Backend settings class | One pydantic `Settings` class; every field maps to an environment variable of the same name, case-insensitive. Extra variables are ignored. | `backend/app/config/config.py:17-24` |
| `.env` files read | `backend/.env` and then the repo-root `.env` (the root one is what `docker-compose.yml` uses). | `backend/app/config/config.py:19` |
| Blank means unset | `NAME=` left empty (as in the `.env.example` files) is treated as "not set", so the default applies. | `backend/app/config/config.py:23` |
| Only required field | `jwt_secret` has no default and must be at least 16 characters; the server will not start without it. | `backend/app/config/config.py:40` |
| Migration-only settings | `DatabaseSettings` reads only `DATABASE_URL` and `MIGRATION_DATABASE_URL`, so Alembic and `scripts/migrate.py` run without `JWT_SECRET`. `MIGRATION_DATABASE_URL` wins when set. | `backend/app/config/config.py:210-222`, `backend/scripts/migrate.py:47`, `backend/alembic/env.py:12` |
| Cached | `get_settings()` is `lru_cache`d, so changes need a restart. | `backend/app/config/config.py:205-207` |
| Vercel mode | When `VERCEL` is set, five defaults change (see section 2.1) unless you set them explicitly. | `backend/app/config/config.py:12-14`, `backend/app/config/config.py:175-190` |
| Secrets type | Secret values use pydantic `SecretStr`; `secret_values` lists the ones masked in logs (see `docs/auth-and-security.md`). | `backend/app/config/config.py:196-202` |

Templates (names only): `backend/.env.example` (non-Docker backend), `.env.example` (root, used by Docker Compose), `frontend/.env.example`, `studio/.env.example`.

### 1.1 Which `.env` goes with which way of running

| How you run | File read | Notes |
|---|---|---|
| `npm run backend` (root) | `backend/.env` | `scripts/dev.mjs` creates `backend/.venv`, installs requirements, applies migrations, starts uvicorn on port 8000. `scripts/dev.mjs` (backend branch) |
| `npm run frontend` (root) | none required | Starts the BrandShield Vite server on 5173 and Brand Studio on 3000. |
| `docker compose up` | root `.env` | Compose passes a fixed list of variables into the containers (`docker-compose.yml:15-35`, `:77-84`). Variables not listed there (for example `GROQ_API_KEY`) are **not** forwarded to the container. |
| Vercel | Project environment variables | Same names as the backend table below. See `docs/DEPLOY_VERCEL.md`. |
| Tests | Set in `backend/tests/conftest.py` | Throwaway values; shell secrets are popped so a real key never reaches a test run (`backend/tests/conftest.py:4-19`). |

---

## 2. Backend variables

Defaults come from `backend/app/config/config.py` (line numbers below). "Req" = required.

### 2.1 Core

| Variable | Purpose | Default | Req | Where read |
|---|---|---|---|---|
| `APP_ENV` | `local`, `test` or `production`. `test` also keeps the in-process scheduler off. Also the default Sentry environment name. | `local` (Docker image sets `production`) | no | `config.py:26`, `main.py:86`, `backend/Dockerfile:22-23` |
| `LOG_LEVEL` | Root log level for the JSON logger. | `INFO` | no | `config.py:27`, `backend/app/config/logging.py:58-64` |
| `VERCEL` | Set by the Vercel platform (not by you). Switches on serverless defaults. | unset | no | `config.py:12-14`, `backend/app/db/session.py:23` |
| `PORT` | Port used by the container health check and entrypoint. | `8000` | no | `backend/Dockerfile:22-23,39`, `backend/docker-entrypoint.sh:20` |
| `FORWARDED_ALLOW_IPS` | Which proxy IPs uvicorn trusts for `X-Forwarded-For` (affects the client IP seen by rate limiters). | `127.0.0.1` | no | `backend/docker-entrypoint.sh:21` |
| `RUN_MIGRATIONS` | Container `api` role applies migrations before start unless `false`. | `true` | no | `backend/docker-entrypoint.sh:17`, `docker-compose.yml:82` |
| `INSTALL_EXTRAS` | Docker build arg: `true` installs `requirements-extra.txt` (Sentry, CLIP, etc.). | `false` | no | `backend/Dockerfile:15-17`, `docker-compose.yml:73` |

**Vercel-mode defaults** (applied only when `VERCEL` is set and the variable is not given explicitly) — `backend/app/config/config.py:181-187`:

| Setting | Value on Vercel | Why (code comment) |
|---|---|---|
| `SCAN_EXECUTOR` | `inline` | no background threads or RQ worker; the scan runs inside the request |
| `SCHEDULER_ENABLED` | `false` | no in-process loop; Vercel Cron calls `/api/cron/scan` |
| `RESPONSE_CACHE_SECONDS` | `0` | a per-instance cache would go stale across instances |
| `STORAGE_BACKEND` | `database` | the function file system is read-only (except `/tmp`) and not shared |
| `DATA_DIR` | `/tmp/brandshield` | only `/tmp` is writable |

### 2.2 Database

| Variable | Purpose | Default | Req | Where read |
|---|---|---|---|---|
| `DATABASE_URL` | SQLAlchemy URL. SQLite file for local runs; `postgresql+psycopg://...` for Postgres/Supabase. | `sqlite:///<backend>/data/scammind.db` | no | `config.py:28`, `config.py:216` |
| `MIGRATION_DATABASE_URL` | Direct or session-mode Postgres URL (port 5432) used only by Alembic / `scripts/migrate.py`, so `DATABASE_URL` can be the Supabase transaction pooler (port 6543). | unset (falls back to `DATABASE_URL`) | no | `config.py:37`, `config.py:217-222` |
| `DB_POOL_SIZE` | Postgres pool size. | `5`; `1` on Vercel | no | `backend/app/db/session.py:24` |
| `DB_MAX_OVERFLOW` | Extra connections above the pool. | `2`; `1` on Vercel | no | `backend/app/db/session.py:25` |
| `DB_POOL_RECYCLE` | Seconds before a connection is recycled. | `1800`; `300` on Vercel | no | `backend/app/db/session.py:26` |
| `DB_PRE_PING` | `1`/`true`/`yes` enables a liveness ping per checkout. | off | no | `backend/app/db/session.py:27` |
| `TEST_DATABASE_URL` | Tests only: run the suite against a throwaway Postgres database (each test engine gets a random schema). | unset | no | `backend/tests/pg_support.py:22-28`, `.github/workflows/ci.yml:92` |

Notes: a URL containing `:6543/` automatically disables server-side prepared statements (`backend/app/db/session.py:30-31`). TCP keepalives are always set for Postgres (`session.py:29`).

### 2.3 Authentication and tokens

| Variable | Purpose | Default | Req | Where read |
|---|---|---|---|---|
| `JWT_SECRET` | HMAC key that signs access and refresh tokens. Minimum 16 characters. **Secret.** | none | **yes** | `config.py:40`, `backend/app/config/security.py:35,48` |
| `JWT_ALGORITHM` | JWT signing algorithm. | `HS256` | no | `config.py:41` |
| `ACCESS_TOKEN_MINUTES` | Access token lifetime. | `15` | no | `config.py:42`, `security.py:39` |
| `REFRESH_TOKEN_DAYS` | Refresh token lifetime. | `7` | no | `config.py:43`, `security.py:43` |
| `ADMIN_EMAIL` | Email of the real administrator created at start if absent. | unset (no admin created) | no (needed to have an admin) | `config.py:45`, `backend/app/services/seed.py:14-24` |
| `ADMIN_PASSWORD` | Password for that admin. Never overwrites an existing account's password. **Secret.** | unset | no | `config.py:46`, `seed.py:16,21` |
| `ADMIN_NAME` | Display name of the admin. | `Administrator` | no | `config.py:51` |
| `LOGIN_MAX_FAILURES` | Failed logins allowed per email+IP in the window. | `5` | no | `config.py:53`, `main.py:99` |
| `LOGIN_WINDOW_SECONDS` | Length of that window. | `900` | no | `config.py:54`, `main.py:99` |
| `API_RATE_LIMIT_PER_MINUTE` | General limit for `/api/*`, per client IP and per bearer token. `0` = off. | `600` | no | `config.py:163`, `main.py:106,119-135` |

### 2.4 Demo accounts

Both demo accounts are deliberately public: their credentials are served by `GET /api/auth/demo` (`backend/app/api/auth.py:82-96`). Use throwaway passwords.

| Variable | Purpose | Default | Req | Where read |
|---|---|---|---|---|
| `DEMO_EMAIL` | Public demo account (role `analyst`). Both `DEMO_EMAIL` and `DEMO_PASSWORD` must be set. Ignored if equal to `ADMIN_EMAIL`. | unset (no demo) | no | `config.py:47`, `seed.py:27-60` |
| `DEMO_PASSWORD` | Its password; a changed value is applied at the next start. **Public by design.** | unset | no | `config.py:48`, `seed.py:52-54` |
| `DEMO_ADMIN_EMAIL` | Second public account: a guarded administrator. Must differ from `ADMIN_EMAIL` and `DEMO_EMAIL`. | unset | no | `config.py:49`, `seed.py:63-97` |
| `DEMO_ADMIN_PASSWORD` | Its password. **Public by design.** | unset | no | `config.py:50`, `seed.py:89-91` |

### 2.5 Sign-up

| Variable | Purpose | Default | Req | Where read |
|---|---|---|---|---|
| `SIGNUP_ENABLED` | Turns `POST /api/auth/register` on or off (off returns 403). | `true` | no | `config.py:57`, `backend/app/api/auth.py:107-108` |
| `SIGNUP_MAX_PER_IP_PER_HOUR` | Sign-ups per client IP per hour (in memory, per process). | `5` | no | `config.py:58`, `main.py:100` |
| `SIGNUP_MAX_PER_EMAIL_PER_HOUR` | Sign-ups per email per hour (in memory, per process). | `3` | no | `config.py:59`, `main.py:101` |

### 2.6 CORS and web

| Variable | Purpose | Default | Req | Where read |
|---|---|---|---|---|
| `CORS_ORIGINS` | Comma-separated allowed origins. No wildcard; credentials are off. | `http://localhost:5173` | no | `config.py:30,192-194`, `main.py:160-167` |
| `CORS_ORIGIN_REGEX` | Extra allowed origins as a regular expression (for example preview deployments). | unset | no | `config.py:31`, `main.py:163` |
| `RESPONSE_CACHE_SECONDS` | TTL of the short in-process cache for heavy read endpoints. `0` = off. | `15`; `0` on Vercel | no | `config.py:123`, `main.py:137-158`, `backend/app/config/response_cache.py:15-18` |

### 2.7 Uploads, imports and URL checks

| Variable | Purpose | Default | Where read |
|---|---|---|---|
| `LOGO_MAX_BYTES` | Max brand logo upload size. | `2097152` (2 MB) | `config.py:61`, `backend/app/api/brands.py:222` |
| `CANDIDATE_IMAGE_MAX_BYTES` | Max candidate image / app icon upload. | `2097152` | `config.py:84`, `backend/app/api/candidates.py:84-86` |
| `IMPORT_MAX_BYTES` | Max CSV/JSON candidate import size. | `1048576` (1 MB) | `config.py:85`, `candidates.py:63-66` |
| `IMPORT_MAX_ROWS` | Max rows per import. | `500` | `config.py:86`, `candidates.py:68-70` |
| `URL_CHECK_TIMEOUT_SECONDS` | Timeout for the SSRF-safe reachability checker. | `5.0` | `config.py:62`, `main.py:107-111` |
| `URL_CHECK_MAX_REDIRECTS` | Redirect hops followed (each re-validated). | `3` | `config.py:63`, `main.py:107-111` |
| `URL_CHECK_MAX_BYTES` | Response bytes read before stopping. | `65536` | `config.py:64`, `main.py:107-111` |

### 2.8 Scanning and collectors

| Variable | Purpose | Default | Where read |
|---|---|---|---|
| `TAVILY_API_KEY` | Tavily web-search key. Without it the Tavily collector reports `no_key`. **Secret.** | unset | `config.py:91`, `backend/app/core/collectors/selection.py:83` |
| `TAVILY_MONTHLY_BUDGET` | Credits per UTC month the app allows itself (free plan is 1000). | `900` | `config.py:92` |
| `TAVILY_MAX_QUERIES_PER_SCAN` | Max Tavily queries per scan. | `12` | `config.py:93` |
| `TAVILY_SEARCH_DEPTH` | `basic` (1 credit) or `advanced` (2). | `basic` | `config.py:94` |
| `TAVILY_MAX_RESULTS` | Results per Tavily call. | `10` | `config.py:95` |
| `SEARXNG_BASE_URL` | Optional SearXNG instance. Must be a public host unless the next flag is set. | unset | `config.py:96`, `backend/app/core/collectors/searxng.py:79-93` |
| `SEARXNG_ALLOW_PRIVATE_HOSTS` | Operator opt-in for a SearXNG on a private network. | `false` | `config.py:97`, `searxng.py:82-87` |
| `SEARXNG_MAX_QUERIES_PER_SCAN` | Max SearXNG queries per scan. | `12` | `config.py:98` |
| `ITUNES_COUNTRY` | Apple App Store country code. | `in` | `config.py:99` |
| `ITUNES_CALLS_PER_MINUTE` | Own throttle for iTunes search. | `20` | `config.py:100` |
| `ITUNES_CACHE_TTL_SECONDS` | iTunes answer cache. | `3600` | `config.py:101` |
| `ITUNES_MAX_QUERIES_PER_SCAN` | Max iTunes queries per scan. | `8` | `config.py:102` |
| `GOOGLE_PLAY_COUNTRY` | Google Play country code (needs the optional `google-play-scraper` package). | `in` | `config.py:103` |
| `GOOGLE_PLAY_MAX_QUERIES_PER_SCAN` | Max Google Play queries per scan. | `6` | `config.py:104` |
| `SOURCE_SLOW_THRESHOLD_MS` | A source slower than this is shown as "slow". | `4000` | `config.py:105` |
| `COLLECTOR_TIMEOUT_SECONDS` | Per-collector HTTP timeout. | `15.0` | `config.py:106` |
| `REACHABILITY_CHECKS_PER_SCAN` | `>0` runs SSRF-safe reachability checks of that many result URLs. | `0` (off) | `config.py:107` |
| `REDIS_URL` | Redis for the RQ scan queue. Unset means in-process thread runner. May contain a password, so treated as a **secret**. | unset | `config.py:110`, `backend/app/services/jobs.py:25-30`, `backend/app/worker.py:89-95` |
| `SCAN_EXECUTOR` | `auto` (rq if `REDIS_URL` else thread), `rq`, `thread` or `inline`. | `auto`; `inline` on Vercel | `config.py:111`, `jobs.py:25-32` |
| `SCAN_QUEUE_NAME` | RQ queue name. | `scans` | `config.py:112`, `worker.py:96` |
| `SCAN_JOB_TIMEOUT_SECONDS` | RQ job timeout. | `900` | `config.py:113`, `jobs.py:79` |
| `SCAN_STALE_MINUTES` | A queued/running scan older than this is treated as dead and failed. | `30` | `config.py:114` |
| `SCAN_PREFILTER` | Skip logo/AI steps for candidates with no name signal or keyword hit. | `true` | `config.py:115` |
| `SCAN_LOGO_FETCH` | SSRF-safe download of candidate logos/icons (live data only). | `true` | `config.py:116` |
| `SCAN_LOGO_MAX_BYTES` | Cap per downloaded candidate logo. | `2097152` | `config.py:117` |
| `SCAN_LOGO_TIMEOUT_SECONDS` | Timeout per logo download. | `5.0` | `config.py:118` |
| `SCAN_MAX_CANDIDATES` | Max candidates per scan. | `500` | `config.py:119` |
| `SCAN_MAX_LOGO_FETCHES` | Max logo downloads per scan. | `25` | `config.py:120` |
| `SCREENSHOTS_ENABLED` | Playwright screenshot hook (the package is not installed by default). | `false` | `config.py:121` |
| `IMAGE_SIMILARITY_BACKEND` | `hash`, `multihash`, `imagehash` or `clip` for logo/icon scoring. | `hash` | `config.py:81` |
| `LOGO_COMPARE_CLIP` | Look-alike Lab logo tester only: `auto` or `off`. | `auto` | `config.py:83` |
| `SEVERITY_MEDIUM_MIN` / `SEVERITY_HIGH_MIN` / `SEVERITY_CRITICAL_MIN` | Severity cut-offs (LOW below medium). Must satisfy 0 < medium < high < critical <= 100. | `40` / `70` / `85` | `config.py:166-168`, `backend/app/core/engine/risk_engine.py:46-54` |
| `GOOGLE_SAFE_BROWSING_API_KEY` | Safe Browsing Lookup v4 key. No key: reputation is "unavailable", no request is made. **Secret.** | unset | `config.py:132`, `backend/app/core/providers/safe_browsing.py:12` |
| `SAFE_BROWSING_TIMEOUT_SECONDS` | Request timeout. | `5.0` | `config.py:133` |
| `SAFE_BROWSING_DAILY_BUDGET` | Our own request cap per UTC day. | `5000` | `config.py:134` |
| `SAFE_BROWSING_MAX_URLS_PER_SCAN` | URLs sent per scan. | `100` | `config.py:135` |
| `SAFE_BROWSING_CACHE_TTL_SECONDS` | Verdict cache. | `3600` | `config.py:136` |

### 2.9 Providers and AI (scan text analysis)

Hosted text analysis is **off** by default: no candidate text leaves the server unless `SCAM_LLM_ENABLED=true` (`config.py:66-69`).

| Variable | Purpose | Default | Where read |
|---|---|---|---|
| `SCAM_LLM_ENABLED` | Master switch for hosted text analysis. | `false` | `config.py:68`, `backend/app/core/pipeline/text_analysis.py:53` |
| `SCAM_LLM_PROVIDER` | Default provider: `gemini`, `huggingface`, `local` or `off`. An admin can change it in Settings (stored in the database). | `gemini` | `config.py:69`, `backend/app/api/providers.py:50-57` |
| `GEMINI_API_KEY` | Google Gemini key (scan text, Studio chat fallback, voice fallback). **Secret.** | unset | `config.py:71`, `backend/app/core/providers/text/factory.py:31` |
| `GEMINI_MODEL` | Gemini model id for scan text analysis. | `gemini-3.5-flash-lite` | `config.py:72` |
| `HUGGINGFACE_API_TOKEN` | Hugging Face Inference token. **Secret.** | unset | `config.py:74`, `factory.py:33` |
| `HUGGINGFACE_MODEL` | Hugging Face model id. No default: unavailable until set. | unset | `config.py:75` |
| `TEXT_EMBEDDINGS_ENABLED` | Embeddings switch (also needs a model id and key). | `false` | `config.py:77`, `factory.py:38-44` |
| `GEMINI_EMBEDDING_MODEL` | Embedding model id. No default (unverified). | unset | `config.py:78` |
| `TEXT_PROVIDER_TIMEOUT_SECONDS` | Hosted provider timeout. | `10.0` | `config.py:87` |
| `TEXT_PROVIDER_MAX_RETRIES` | Retries after the first attempt (5xx/timeout only). | `2` | `config.py:88` |

### 2.10 Brand Studio AI proxy (`/api/studio/ai/*`)

Keys stay on the server; the Studio front end never sees them (`backend/app/api/studio_ai.py:1-3`, `studio/vite.config.ts:7-8`).

| Variable | Purpose | Default | Where read |
|---|---|---|---|
| `GROQ_API_KEY` | Groq chat key (primary). Without it, chat falls back to Gemini. **Secret.** | unset | `config.py:139`, `backend/app/services/studio_ai.py:94,152` |
| `POLLINATIONS_API_KEY` | Pollinations image-generation key. **Secret.** | unset | `config.py:140`, `studio_ai.py:230` |
| `STUDIO_GROQ_MODEL` | Groq model id. | `openai/gpt-oss-120b` | `config.py:141` |
| `STUDIO_IMAGE_MODEL` | Pollinations model id. | `black-forest-labs/flux.1-schnell` | `config.py:142` |
| `STUDIO_AI_RATE_PER_MINUTE` | Per-user rate limit, chat + image together (in memory). | `20` | `config.py:143`, `main.py:103` |
| `STUDIO_DAILY_TEXT_QUOTA` | Per user per UTC day, stored in `api_usage`. `0` = no limit. | `200` | `config.py:151` |
| `STUDIO_DAILY_IMAGE_QUOTA` | Same for images. | `50` | `config.py:152` |
| `STUDIO_AI_TIMEOUT_SECONDS` | Chat call timeout. | `45.0` | `config.py:153` |
| `STUDIO_IMAGE_TIMEOUT_SECONDS` | Image call timeout. | `120.0` | `config.py:154` |
| `STUDIO_AI_MAX_RETRIES` | Retries (timeouts, connection errors, 5xx). | `2` | `config.py:155` |
| `STUDIO_AI_RETRY_BACKOFF_SECONDS` | Backoff between retries. | `0.5` | `config.py:156` |
| `STUDIO_MAX_MESSAGES` / `STUDIO_MAX_CHARS` / `STUDIO_MAX_TOKENS` / `STUDIO_MAX_PROMPT_CHARS` | Request size limits. | `40` / `30000` / `4096` / `2000` | `config.py:157-160` |

### 2.11 Voice agent (`/api/voice`)

| Variable | Purpose | Default | Where read |
|---|---|---|---|
| `VOICE_GEMINI_API_KEY` | Gemini key for the voice agent; falls back to `GEMINI_API_KEY`. Simple commands work with no key. **Secret.** | unset | `config.py:145`, `backend/app/services/voice.py` |
| `VOICE_GEMINI_MODEL` | Flash model with function calling. | `gemini-3-flash-preview` | `config.py:146` |
| `VOICE_GEMINI_FALLBACK_MODEL` | Tried once if the first refuses quickly. | `gemini-flash-latest` | `config.py:147` |
| `VOICE_TIMEOUT_SECONDS` | Gemini refuses deadlines under 10 s. | `10.0` | `config.py:148` |
| `VOICE_RATE_PER_MINUTE` | Per-user limit (in memory). | `30` | `config.py:149`, `main.py:104` |
| `VOICE_THINKING_LEVEL` | `minimal`, `low`, ...; empty = model default. | `minimal` | `config.py:150` |

### 2.12 Storage

| Variable | Purpose | Default | Where read |
|---|---|---|---|
| `STORAGE_BACKEND` | `local` (files under `DATA_DIR`) or `database` (rows in `stored_files`). Any other value raises at start. | `local`; `database` on Vercel | `config.py:34`, `backend/app/core/storage.py:169-176` |
| `DATA_DIR` | Local file root (logos, candidate images, evidence, CLIP models). | `<backend>/data`; `/data` in Docker; `/tmp/brandshield` on Vercel | `config.py:29`, `backend/Dockerfile:22-23`, `docker-compose.yml:18` |

### 2.13 Scheduler and cron

| Variable | Purpose | Default | Where read |
|---|---|---|---|
| `SCHEDULER_ENABLED` | Run the in-process scheduler loop (never started when `APP_ENV=test`). Exactly one process should run it. | `true`; `false` on Vercel and for the Docker worker | `config.py:122`, `main.py:86-88`, `docker-compose.yml:83,111` |
| `SCAN_INTERVAL_MINUTES` | Overrides the Settings page schedule. `0` = off. | unset | `config.py:124` |
| `SCHEDULER_POLL_SECONDS` | How often the loop wakes. | `60` | `config.py:125`, `main.py:87` |
| `SCHEDULER_MAX_BRANDS_PER_RUN` | Most brands scanned per scheduler/cron pass. | `5` | `config.py:126` |
| `SCHEDULER_MAX_QUERIES_PER_SCAN` | Credit estimate override; defaults to `TAVILY_MAX_QUERIES_PER_SCAN`. | unset | `config.py:127` |
| `CRON_SECRET` | Bearer secret for `GET /api/cron/scan`. Unset: endpoint returns 503. **Secret.** | unset | `config.py:38`, `backend/app/api/cron.py:32-38` |

The cron schedule itself is `0 6 * * *` (daily 06:00 UTC) in `vercel.json:82-87`.

### 2.14 Observability

| Variable | Purpose | Default | Where read |
|---|---|---|---|
| `SENTRY_DSN` | Enables Sentry (needs `sentry-sdk` from `requirements-extra.txt`). **Secret.** | unset (off) | `config.py:171`, `backend/app/config/observability.py:79-102` |
| `SENTRY_ENVIRONMENT` | Environment tag. | `APP_ENV` | `config.py:172`, `observability.py:92` |
| `SENTRY_TRACES_SAMPLE_RATE` | 0.0 to 1.0 (clamped). | `0.0` | `config.py:173`, `observability.py:93` |

### 2.15 Scripts and tests (not used by the running app)

| Variable | Used by | Purpose | Source |
|---|---|---|---|
| `E2E_DB_PATH`, `E2E_DATA_DIR` | `backend/scripts/e2e_server.py` | Temp SQLite file and data dir for browser tests. Required there. | `e2e_server.py:25-26` |
| `E2E_PORT` | same | API port (default `8765`). | `e2e_server.py:87` |
| `E2E_VIEWER_EMAIL`, `E2E_VIEWER_PASSWORD` | same | Optional read-only user seeded for role tests. | `e2e_server.py:54-56` |
| `HF_HUB_DISABLE_SYMLINKS_WARNING` | CLIP loader | Set to `1` by default (Windows noise). | `backend/app/core/engine/logo_similarity.py:258` |

`backend/scripts/e2e_server.py` ignores `backend/.env` and clears third-party keys from the environment (`e2e_server.py:4-6,20-24`).

---

## 3. Frontend (BrandShield, `frontend/`)

| Variable | Purpose | Default | Req | Where read |
|---|---|---|---|---|
| `VITE_API_URL` | API origin, baked in at build time. Leave unset on Vercel's single-domain setup (relative `/api/...`). | dev: `http://127.0.0.1:8000`; production build: same origin (`''`) | no | `frontend/src/api/client.ts:23-27`, `frontend/.env.example:1-3` |
| `API_URL` (container, runtime) | nginx writes it to `/config.js` as `window.__SCAMMIND_CONFIG__.API_URL` at container start, and uses it in the CSP. Must start with `http://` or `https://` and contain no credentials, quotes or spaces. Takes precedence over `VITE_API_URL`. | `http://localhost:8000` (Dockerfile) | no | `frontend/nginx/40-runtime-config.sh:1-20`, `frontend/Dockerfile:18`, `frontend/nginx/default.conf.template:20` |
| `PUBLIC_API_URL` (compose) | Feeds both `VITE_API_URL` build arg and runtime `API_URL`. | `http://localhost:8000` | no | `docker-compose.yml:136,140` |
| `VITE_DEMO_EMAIL`, `VITE_DEMO_PASSWORD` | Optional local fallback for the "Use demo credentials" button when the server advertises none. Put only in `.env.local`; never on a public deployment. | unset | no | `frontend/src/pages/LoginPage.tsx:21-23`, `frontend/.env.example:4-6` |
| `VITE_STUDIO_URL` | Only for setups where Studio is on another origin. | `/studio/` | no | `frontend/src/utils/studio.ts:2-3` |
| `STUDIO_DEV_URL` | Dev server only: where `/studio` is proxied. | `http://127.0.0.1:3000` | no | `frontend/vite.config.ts:11` |
| `STUDIO_API_PROXY` | Dev server only: where `/api` is proxied (Studio calls relative `/api`). | `http://127.0.0.1:8000` | no | `frontend/vite.config.ts:13` |

Runtime file: `frontend/public/config.js` is an empty stub in development (`window.__SCAMMIND_CONFIG__ = {}`); in the nginx image it is replaced by the generated file (`frontend/nginx/default.conf.template:23-27`).

## 4. Brand Studio (`studio/`)

Studio needs no secrets (`studio/.env.example:1`); nothing from the environment is injected into its bundle (`studio/vite.config.ts:7-8`).

| Variable | Purpose | Default | Where read |
|---|---|---|---|
| `STUDIO_API_PROXY` | Dev server only, when Studio is opened directly on port 3000. | `http://127.0.0.1:8000` | `studio/vite.config.ts:23`, `studio/.env.example:2-3` |
| `VITE_SHIELD_URL` | Dev only: where BrandShield runs so opening Studio's port redirects there. | `http://localhost:5173` | `studio/src/main.tsx:9-12`, `studio/.env.example:5-6` |

Fixed Studio settings (not variables): Vite `base: '/studio/'`, dev/preview host `127.0.0.1`, port `3000` with `strictPort` (`studio/vite.config.ts:10,17-25`).

## 5. Playwright / end-to-end (`frontend/playwright.config.ts`)

| Variable | Purpose | Default | Source |
|---|---|---|---|
| `E2E_API_PORT` | Test API port. | `8765` | `frontend/playwright.config.ts:13` |
| `E2E_WEB_PORT` | Test BrandShield dev-server port. | `5174` | `:14` |
| `E2E_STUDIO_PORT` | Test Studio dev-server port (not 3000, to avoid a developer's own Studio). | `3100` | `:15` |
| `E2E_TMP_DIR` | Temp directory shared by main process and workers. | new temp dir | `:17-18` |
| `E2E_PYTHON` | Python used to start the backend. | `backend/.venv/...python` (CI sets `python`) | `:20`, `.github/workflows/ci.yml:162-163` |
| `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` | Throwaway admin for the run (password randomly generated if unset). | `e2e-admin@example.com` + random | `:23-24` |
| `E2E_VIEWER_EMAIL`, `E2E_VIEWER_PASSWORD` | Throwaway viewer. | `e2e-viewer@example.com` + random | `:25-26` |
| `E2E_DB_PATH` | SQLite file for the test API. | `<tmp>/e2e.sqlite` | `:27` |
| `E2E_API_URL`, `E2E_WEB_URL` | Derived from the ports above and read by specs. | derived | `:28-29` |
| `CI` | Enables list+github+html reporters and trace retention. | unset | `:38,44` |

The config also sets, for the test backend only, fixed demo-account values (`DEMO_EMAIL`, `DEMO_ADMIN_EMAIL` and their passwords) and a random `JWT_SECRET` per run (`playwright.config.ts:55-71`). These are test fixtures, not production values.

## 6. Dev-runner ports (`scripts/dev.mjs`)

| Command | Starts | Port | Source |
|---|---|---|---|
| `npm run backend` | uvicorn `app.main:create_app --factory --reload` | 8000 | `scripts/dev.mjs` (backend branch: `requireFreePorts([8000])`) |
| `npm run frontend` | Vite for BrandShield | 5173 | `scripts/dev.mjs` (`requireFreePorts([5173, 3000])`) |
| `npm run frontend` | Vite for Brand Studio | 3000 (path `/studio/`) | same |

The script exits with a message if a port is busy. Ports are fixed in the script and are not configurable by environment variable. Root `package.json:5-8` defines the two npm scripts.

## 7. Docker Compose (`docker-compose.yml`, `.env.example`)

Required (compose refuses to start without them, `${VAR:?}`): `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (`docker-compose.yml:20-23,43,59,79-80`, `.env.example:4-9`).

| Variable | Purpose | Default | Source |
|---|---|---|---|
| `POSTGRES_USER` / `POSTGRES_DB` | Database user / name. | `scammind` / `scammind` | `docker-compose.yml:20,42-44` |
| `POSTGRES_PASSWORD` | Postgres password (URL-encode special characters). **Secret.** | required | `docker-compose.yml:20,43` |
| `REDIS_PASSWORD` | Redis password, passed via `REDISCLI_AUTH` not the command line. **Secret.** | required | `docker-compose.yml:21,58-60` |
| `API_PORT` | Host port for the API (bound to 127.0.0.1). | `8000` | `docker-compose.yml:86` |
| `FRONTEND_PORT` | Host port for the frontend/nginx (bound to 127.0.0.1). | `5173` | `docker-compose.yml:142` |
| `PUBLIC_API_URL` | See section 3. | `http://localhost:8000` | `docker-compose.yml:136,140` |
| `DB_PORT`, `REDIS_PORT`, `STUDIO_PORT` | Only in `docker-compose.dev.yml`: publish Postgres, Redis and Studio on localhost. | `5432`, `6379`, `3000` | `docker-compose.dev.yml:4,7,17-20` |
| Forwarded to containers | `APP_ENV` (default `production`), `LOG_LEVEL`, `CORS_ORIGINS`, `ACCESS_TOKEN_MINUTES`, `REFRESH_TOKEN_DAYS`, `TAVILY_API_KEY`, `TAVILY_MONTHLY_BUDGET`, `SEARXNG_BASE_URL`, `GEMINI_API_KEY`, `SCAM_LLM_ENABLED`, `SENTRY_*`, `SCHEDULER_ENABLED`, `SCAN_INTERVAL_MINUTES`, `ADMIN_NAME`, `RUN_MIGRATIONS`. Fixed by compose: `DATA_DIR=/data`, `SCAN_EXECUTOR=rq`. | see file | `docker-compose.yml:15-35,77-84` |

Compose-fixed behaviour: the `api` container runs migrations and the scheduler by default; the `worker` has `SCHEDULER_ENABLED=false` (`docker-compose.yml:82-83,111`). Containers drop all capabilities and set `no-new-privileges` (`docker-compose.yml:100-103,127-130`).

Variables that exist in `backend/.env.example` but are **not** forwarded by Compose (so they only take effect on a non-Docker run unless you edit the compose file): for example `GROQ_API_KEY`, `POLLINATIONS_API_KEY`, `VOICE_*`, `DEMO_*`, `GOOGLE_SAFE_BROWSING_API_KEY`, `CRON_SECRET`, `STORAGE_BACKEND`, `SIGNUP_*` (compare `docker-compose.yml:15-35,77-84` with `backend/.env.example`).

**Needs confirmation:** the comment at `docker-compose.yml:11` says the `backend/` folder and its old compose file "belong to an older product and are not used here", while the `api` and `worker` images are built from `./backend` (`docker-compose.yml:71`). The comment looks stale; confirm and fix or remove it.

## 8. Vercel (`vercel.json`)

| Item | Value | Source |
|---|---|---|
| Services | `backend` (FastAPI, root `backend`, entrypoint `api.index:app`, `maxDuration` 300, test/data/cache folders excluded), `frontend` (Vite, root `frontend`, SPA rewrite), `studio` (Vite, root `studio`, served under `/studio`) | `vercel.json:3-43` |
| Public routing | `/api/*`, `/health`, `/health/live` go to backend; `/studio` and `/studio/*` to studio; everything else to frontend (first match wins) | `vercel.json:44-81` |
| Cron | `GET /api/cron/scan` at `0 6 * * *` | `vercel.json:82-87` |
| Headers | Security headers on every path; immutable one-year cache on `/assets/*` and `/studio/assets/*`; `no-cache` on `/config.js` | `vercel.json:88-145` (details in `docs/auth-and-security.md`) |
| Python entrypoint | `[tool.vercel] entrypoint = "api.index:app"`; dependencies are read from `requirements.txt` through `pyproject.toml` | `backend/pyproject.toml:57-59`, `backend/pyproject.toml:16-17` |

Environment variables for the Vercel project are the backend variables above (`DATABASE_URL` = Supabase transaction pooler on port 6543, `MIGRATION_DATABASE_URL` = port 5432); see `docs/DEPLOY_VERCEL.md` for the full table. The Vercel deployment is documented there as unverified (never deployed), so treat the Vercel column of any default above as the code's intent.

## 9. Other config files

| File | Purpose | Source |
|---|---|---|
| `backend/pyproject.toml` | Packaging, pytest (`testpaths=["tests"]`, `pythonpath=["."]`), ruff (line length 140, py311, rules E F I UP B) | `backend/pyproject.toml:19-55` |
| `backend/alembic.ini`, `backend/alembic/env.py` | Alembic; URL comes from `DatabaseSettings().migration_url` | `backend/alembic/env.py:3,12` |
| `frontend/.oxlintrc.json` | oxlint plugins react, typescript, oxc; two rules | `frontend/.oxlintrc.json:1-8` |
| `frontend/tsconfig.app.json` | Strict-ish TS config (target es2023, `noUnusedLocals`, `erasableSyntaxOnly`) | `frontend/tsconfig.app.json:1-30` |
| `frontend/nginx/default.conf.template`, `studio/nginx/default.conf` | Container web servers with security headers, SPA fallback, `/studio` and `/api` proxy | see `docs/auth-and-security.md` |
| `.github/workflows/ci.yml` | CI jobs; needs no secrets (throwaway Postgres password inside the job) | `.github/workflows/ci.yml:1-3,90-93` |
