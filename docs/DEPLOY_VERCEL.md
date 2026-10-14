# Deploy BrandShield on Vercel (one project, three services, one domain)

**One Vercel project** from this GitHub repository, declared as *Vercel Services* in the **root `vercel.json`**: a `backend` service
(FastAPI, `backend/`), a `frontend` service (React + Vite, `frontend/`) and a `studio` service (Brand Studio, React + Vite,
`studio/`, served under `/studio/`) behind **one domain**. The browser only ever talks to that one origin: `/api/*` goes to the
backend, `/studio` and `/studio/*` to Brand Studio, everything else to the frontend. Because Studio is on the same origin it shares
the BrandShield login (`localStorage` keys `scammind.auth` / `scammind.user`). The database stays on Supabase. Everything here is
**additive**: with no Vercel environment present, nothing changes (Docker, CI, local runs, tests behave as before).

> **The deployment itself is UNVERIFIED.** Services are a **Beta** feature. The configuration was validated against Vercel's JSON
> schema and run with `vercel dev -L` locally (see section 7), but nobody has deployed it to Vercel yet. Follow the steps, open
> `/health`, and use the troubleshooting section if something differs.

## 1. Facts this setup relies on (read from the Vercel and Supabase docs on 2026-10-14)

### Services (Beta)
| Fact | Source |
|---|---|
| Services deploy several backends and frontends in one project with shared routing, environment variables and one domain. Each service is built separately; available on all plans (Beta). | https://vercel.com/docs/services |
| A service is **internal by default**. It gets public traffic only through a **top-level `rewrites`** rule whose `destination` is the object `{ "service": "<name>" }`. Rewrites are evaluated in order and the first match wins: specific rules first, the catch-all last. | https://vercel.com/docs/services , https://vercel.com/docs/services/routing |
| A service receives the **original request path**: `GET /api/users` reaches the backend as `/api/users`, **no prefix is stripped**. (`destination.path` only selects a route; a `request.path` transform in the service's own `routes` can change the path the code sees. Neither is used here.) | https://vercel.com/docs/services/routing |
| Routing into a service is final: if nothing inside the service matches, the service's own 404 is returned; Vercel does not fall back to other top-level rewrites. | https://vercel.com/docs/services/routing |
| Service keys: `root` (required, relative to `vercel.json`), `framework`, `runtime`, `entrypoint`, `installCommand`, `buildCommand`, `devCommand`, `ignoreCommand`, `outputDirectory`, `bindings`, `functions`, `headers`, `redirects`, `rewrites`, `routes`, `cleanUrls`, `trailingSlash`. Routing keys inside a service run only after a request entered that service. | https://vercel.com/docs/services/config-reference (the JSON schema at https://openapi.vercel.sh/vercel.json lists the same keys) |
| With `services` present, top-level `functions`, `installCommand`, `buildCommand`, `devCommand`, `ignoreCommand`, `outputDirectory` and `framework` are **not valid**: they move into the service. Public routing and URL behaviour (`rewrites`, `headers`, `redirects`) stay at the top level. | https://vercel.com/docs/services |
| Bindings: declared on the **calling** service as `{ "type": "service", "service": "<target>", "format": "url", "env": "NAME" }`; Vercel injects the target's internal URL into `NAME` for **server-side function code only** (not builds, not middleware). Only needed for service-to-service calls. | https://vercel.com/docs/services/bindings |
| `vercel dev` runs all services locally; `vercel dev -L` does it without signing in. | https://vercel.com/docs/services |
| Each service runs as Vercel Functions: "the same function limits apply to each service" (memory, maximum duration). | https://vercel.com/docs/services/pricing |
| Service names match `^[a-z]([a-z_-]*[a-z])?$` (schema). | https://openapi.vercel.sh/vercel.json |

### Platform facts (unchanged from the earlier two-project design)
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
| `VERCEL=1` is a system environment variable available at build and run time, **when "Enable access to System Environment Variables" (Project Settings, Environment Variables) is enabled**. The backend switches to its serverless defaults when `VERCEL` is present. | https://vercel.com/docs/environment-variables/system-environment-variables |
| Supabase: use the **transaction pooler (port 6543)** for serverless; set the app-side pool to 1, disable prepared statements, require SSL; use a **direct or session connection (port 5432) for migrations**. Pooler string: `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-[N]-[REGION].pooler.supabase.com:6543/postgres`; copy it from **Connect** in the dashboard; percent-encode special characters in the password. | https://supabase.com/docs/guides/database/connecting-to-postgres |

### UNVERIFIED (could not be confirmed from the docs or without deploying)

* That the deployment works at all (never deployed; Services are Beta).
* **Project settings for a services project.** One docs page says to set the project's framework to "Services" in Build and
  Deployment settings. The docs read do not say what the project **Root Directory** must be; this guide assumes the repository root
  (where `vercel.json` lives; `root` paths are "relative to `vercel.json`"). If the import screen auto-detects the services from
  `vercel.json`, leave the defaults.
* **Where `crons` live in services mode.** The docs read list `crons` only as a top-level key and do not describe cron in services
  mode. This guide keeps it at the top level (a cron path is a public path, so `/api/cron/scan` goes through the same rewrite to the
  backend). If the dashboard shows no cron job after deploying, that is the first thing to check.
* **`functions` inside the backend service**: key `api/index.py` (the file), `maxDuration` 300
  and `excludeFiles`. The docs say service `functions` use the normal syntax; whether the key must be the file or the module from
  `entrypoint` is not shown.
* **`"entrypoint": "api.index:app"`** (module:variable, the form the docs show for Python, `main:app`). The JSON schema calls the
  value an "entry file", so the file form `api/index.py` may be what is required. `[tool.vercel] entrypoint` in
  `backend/pyproject.toml` says the same thing.
* **SPA fallback in the `frontend` service.** The service-level `rewrites` entry (`/((?!assets/|.*\.[A-Za-z0-9]+$).*)` ->
  `/index.html`) uses the documented rewrite syntax and the docs say services can have their own `rewrites`; the docs do not show a
  SPA fallback for a static service, nor that real files win over the rewrite inside a service (they do in ordinary projects).
  `vercel dev -L` serves client routes, but it runs the Vite dev server, so it does not prove the production behaviour.
* **Top-level `headers` on responses that come from a service** (security headers, `Cache-Control` for `/assets/*` and `/config.js`).
  The docs say top-level headers stay top level and own public URL behaviour; they do not spell out that they apply to responses
  produced by a service. `vercel dev -L` did not show them.
* **The `studio` service.** Built on the same documented pieces as `frontend`, but not deployed. Two assumptions: (1) the service
  receives the full `/studio/...` path (the docs say no prefix is stripped) while Studio's build output (`dist/`, built with Vite
  `base: '/studio/'`) has no `studio` folder, so the service-level `rewrites` map `/studio/assets/*` and `/studio/<file.ext>` back to
  `/$1` and serve `/index.html` for client routes; whether service rewrites can point at static files like this is not shown in the
  docs; (2) the same open questions as the `frontend` SPA fallback above. If Studio assets 404 after deploying, this is the first
  place to look (alternative: build Studio with `build.outDir: dist/studio`).
* How environment variables are shared between services (the docs only say services share "environment variables"). This guide
  assumes project variables reach the backend function; the frontend needs no build-time variable.
* Service request limits and pricing beyond "same as Vercel Functions".
* The size of `/tmp` and whether it is shared between instances (the backend only uses it as scratch space).
* Maximum duration on projects **without** Fluid compute (the limits above are the Fluid ones; new projects have it on by default).
* Live behaviour of psycopg 3 with the Supabase transaction pooler. The code sets `prepare_threshold=None` for `:6543/` URLs.
* Whether cron requests carry a trusted client IP for the in-memory rate limiter (irrelevant to correctness).
* `memory`: not set in `vercel.json` (Fluid compute forbids it there). Default is 2 GB on every plan.

## 2. What is where

### The root `vercel.json`

| Key | What it does |
|---|---|
| `services.backend` | `root: backend`, `framework: fastapi`, `entrypoint: api.index:app`, and `functions` for `api/index.py` (`maxDuration` 300, `excludeFiles` for tests, scripts, `data/`, caches). Python 3.12 comes from `backend/.python-version`; the upload filter is `backend/.vercelignore`. |
| `services.frontend` | `root: frontend`, `framework: vite` (build `npm run build`, output `dist`: the defaults), and a service-level `rewrites` entry that serves `/index.html` for client-side routes (`/dashboard`, `/protect-brand`, ...) but not for `/assets/*` or anything that looks like a file (`*.js`, `*.svg`, `/config.js`). |
| `services.studio` | `root: studio`, `framework: vite`. Service-level `rewrites`: `/studio/assets/*` and `/studio/<file.ext>` map to the built file, other `/studio/...` paths serve `/index.html` (Studio's client routes). Studio needs **no environment variables and no keys**. |
| `rewrites` (top level) | In this order: `/api/(.*)` -> backend, `/health` -> backend, `/health/live` -> backend, `/studio` and `/studio/(.*)` -> studio, `/(.*)` -> frontend. |
| `crons` | `GET /api/cron/scan` daily at 06:00 UTC. It goes through the rewrite above to the backend, with the `Authorization: Bearer <CRON_SECRET>` header Vercel adds. |
| `headers` (top level) | Security headers (CSP, HSTS, `X-Frame-Options`, ...) for every path (also Studio: it only loads Google Fonts, already allowed by `style-src`/`font-src`; `connect-src 'self'` is unchanged because Studio calls the backend on the same origin), `Cache-Control: public, max-age=31536000, immutable` for `/assets/*` and `/studio/assets/*`, `no-cache` for `/config.js` (moved from `frontend/vercel.json`). |

### What is public and what is not
* **Public**: `/api/*` (every API route, including `/api/health` and `/api/cron/scan`), `/health` and `/health/live` (the two
  health routes the app serves outside `/api`; the Docker healthcheck and uptime monitors use them), Brand Studio under `/studio/`,
  and the whole frontend.
* **Not exposed on purpose**: FastAPI's `/docs`, `/redoc` and `/openapi.json`. They are not needed in production, and a request for
  them falls through to the frontend (which answers with the SPA page). To expose the API docs, add the rewrite
  `{ "source": "/(docs|openapi.json)", "destination": { "service": "backend" } }` **before** the catch-all.
* The backend is **internal apart from the paths above**: there is no rewrite for anything else.
* **Bindings: none.** No server-side code in one service calls the other. The frontend has no server code (a static build whose
  browser code calls `/api/...` on the same origin) and the backend never calls the frontend (its outgoing calls go only to
  third-party APIs: Tavily, Gemini, Safe Browsing, iTunes, Google Play, and the sites being checked). Docker hostnames (`api`, `redis`,
  nginx) only matter for `docker-compose`. A binding would only add an unused environment variable.

### Code changes for one origin
| Area | Change |
|---|---|
| `frontend/src/api/client.ts` | `BASE_URL` = runtime `/config.js` `API_URL` > `VITE_API_URL` > **`''` in a production build** (same origin, relative `/api/...`) > `http://127.0.0.1:8000` in development. Docker/nginx (`API_URL`), the two-project style (explicit `VITE_API_URL`) and local development behave as before. Covered by `baseUrl.test.ts`. |
| `backend/pyproject.toml` | Added `[build-system]` and `[project]` (dependencies read from `requirements.txt`). **Found with `vercel dev -L`**: when `pyproject.toml` exists, Vercel's Python builder installs from it and ignores `requirements.txt`; without a `[project]` table the install failed (and would otherwise have installed nothing). `[tool.vercel] entrypoint` is kept. |
| Backend routes | No change: the app already mounts everything under `/api` plus `/health` and `/health/live`, and Vercel passes the path through unchanged (no double prefix, nothing stripped). |
| CORS | No code change. With one origin the browser never makes a cross-origin call, so `CORS_ORIGINS` is only needed for local development (`http://localhost:5173`) or another host. |

### Earlier additions (unchanged)
| Area | Change |
|---|---|
| `backend/api/index.py` | Module-level ASGI `app = create_app()`; idempotent admin seed at import (never raises); never starts the scheduler thread. |
| `app/config/config.py` | Only when `VERCEL` is set: `SCAN_EXECUTOR=inline`, `SCHEDULER_ENABLED=false`, `RESPONSE_CACHE_SECONDS=0`, `STORAGE_BACKEND=database`, `DATA_DIR=/tmp/brandshield`. An explicit environment variable always wins. |
| `app/db/session.py` | Only when `VERCEL` is set: pool 1 + 1 overflow, recycle 300 s, no pre-ping. Port `:6543/` disables prepared statements. |
| `app/core/storage.py`, migration `0009_stored_files` | `FileStore` with local and database implementations; RLS enabled on `stored_files`. |
| `GET /api/cron/scan` | `Authorization: Bearer $CRON_SECRET` (503 when unset, 401 otherwise); one inline scan via `scheduler_tick`. |
| Alembic | `MIGRATION_DATABASE_URL` (optional) is used by `alembic/env.py` and `scripts/migrate.py`. |

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
(Do not put the secret in a file you commit.) Run it again after every release that adds a migration. If you skip it, the first
request fails with a 500 and `/health` shows `migration` degraded.

### 3.3 The one Vercel project
1. Vercel, **Add New... > Project**, import this GitHub repository **once**.
2. Keep the **Root Directory at the repository root** (do not set `backend` or `frontend`: the root `vercel.json` declares both
   services). If a framework preset is asked for, choose **Services** (Project Settings, Build and Deployment) when it is offered;
   leave Build/Install commands empty (they belong to the services). See the UNVERIFIED list above.
3. Settings, Environment Variables: tick **Enable access to System Environment Variables** (it provides `VERCEL=1`).
4. Add these variables (names only; Production, and Preview if you want previews to work):

| Name | Required | Value / where to find it |
|---|---|---|
| `DATABASE_URL` | yes | Supabase **transaction pooler** string, port **6543**, `postgresql+psycopg://...` |
| `MIGRATION_DATABASE_URL` | for you only | Session string, port 5432. Not read at runtime; keep it only on your computer (or here for `vercel env pull`). |
| `JWT_SECRET` | yes | Generate: `python -c "import secrets; print(secrets.token_urlsafe(48))"` (at least 16 characters) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | yes (first sign-in) | Your choice; the admin account is created at the first cold start if it does not exist. Never overwrites an existing password. |
| `APP_ENV` | recommended | `production` |
| `CRON_SECRET` | for scheduled scans | A random string of 16+ characters. Without it `/api/cron/scan` answers 503 and nothing runs. |
| `DEMO_EMAIL`, `DEMO_PASSWORD` | optional | A public demo account for the login page's **Use demo credentials** button (role analyst, never admin; `DEMO_EMAIL` must differ from `ADMIN_EMAIL`). Both are shown to every visitor on purpose: use a throwaway password and expect strangers to use that account. Leave both unset on a real production site to show no demo button. |
| `TAVILY_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_SAFE_BROWSING_API_KEY` | optional | Same meaning as in `backend/.env.example` |
| `GROQ_API_KEY`, `POLLINATIONS_API_KEY` | optional | Brand Studio AI (text and images), read by the backend only; without them the Studio AI buttons report "not configured" |
| `SCAN_INTERVAL_MINUTES` | optional | `1440` for daily (the Settings page value is used when unset) |

   **Brand Studio needs no variables and no keys.** The AI keys it uses (`GROQ_API_KEY`, `GEMINI_API_KEY`, `POLLINATIONS_API_KEY`) are
   **backend** variables: add them here, in this one project's environment, where only the backend reads them (see
   `docs/STUDIO.md` for what each one enables). They must never be given a `VITE_` prefix, which would put them in the browser build.
   Leave `VITE_STUDIO_URL` unset too (Studio is on the same origin).

   **Leave `VITE_API_URL` UNSET**: the frontend then calls relative `/api/...` on the same domain. **`CORS_ORIGINS` is not needed**
   on Vercel with one project; set it only for local development or another frontend host. Do **not** set `STORAGE_BACKEND`,
   `SCAN_EXECUTOR`, `SCHEDULER_ENABLED` or `RESPONSE_CACHE_SECONDS`, nor `VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD`.
5. **Deploy.** The URL (e.g. `https://brandshield.vercel.app`) serves both the app and the API.
6. Check `https://<your-domain>/health/live` (always 200) and `https://<your-domain>/health` (`database: ok`, `migration: ok`;
   `collectors`/`redis`/`worker` may say degraded or not_configured: expected here).

### 3.4 First sign-in
Open the domain, sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`, then follow the Setup wizard (brand, official accounts).

### 3.5 Scheduled scans
The root `vercel.json` has `{"path": "/api/cron/scan", "schedule": "0 6 * * *"}` (06:00 UTC). On **Hobby** this is the most
frequent allowed schedule (once a day; Vercel may run it any time between 06:00 and 06:59). Pro can use a shorter schedule: edit
`schedule` and redeploy. The endpoint applies the same rules as the old in-process scheduler (interval from `SCAN_INTERVAL_MINUTES`
or the Settings page, Tavily credit protection, one scan at a time) and treats a scan as due when it is at most 60 minutes early.
Cron only runs for the **production** deployment. Test by hand:
`curl -H "Authorization: Bearer <CRON_SECRET>" https://<your-domain>/api/cron/scan` returns `{"ran": ..., "skipped": ..., "reason": ...}`.

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
| 404 when refreshing `/dashboard` or `/protect-brand` | The SPA fallback in the `frontend` service did not apply. Check the root `vercel.json` is the deployed one; as a fallback change the service rewrite to `{ "source": "/(.*)", "destination": "/index.html" }` (real files still win). |
| 404 (or the app's HTML) on `/api/...` | The top-level `/api/(.*)` rewrite is missing or after the catch-all: order matters (specific first, `/(.*)` last). `/api/health` must return JSON. |
| `/docs` shows the app instead of API docs | Intended: only `/api/*`, `/health`, `/health/live` go to the backend (section 2). |
| CORS error in the console | Should not occur on one origin. It means the frontend calls another host: `VITE_API_URL` is set (unset it and redeploy) or `/config.js` has an `API_URL`. |
| Frontend calls `http://127.0.0.1:8000` | Only in a development build. A production build uses the same origin unless `VITE_API_URL` was set at build time. |
| 500 on the first request, `/health` says migration degraded or database down | Migrations were not applied (section 3.2) or `DATABASE_URL` is wrong. Run `alembic upgrade head` with `MIGRATION_DATABASE_URL`. |
| Build error `Failed to install Python dependencies` | `backend/pyproject.toml` must keep its `[project]` table (dependencies are read from `requirements.txt`). |
| `FATAL: max clients reached` / `too many connections` | `DATABASE_URL` points at the session pooler (5432) or direct connection. Use the **transaction pooler, port 6543**. |
| `prepared statement ... does not exist` | Same: the runtime must use port 6543 (the code then disables prepared statements). |
| `password authentication failed` | Special characters in the password are not percent-encoded, or the user is not `postgres.<project-ref>` for pooler strings. |
| `ModuleNotFoundError: psycopg2` | `DATABASE_URL` starts with `postgresql://`; use `postgresql+psycopg://`. |
| Sign-in fails with 401 for the admin | `ADMIN_EMAIL` / `ADMIN_PASSWORD` were added after the first cold start while the database was not reachable; redeploy, or call `/health` and check the logs. |
| 504 `FUNCTION_INVOCATION_TIMEOUT` on Scan | The scan needs more than `maxDuration` (section 4). |
| 413 on logo upload | A body over 4.5 MB reached Vercel; the app cap is 2 MB. |
| `/api/cron/scan` returns 503 | `CRON_SECRET` is not set on the project. 401: the secret differs. |
| Cron never runs / shows twice | Only the production deployment runs crons; check Project Settings, Cron Jobs; on Hobby it runs once a day within the scheduled hour. Twice: see the UNVERIFIED note about `backend/vercel.json`. |
| Logo tester says CLIP unavailable | Expected on Vercel (section 5). |

## 7. What was verified locally (and how)

* The root `vercel.json` parses and validates against `https://openapi.vercel.sh/vercel.json` (ajv; only the unrelated
  `experimentalServicesV2` sub-schema, which ajv cannot compile, was pruned; `services` itself was validated).
* A routing check applying the rewrite order to sample paths: `/api/me`, `/api/cron/scan`, `/health`, `/health/live` -> backend;
  `/dashboard`, `/protect-brand`, `/unknown`, `/docs`, `/openapi.json` -> frontend (SPA fallback or 404); `/assets/x.js`, `/config.js`,
  `/favicon.svg` -> frontend static files.
* `npx vercel@latest dev -L` (no sign-in) detected both services (`backend [FastAPI]`, `frontend [Vite]`), served them on one port,
  returned the app for `/dashboard` and `/protect-brand`, and JSON from `/api/health`, `/health/live` and `/api/cron/scan` (503 without
  `CRON_SECRET`, as designed). It is the CLI's local emulation, not the Vercel cloud: it does not prove headers, crons or the
  production rewrite engine.
* Earlier: a simulation of the Vercel runtime with `VERCEL=1` (database store, inline scan, cron endpoint 401/200), and unit tests
  for the settings defaults, cron, entrypoint import and both file stores.
