# Deploy BrandShield on Vercel (backend + frontend)

Two Vercel projects from this one GitHub repository: the **backend** (FastAPI, Root Directory `backend`) and the **frontend**
(React + Vite, Root Directory `frontend`). The database stays on Supabase. Everything here is **additive**: with no Vercel
environment present, nothing changes (Docker, CI, local runs, tests behave exactly as before).

> **The deployment itself is UNVERIFIED.** It was prepared and tested locally (a simulation of the Vercel runtime, see
> "What was verified"), but nobody has deployed it to Vercel yet. Follow the steps, open `/health`, and use the troubleshooting
> section if something differs.

## 1. Facts this setup relies on (read from the Vercel and Supabase docs on 2026-10-14)

| Fact | Source |
|---|---|
| Vercel loads a FastAPI/ASGI instance named `app` from an entrypoint; a custom module is set with `[tool.vercel] entrypoint = "module:variable"` in `pyproject.toml` (here `api.index:app`). | https://vercel.com/docs/frameworks/backend/fastapi , https://vercel.com/docs/functions/runtimes/python |
| The FastAPI app becomes a single Vercel Function; a framework preset routes every request to it. `functions` in `vercel.json` is keyed by the entrypoint file (`api/index.py`). | https://vercel.com/docs/frameworks/backend/fastapi |
| FastAPI lifespan events are supported (shutdown cleanup limited to 500 ms). We still seed the admin at import time as well (idempotent), so the app does not depend on it. | https://vercel.com/docs/frameworks/backend/fastapi |
| Python versions: 3.12 (default), 3.13, 3.14; set with `.python-version`, `pyproject.toml` `requires-python` or `Pipfile.lock`. Dependencies: `requirements.txt` is supported. | https://vercel.com/docs/functions/runtimes/python/python-version |
| Python bundle limit: **500 MB uncompressed** (250 MB for other runtimes); "Large Functions" up to 5 GB are a public beta. Python functions bundle everything reachable, no tree shaking; use `excludeFiles` (glob relative to the project root). | https://vercel.com/docs/functions/limitations , https://vercel.com/docs/functions/runtimes/python |
| Max duration (Fluid compute): **Hobby 300 s default and maximum**; Pro and Enterprise 300 s default, 800 s maximum (1800 s beta). A function that runs longer returns 504 `FUNCTION_INVOCATION_TIMEOUT`. | https://vercel.com/docs/functions/limitations |
| Memory: Hobby 2 GB / 1 vCPU; Pro 2 GB default, 4 GB / 2 vCPU maximum. With Fluid compute, memory **cannot be set in `vercel.json`** (use Project Settings, Functions). | https://vercel.com/docs/functions/limitations , https://vercel.com/docs/project-configuration/vercel-json |
| Request and response body limit: **4.5 MB** (413 `FUNCTION_PAYLOAD_TOO_LARGE`). | https://vercel.com/docs/functions/limitations |
| 1,024 file descriptors shared across concurrent executions of an instance (database connections count). | https://vercel.com/docs/functions/limitations |
| Rewrites check the filesystem first ("precedence is given to the filesystem prior to rewrites"); a regex in `source` must be wrapped in a capture group, e.g. `/((?!maintenance).*)`. Vite SPAs need a `/(.*)` -> `/index.html` rewrite for deep links. | https://vercel.com/docs/project-configuration/vercel-json , https://vercel.com/docs/frameworks/frontend/vite |
| Cron Jobs: Vercel sends an HTTP **GET** to the **production** deployment path in `crons`; with a `CRON_SECRET` project variable it sends `Authorization: Bearer <CRON_SECRET>`; no retries on failure; delivery is best effort and can duplicate or miss; redirects are not followed; timezone is UTC. | https://vercel.com/docs/cron-jobs , https://vercel.com/docs/cron-jobs/manage-cron-jobs |
| Cron on **Hobby: once per day at most**, and Vercel may fire it anywhere inside the scheduled hour (`0 6 * * *` = between 06:00 and 06:59 UTC). Pro: once per minute. Cron duration limits equal function limits. | https://vercel.com/docs/cron-jobs/usage-and-pricing , https://vercel.com/docs/cron-jobs/manage-cron-jobs |
| Monorepo: create one project per directory; set **Root Directory** per project in the import screen. | https://vercel.com/docs/monorepos |
| `VERCEL=1` is a system environment variable available at build and run time, **when "Enable access to System Environment Variables" (Project Settings, Environment Variables) is enabled**. The backend switches to its serverless defaults when `VERCEL` is present. | https://vercel.com/docs/environment-variables/system-environment-variables |
| Vite: variables must be prefixed `VITE_` to reach the browser (build time). | https://vercel.com/docs/frameworks/frontend/vite |
| Supabase: use the **transaction pooler (port 6543)** for serverless; set the app-side pool to 1, disable prepared statements, require SSL; use a **direct or session connection (port 5432) for migrations**. Pooler string: `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-[N]-[REGION].pooler.supabase.com:6543/postgres`; copy it from **Connect** in the dashboard; percent-encode special characters in the password. | https://supabase.com/docs/guides/database/connecting-to-postgres |

### UNVERIFIED (could not be confirmed from the docs or without deploying)

* That the deployment works at all (never deployed).
* That `[tool.vercel] entrypoint = "api.index:app"` is picked up when `pyproject.toml` has no `[project]` table and dependencies
  come from `requirements.txt` (the docs allow both files but do not show this combination). Fallback: rename/add a root-level
  `backend/index.py` containing `from api.index import app` (a documented entrypoint filename).
* That the rewrite regex in `frontend/vercel.json` (written in the documented capture-group form, with a `.ext$` exclusion) is
  accepted unchanged. Fallback: the documented `{ "source": "/(.*)", "destination": "/index.html" }` (files still win because the
  filesystem has precedence; only a missing asset would then return `index.html` instead of 404).
* The size of `/tmp` and whether it is shared between instances (not in the pages read; the backend only uses it as scratch space).
* Maximum duration on projects **without** Fluid compute (the limits above are the Fluid ones; new projects have it on by default).
* Live behaviour of psycopg 3 with the Supabase transaction pooler. The code sets `prepare_threshold=None` for `:6543/` URLs
  (psycopg's documented switch to disable automatic prepared statements) and the Supabase page says prepared statements must
  be disabled; no pooler was reachable in the test environment.
* Whether cron requests carry a trusted client IP for the in-memory rate limiter (irrelevant to correctness).
* `memory`: not set in `vercel.json` (Fluid compute forbids it there). Default is 2 GB on every plan.

## 2. What was added (and what did not change)

| Area | Change |
|---|---|
| `backend/api/index.py` | Module-level ASGI `app = create_app()`; idempotent admin seed at import (never raises); never starts the scheduler thread. |
| `backend/vercel.json` | Python function `api/index.py` (`maxDuration` 300 = the Hobby maximum; Pro may raise it up to 800), `excludeFiles`, and a daily cron for `/api/cron/scan`. **No rewrite**: the framework preset already sends every path to the app, and a rewrite to `/api/index` would change the path the app sees. |
| `backend/pyproject.toml` | `[tool.vercel] entrypoint = "api.index:app"` (ignored by every other tool). |
| `backend/.python-version`, `backend/.vercelignore` | Python 3.12; keeps `.venv`, `data/` (SQLite and the 336 MB CLIP cache), tests, scripts and caches out of the upload. |
| `app/config/config.py` | Only when `VERCEL` is set: `SCAN_EXECUTOR=inline`, `SCHEDULER_ENABLED=false`, `RESPONSE_CACHE_SECONDS=0`, `STORAGE_BACKEND=database`, `DATA_DIR=/tmp/brandshield`. An explicit environment variable always wins. New optional settings: `STORAGE_BACKEND`, `MIGRATION_DATABASE_URL`, `CORS_ORIGIN_REGEX`, `CRON_SECRET`. A startup log line says `Vercel mode: ...`. |
| `app/db/session.py` | Only when `VERCEL` is set: pool 1 + 1 overflow, recycle 300 s, no pre-ping (explicit `DB_*` values win). Port `:6543/` already disabled prepared statements. |
| `app/core/storage.py`, migration `0009_stored_files` | `FileStore` with `LocalFileStore` (today's behaviour, default) and `DatabaseFileStore` (table `stored_files`). Same relative paths, same traversal protection. Migration 0009 also enables row level security on PostgreSQL (no policy), so Supabase's REST API cannot read uploaded files. Note: the older tables have no RLS in the migrations. |
| `GET /api/cron/scan` | `Authorization: Bearer $CRON_SECRET` (constant-time compare; 503 when `CRON_SECRET` is unset, 401 otherwise). Reuses `scheduler_tick` / `decide_schedule` (interval, credit-aware stretching, "already running"), runs one inline scan, audit-logged as `scheduler`. |
| Alembic | `MIGRATION_DATABASE_URL` (optional) is used by `alembic/env.py` and `scripts/migrate.py`; otherwise `DATABASE_URL`. |
| CORS | `CORS_ORIGINS` (list) plus optional `CORS_ORIGIN_REGEX`. |
| `frontend/vercel.json`, `frontend/.env.example` | Vite build, SPA fallback, security headers, cache headers. The app already used `VITE_API_URL` when `/config.js` has no `API_URL`. |

## 3. Step by step (beginner)

### 3.1 Supabase: get two connection strings
1. Supabase dashboard, your project, **Connect**.
2. **Transaction pooler** string (port **6543**): this is `DATABASE_URL`. Change the start `postgresql://` to
   `postgresql+psycopg://` (the driver this app uses).
3. **Session pooler** string (port **5432**; or the Direct connection if your network has IPv6): this is
   `MIGRATION_DATABASE_URL`, also starting with `postgresql+psycopg://`.
4. Replace `[YOUR-PASSWORD]` and percent-encode special characters (`@` -> `%40`, `#` -> `%23`, ...).

### 3.2 Create the tables once (from your computer)
```powershell
cd backend
.\.venv\Scripts\Activate.ps1          # first time: python -m venv .venv ; pip install -r requirements.txt
$env:MIGRATION_DATABASE_URL = "<the 5432 session string>"
alembic upgrade head                   # or: python -m scripts.migrate
```
(Do not put the secret in a file you commit. `alembic upgrade head` runs migrations 0001..0009, including `stored_files`.)
Run it again after every release that adds a migration. If you skip it, the first request fails with a 500 and `/health` shows
`migration` degraded.

### 3.3 Backend project
1. Vercel, **Add New... > Project**, import this GitHub repository.
2. **Root Directory: `backend`** (Edit next to Root Directory). Framework preset: FastAPI/Python (auto-detected). Build/Install
   commands: leave empty.
3. Settings, Environment Variables: tick **Enable access to System Environment Variables** (it provides `VERCEL=1`).
4. Add these variables (names only; Production, and Preview if you want previews to work):

| Name | Required | Value / where to find it |
|---|---|---|
| `DATABASE_URL` | yes | Supabase **transaction pooler** string, port **6543**, `postgresql+psycopg://...` |
| `MIGRATION_DATABASE_URL` | for you only | Session string, port 5432. Not read at runtime; keep it here so `vercel env pull` has it, or only on your computer. |
| `JWT_SECRET` | yes | Generate: `python -c "import secrets; print(secrets.token_urlsafe(48))"` (at least 16 characters) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | yes (first sign-in) | Your choice; the admin account is created at the first cold start if it does not exist. Never overwrites an existing password. |
| `APP_ENV` | recommended | `production` |
| `CORS_ORIGINS` | yes | The frontend's production URL, e.g. `https://brandshield.vercel.app` (comma list for more; no trailing slash) |
| `CORS_ORIGIN_REGEX` | optional | Allows preview frontends, e.g. `https://.*\.vercel\.app` (matches ANY vercel.app site: use a tighter pattern such as `https://brandshield-.*-yourteam\.vercel\.app` if you can) |
| `CRON_SECRET` | for scheduled scans | A random string of 16+ characters (`python -c "import secrets; print(secrets.token_urlsafe(24))"`). Without it `/api/cron/scan` answers 503 and nothing runs. |
| `TAVILY_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_SAFE_BROWSING_API_KEY` | optional | Same meaning as in `backend/.env.example` |
| `SCAN_INTERVAL_MINUTES` | optional | `1440` for daily (the Settings page value is used when unset) |

   Do **not** set `STORAGE_BACKEND`, `SCAN_EXECUTOR`, `SCHEDULER_ENABLED` or `RESPONSE_CACHE_SECONDS`: the Vercel defaults are right.
5. **Deploy.** Note the URL, e.g. `https://brandshield-api.vercel.app`.
6. Check `https://<backend-url>/health/live` (always 200) and `https://<backend-url>/health` (`database: ok`, `migration: ok`;
   `collectors`/`redis`/`worker` may say degraded or not_configured: that is expected here). `/docs` shows the API.

### 3.4 Frontend project
1. **Add New... > Project**, import the same repository again.
2. **Root Directory: `frontend`**. Framework: Vite (also set in `frontend/vercel.json`).
3. Environment Variables: `VITE_API_URL` = the backend URL (no trailing slash). It is read at **build time**: after changing it,
   redeploy the frontend. Do not set `VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD` on a public site.
4. Deploy. Copy the frontend's production URL into the backend's `CORS_ORIGINS` and redeploy the backend.

### 3.5 First sign-in
Open the frontend URL, sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`, then follow the Setup wizard (brand, official accounts).

### 3.6 Scheduled scans
`backend/vercel.json` contains `{"path": "/api/cron/scan", "schedule": "0 6 * * *"}` (06:00 UTC). On **Hobby** this is the most
frequent allowed schedule (once a day; Vercel may run it any time between 06:00 and 06:59). Pro can use a shorter schedule, edit
`schedule` and redeploy. The endpoint applies the same rules as the old in-process scheduler (interval from `SCAN_INTERVAL_MINUTES`
or the Settings page, Tavily credit protection, one scan at a time) and, because of Hobby's up-to-an-hour jitter, treats a scan
as due when it is at most 60 minutes early. Cron only runs for the **production** deployment. Test by hand:
`curl -H "Authorization: Bearer <CRON_SECRET>" https://<backend-url>/api/cron/scan` returns `{"ran": ..., "skipped": ..., "reason": ...}`.

## 4. How scans behave here

`POST /api/scan` runs the whole scan **inside the request** (`SCAN_EXECUTOR=inline`) and answers `202` with the finished scan
(`state: done|error`). The UI already handles that: it only polls `GET /api/jobs/{id}` while the state is `queued` or `running`,
so a first answer that is already `done` skips polling (covered by a frontend test). Practical limit: the function's
`maxDuration` (300 s on Hobby, up to 800 s on Pro). **Sample scans take seconds. Live scans make several network calls**
(Tavily, iTunes, Google Play, logo downloads, Safe Browsing); with the default caps they should fit, but a slow day or a large
brand can hit 300 s, and the browser then sees a 504 while the function stops. Mitigate by lowering `TAVILY_MAX_QUERIES_PER_SCAN`,
`SCAN_MAX_CANDIDATES` or `SCAN_MAX_LOGO_FETCHES`, or by moving to Pro. A scan left `running` by a timeout is failed
automatically after `SCAN_STALE_MINUTES` (30) so a new one can start.

## 5. Limitations on Vercel

* **No CLIP model.** `requirements.txt` stays the only dependency file (no fastembed/onnx/torch; the model cache alone is 336 MB).
  The logo tester falls back to the perceptual-hash method and shows its existing hint. Scans use the hash backend anyway.
* **No background threads, no RQ worker, no Redis scan queue.** A function can be frozen once the response is sent.
* **Rate limits are in-memory per instance** (login lockout, API limit): with several warm instances the effective limit is
  per instance. `docs/SECURITY.md` explains the limiter.
* **Cold start**: the first request after idle pays Python import time plus a 1-2 s database connect (and one admin-seed query).
* **Function time limits** (section 4) and 4.5 MB request/response bodies. The logo upload cap is 2 MB, so uploads fit; CSV
  imports (cap 1 MB) fit too.
* **Region latency**: a function in `iad1` (the default) talking to a Supabase project far away pays 100-500 ms per query. Pick
  the Supabase region closest to the function region (Project Settings, Functions, Region).
* **Files live in the database** (`stored_files`): logos, candidate images and evidence snapshots count against your Supabase
  database size. Screenshots are off by default.
* **Response cache is off** (a per-instance cache would be stale on other instances), so dashboard pages do a few more queries.
* Local development, Docker and CI are unchanged (local file store, thread/RQ scans, in-process scheduler).

## 6. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Browser console: CORS error / "blocked by CORS policy" | `CORS_ORIGINS` on the **backend** must equal the frontend origin exactly (scheme + host, no path, no trailing slash). For preview URLs add `CORS_ORIGIN_REGEX`. Redeploy the backend after changing variables. |
| Frontend calls `http://127.0.0.1:8000` | `VITE_API_URL` was not set when the frontend was **built**. Set it and redeploy the frontend. |
| 404 when refreshing `/dashboard` | The SPA rewrite is missing: check `frontend/vercel.json` is in the project root (Root Directory `frontend`). |
| 500 on the first request, `/health` says migration degraded or database down | Migrations were not applied (section 3.2) or `DATABASE_URL` is wrong. Run `alembic upgrade head` with `MIGRATION_DATABASE_URL`. |
| `FATAL: max clients reached` / `too many connections` | `DATABASE_URL` points at the session pooler (5432) or direct connection. Use the **transaction pooler, port 6543**. |
| `prepared statement ... does not exist` | Same: runtime must use port 6543 (the code then disables prepared statements) or keep the default driver settings on 5432, not a mix. |
| `password authentication failed` | Special characters in the password are not percent-encoded, or the user is not `postgres.<project-ref>` for pooler strings. |
| `ModuleNotFoundError: psycopg2` | `DATABASE_URL` starts with `postgresql://`; use `postgresql+psycopg://`. |
| Sign-in fails with 401 for the admin | `ADMIN_EMAIL` / `ADMIN_PASSWORD` were added after the first cold start and the database was not reachable then; redeploy, or call `/health` and check the logs. |
| 504 `FUNCTION_INVOCATION_TIMEOUT` on Scan | The scan needs more than `maxDuration` (section 4). |
| 413 on logo upload | A body over 4.5 MB reached Vercel; the app cap is 2 MB. |
| `/api/cron/scan` returns 503 | `CRON_SECRET` is not set on the backend project. 401: the secret differs. |
| Cron never runs | Only the production deployment runs crons; check Project Settings, Cron Jobs; on Hobby it runs once a day within the scheduled hour. |
| Logo tester says CLIP unavailable | Expected on Vercel (section 5). |

## 7. What was verified locally (and how)

* A simulation of the Vercel runtime: `uvicorn api.index:app` with `VERCEL=1`, `STORAGE_BACKEND=database`, a temporary SQLite
  database (migrated with `python -m scripts.migrate`) and a temporary `DATA_DIR`: `/health`, login, create brand, upload a logo
  and fetch it back from the database store, an inline scan whose first poll is already `done`, a detection's evidence with
  `hash_verified: true`, `/api/cron/scan` without secret (401), wrong secret (401) and the right secret (200).
* Unit tests for the settings defaults, CORS regex, `MIGRATION_DATABASE_URL`, the cron endpoint, the entrypoint import, and the
  file flows against **both** stores (local and database).
* Size: the dependencies from `requirements.txt` unpack to about 99 MB (Windows wheels) and the files that would be uploaded
  from `backend/` are about 0.7 MB, against the documented 500 MB Python limit.
* Both `vercel.json` files parse as JSON and validate against `https://openapi.vercel.sh/vercel.json`.
