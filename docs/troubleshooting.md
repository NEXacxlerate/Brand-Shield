# Troubleshooting

**Plain-language summary**

* Most problems on a laptop are one of three things: another program already uses a port, the API is not running, or the database
  has not been migrated.
* Problems with AI features (Studio logos, the voice assistant) are usually a missing key, an exhausted free quota or a model name that the
  provider has retired. The messages shown in the app say which.
* If a page looks empty or fictional, check the data mode (sample or live) first.
* Each entry below gives the symptom, what the code does, and the fix. Line numbers refer to the repo as read for this document.

## Quick index

| Symptom | Section |
|---|---|
| "Port 5173, 3000 is already in use" | 1 |
| `ECONNREFUSED 127.0.0.1:8000`, "Cannot reach the server" | 2 |
| Database not ready, 500 on first request | 3 |
| Supabase "max clients" error | 4 |
| Gemini 429 / 503 / 504, "AI service is busy", retired model | 5 |
| "Logo generation is unavailable", Pollinations credits | 6 |
| "Too many requests" | 7 |
| Safe Browsing "not checked" | 8 |
| Page shows sample data / no live results | 9 |
| Sign-in loops, signed out unexpectedly | 10 |
| Microphone blocked, voice needs Chrome/Edge | 11 |
| Studio on port 3000 sends me elsewhere | 12 |
| Windows / CRLF problems | 13 |

## 1. Port already in use

| | |
|---|---|
| Message | `Port 8000 is already in use. Close the old server (or the other terminal running this app) and run the command again.` (ports listed: 8000 for backend; 5173, 3000 for frontend) |
| Cause | `scripts/dev.mjs` connects to the port on `127.0.0.1` and `::1`; any listener counts as busy (`scripts/dev.mjs:57-78`). Backend checks 8000 (`:89`), frontend checks 5173 and 3000 (`:80`). Studio and e2e also use `strictPort`, so they refuse to pick another port (`studio/vite.config.ts:16`, `frontend/playwright.config.ts:151,162`). |
| Fix | Close the earlier terminal running `npm run backend` / `npm run frontend`, or find the process: `netstat -ano | findstr :8000` then `taskkill /PID <pid> /F` (Windows). The e2e tests use 8765, 5174 and 3100 instead, which can be overridden with `E2E_API_PORT`, `E2E_WEB_PORT`, `E2E_STUDIO_PORT` (`playwright.config.ts:90-92`). |

## 2. `ECONNREFUSED 127.0.0.1:8000` / "Cannot reach the server"

| | |
|---|---|
| Cause | The Vite dev server proxies `/api` to `127.0.0.1:8000` (`frontend/vite.config.ts:13`) and the app itself calls `http://127.0.0.1:8000` in development (`frontend/src/api/client.ts:27`). If the API is not running, the proxy logs `ECONNREFUSED` and the browser shows "Cannot reach the server. Check your connection and try again." (`client.ts:29`). |
| Fix | Start the API with `npm run backend` in another terminal and wait for `API http://localhost:8000`. Check http://localhost:8000/health/live. If the API exited right after start, read its output: typically a missing `JWT_SECRET` (validation error, `backend/app/config/config.py:40`) or a failed migration (section 3). |
| Also | If `npm run frontend` is run from a different working directory than the repo root, use the root or the parent folder (both have the scripts: `package.json:5-8`). |

## 3. Database not ready / `alembic upgrade head`

| | |
|---|---|
| Symptoms | `npm run backend` prints `Database migration failed: check DATABASE_URL in backend/.env` (`scripts/dev.mjs:102-106`); the API logs `admin seed skipped: database not ready (run alembic upgrade head)` (`backend/app/main.py:81-83`); `/health` shows `migration: degraded` with note `run: alembic upgrade head` (`backend/app/services/health.py:66-80`); first request returns 500. |
| Cause | Tables are created only by migrations. In `APP_ENV=production` a missing `alembic_version` table is `degraded`; in other environments it is `unknown` (`health.py:76`). |
| Fix | From `backend/`: `.\.venv\Scripts\python -m scripts.migrate` (or `python -m alembic upgrade head`). Verify `DATABASE_URL` points at the intended database. On Vercel, run it from your computer with `MIGRATION_DATABASE_URL` (see `docs/setup-and-deployment.md` section 6). Migrations on PostgreSQL take an advisory lock so concurrent runs wait (`backend/scripts/migrate.py:32-42`). |
| SQLite locked | Writers wait up to 30 s before "database is locked" (`backend/app/db/session.py:13-14`, `PRAGMA busy_timeout=30000` at `:40`). Close other tools holding `backend/data/scammind.db` open. |
| `ModuleNotFoundError: psycopg2` | `DATABASE_URL` must start with `postgresql+psycopg://`, not `postgresql://` (`docs/DEPLOY_VERCEL.md` section 6). |

## 4. Supabase `EMAXCONNSESSION` / too many connections

| | |
|---|---|
| Cause | Supabase **session mode** pooler allows only 15 clients in total; each warm serverless instance holds its own pool (`backend/app/db/session.py:19-22`). If `DATABASE_URL` points at the session pooler (port 5432) or direct connection on Vercel, connections run out. The repo's guide describes the symptom as `FATAL: max clients reached` / `too many connections` (`docs/DEPLOY_VERCEL.md` section 6). |
| Fix | Use the **transaction pooler, port 6543** for `DATABASE_URL`; keep the session/direct string only in `MIGRATION_DATABASE_URL` (used by migrations, `backend/app/config/config.py:35-37`). On Vercel the code already shrinks the pool to 1 + 1 connections with 300 s recycle (`session.py:23-26`); `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `DB_POOL_RECYCLE` override. For `:6543/` URLs prepared statements are disabled automatically (`session.py:30-31`). A `prepared statement ... does not exist` error means port 6543 is not being used. |
| Note | **Needs confirmation:** the literal string `EMAXCONNSESSION` does not appear anywhere in the repo; it is the code Supabase returns for this condition, taken from Supabase's behaviour, not from this code. |

## 5. Gemini 429 / 503 / 504 and retired model names

The voice agent and Studio chat use Gemini, Gemini is also the optional text-analysis provider.

| Symptom | Cause in code | Fix |
|---|---|---|
| Voice reply "The AI service is busy right now. Please try again in a moment." | Gemini call raised with status 429, 503 or 504; the service returns that friendly message and logs `voice gemini call failed: <type> <code>` (`backend/app/services/voice.py:534-539`) | Wait and retry. Quota is per Google key; check `VOICE_GEMINI_API_KEY` / `GEMINI_API_KEY`. |
| Voice reply "Sorry, I didn't understand that. Try "open reports"..." for every sentence that is not a simple command | Any other failure (timeout, 404 for a retired model, unexpected answer) maps to this message (`voice.py:47,539`) | Read the API log line `voice gemini call failed:`; a code of 404 means the model name is not served any more. Set `VOICE_GEMINI_MODEL` (default `gemini-3-flash-preview`, `config.py:146`) and `VOICE_GEMINI_FALLBACK_MODEL` (default `gemini-flash-latest`, `config.py:147`) to a current Flash model that supports function calling. The fallback is tried once if the first model fails quickly (`voice.py:606-612`). |
| Voice says "I can open pages, scroll and fill fields with simple commands" only | No Gemini key configured: simple commands work, others do not (`voice.py:530-531`) | Set `VOICE_GEMINI_API_KEY` or `GEMINI_API_KEY` in `backend/.env`. |
| Voice timeout | Deadline is `VOICE_TIMEOUT_SECONDS`, default 10 and "Gemini refuses a deadline under 10 s" (`config.py:148`) | Do not set it lower than 10. |
| Studio chat "The AI service is busy right now. Wait a minute and try again." | Provider 429 maps to HTTP 429 and is never retried (`backend/app/services/studio_ai.py:76-77`, `config.py:155`) | Wait; or switch key. Studio chat uses `GROQ_API_KEY` first, else `GEMINI_API_KEY` (`studio_ai.py:154`). |
| Studio chat "...its key was rejected" | Provider 401/403 maps to 503 (`studio_ai.py:72-73`) | Correct the key on the server. |
| Studio chat "could not use this request" | Provider 400/404/413/422 maps to 422 (`studio_ai.py:78-79`); a retired `STUDIO_GROQ_MODEL` or `GEMINI_MODEL` can produce 404 | Update `STUDIO_GROQ_MODEL` (default `openai/gpt-oss-120b`) or `GEMINI_MODEL` (default `gemini-3.5-flash-lite`, `config.py:72,141`). |

## 6. Pollinations out of credits / "Logo Generator unavailable"

| | |
|---|---|
| Symptom | In Brand Studio's Logo Generator: "Logo generation is unavailable" with "Use your own logo:" (`studio/src/components/LogoGenerator.tsx:315-324`). |
| Cause | `POST /api/studio/ai/image` fails with 402 (provider out of credits, mapped to 503 "The AI service has run out of credits. Tell the administrator.", `backend/app/services/studio_ai.py:74-75`), 503 because `POLLINATIONS_API_KEY` is not set (`studio_ai.py:225-226`), or 502 (image service not answering). The browser maps these to `imageUnavailable` and a message, "...the image service (Pollinations) has run out of credits. You can upload your own logo instead" (`studio/src/lib/ai.ts:35-60`). |
| Fix | Add credit or set a valid `POLLINATIONS_API_KEY`; check `STUDIO_IMAGE_MODEL` is a model your account may use (default `black-forest-labs/flux.1-schnell`, `config.py:142`). Meanwhile upload your own logo (PNG, JPEG or WebP, max `LOGO_MAX_BYTES` 2 MB, `config.py:61`). Daily per-user quotas also apply: `STUDIO_DAILY_IMAGE_QUOTA` 50 and `STUDIO_DAILY_TEXT_QUOTA` 200 (`config.py:151-152`). |

## 7. "Too many requests"

| Message | Source and limit | Fix |
|---|---|---|
| `Too many requests. Slow down and retry shortly.` (HTTP 429, `Retry-After: 60`) | General limiter: `API_RATE_LIMIT_PER_MINUTE`, default 600, per client IP and per bearer token, in memory (`backend/app/main.py:119-135`, `config.py:163`) | Wait a minute. `0` turns it off. Behind a proxy, set `FORWARDED_ALLOW_IPS` so IPs are real (`backend/docker-entrypoint.sh:20`), otherwise all users share one IP bucket. |
| `Too many failed attempts. Try again later.` | Login: 5 failures per email+IP per 900 s (`backend/app/api/auth.py:62-70`, `config.py:53-54`) | Wait 15 minutes or restart the API (in-memory limiter). |
| `Too many sign-up attempts. Try again later.` | 5 per IP and 3 per email per hour (`auth.py:111`, `config.py:58-59`) | Wait; `SIGNUP_ENABLED=false` disables sign-up. |
| `Too many AI requests. Wait a moment and try again.` | Studio AI: 20 per user per minute (`backend/app/api/studio_ai.py:66`, `config.py:143`) | Wait 30 s. |
| `Too many voice commands. Wait a moment and try again.` | 30 per user per minute (`backend/app/api/voice.py:57`, `config.py:149`) | Wait 20 s. |

## 8. Safe Browsing is not called ("not checked")

By design Safe Browsing is skipped when:

| Case | Evidence |
|---|---|
| Data is **sample**: the note is "Sample data: the URL is not sent to Google." | `backend/app/core/pipeline/scan_pipeline.py:457-460` |
| The candidate is a cached copy (`stale`) | `scan_pipeline.py:461-463` |
| The domain does not resemble the brand ("so it was not sent for a reputation check") | `scan_pipeline.py:465-467` |
| More than `SAFE_BROWSING_MAX_URLS_PER_SCAN` (100) URLs in one scan | `scan_pipeline.py:468-470`, `config.py:135` |
| No `GOOGLE_SAFE_BROWSING_API_KEY`: the adapter makes no request and the verdict is `unknown`/`unavailable`, which the engine never treats as clean | `backend/app/core/providers/safe_browsing.py:1-14`, `scan_pipeline.py:632` |
| Daily budget used (`SAFE_BROWSING_DAILY_BUDGET`, 5000 per UTC day) | `safe_browsing.py:16-17`, `config.py:134` |

Fix: set the key in `backend/.env`, switch to live data (section 9), and scan a brand with look-alike domains. Terms: Safe Browsing is for
non-commercial use (`safe_browsing.py:14-15`).

## 9. Data mode: sample vs live

| Fact | Source |
|---|---|
| Modes are `live`, `sample`, `auto`; default `auto` | `backend/app/services/data_mode.py:9-11` |
| `auto` is live only if `TAVILY_API_KEY`, `SEARXNG_BASE_URL` or the google-play package is configured; iTunes alone does not switch it | `backend/app/core/collectors/selection.py:77-97` |
| In sample mode the pages show a "Sample data" badge and nothing contacts a real platform | `selection.py:99-100` |
| Only admins change the mode (Settings > Account); the guarded demo admin can only select `sample` | `backend/app/api/settings.py:130-136,181-182` |
| Sample-mode candidate URLs are never sent to Safe Browsing | section 8 |
| Source health reasons such as `no_key`, `invalid_key`, `rate_limited` are shown on the Source Health page (admin) | `backend/app/core/collectors/tavily.py:114,209,216` |

If you expected live data: add `TAVILY_API_KEY`, restart the API, open Settings and choose Live or Auto, check Source Health for reasons, then
run `python -m scripts.live_check` from `backend/` (costs one credit, see `docs/COLLECTORS.md`).

## 10. Sign-in loops and unexpected sign-out

| Cause | Detail | Fix |
|---|---|---|
| `JWT_SECRET` changed or differs between instances | existing tokens fail to decode, refresh returns 401, the client clears the session and goes to `/login` (`backend/app/api/auth.py:127-134`, `frontend/src/api/client.ts:255,293-294`) | Keep one stable `JWT_SECRET`; sign in again. |
| Two tabs refresh at the same moment | refresh tokens rotate; presenting a rotated token again revokes all of that user's refresh tokens, so both tabs are signed out (`auth.py:136-141`) | Sign in again; avoid hammering one session from several tabs after the access token (15 min) expires. |
| Account disabled | `user.active` false is refused on login and refresh (`auth.py:70,143`) | Re-enable the user (admin). |
| Visiting Studio signed out | Studio redirects to `/login?next=/studio/`, and after sign-in the `next` value is honoured only if it starts with `/studio/` (`studio/src/lib/session.ts:71-76`, `frontend/src/utils/studio.ts:14-17`, `frontend/src/pages/LoginPage.tsx:51-52`) | Sign in on the BrandShield origin. |
| Different origin for Studio | the session lives in `localStorage` keys `scammind.auth` and `scammind.user` which are per origin (`client.ts:57-58`, `studio/src/lib/session.ts:2-3`) | Serve both apps on one origin (the Vite proxy, nginx or `vercel.json` do this). |
| Browser blocks storage | session cannot persist (`studio/src/lib/session.ts:35-38`) | Allow site storage / leave private mode. |
| Admin-only page redirects to the dashboard | `RequireAdmin` sends non-admins away (`frontend/src/App.tsx:39-54`) | Sign in as an admin; analysts and viewers cannot open `/sources`, `/settings`, `/evaluation`. |

## 11. Microphone blocked / voice needs Chrome or Edge

| Symptom | Source | Fix |
|---|---|---|
| "Microphone access was blocked. Allow it in the browser address bar, then try again." | `frontend/src/hooks/useVoiceAgent.ts:326-327` (`not-allowed` / `service-not-allowed`) | Click the lock icon in the address bar, allow Microphone for this site, press the voice button again. The microphone is requested only after you switch the agent on (`:342`). |
| "Voice commands need Chrome or Edge on a computer or Android phone." | `useVoiceAgent.ts:42-43,376`: the browser must provide `SpeechRecognition` or `webkitSpeechRecognition` | Use Chrome or Edge. |
| "The microphone stopped unexpectedly. Press the button to try again." | `useVoiceAgent.ts:328` | Press the button again. |
| Microphone blocked on a deployed site even after allowing | An older `Permissions-Policy: microphone=()` header disables the microphone for the page. It is now `microphone=(self)` in `vercel.json:106` and `frontend/nginx/default.conf.template:17`; the standalone Studio nginx (`studio/`) still sends `microphone=()` | Redeploy so the new header is served; check the response header in the browser dev tools. Not verified on a deployed build. |

## 12. Studio redirects when opened on port 3000

Brand Studio's dev server on port 3000 has no BrandShield login; the session lives on port 5173's origin. Opening `http://localhost:3000` now
redirects to `http://localhost:5173/studio/` (`studio/src/lib/devRedirect.ts:16-21`). Always use **http://localhost:5173** (Studio is at
`/studio/`). If the redirect does not happen, check you are on `localhost` or `127.0.0.1` and port exactly 3000. In Docker, port 3000 is
only published by the dev overlay (`docker-compose.dev.yml:18-19`); use `http://localhost:5173/studio/` for the shared login. If 5173 shows
"Bad gateway" for `/studio/` the Studio dev server is not running: `npm run frontend` starts both (`scripts/dev.mjs:87-88`).

## 13. Windows and CRLF issues

| Symptom | Cause | Fix |
|---|---|---|
| Container fails with `exec ... no such file or directory` for `docker-entrypoint.sh` | CRLF line endings on a shell script | `.gitattributes` forces LF for `*.sh`, `Dockerfile`, `*.conf`, `*.template` (`.gitattributes:2-5`) and the Dockerfile also strips `\r` (`backend/Dockerfile:34`). Re-checkout after changing `core.autocrlf`; keep `.gitattributes`. |
| `python` not found by `npm run backend` | the script uses `python` on Windows and `python3` elsewhere when no `.venv` exists (`scripts/dev.mjs:92`) | Install Python 3.11+ and add it to PATH, or create `backend/.venv` yourself. |
| Child process lingers after Ctrl+C | dev script kills the process tree with `taskkill /T /F` on Windows (`scripts/dev.mjs:39`) | Check Task Manager for leftover `python.exe` / `node.exe` if a port stays busy. |
| `npm run frontend` slow on first start | installs packages in `frontend/` and `studio/` (`scripts/dev.mjs:50-56`) | Wait. |
| `copy backend\.env.example backend\.env` complains | PowerShell vs bash syntax | In bash use `cp backend/.env.example backend/.env`. |
| Case-insensitive file systems | only a documentation concern: `docs/` already has `USER_GUIDE.md` and similar names in capitals | Do not create files that differ only by case. |

## 14. Docker specifics

| Symptom | Cause | Fix |
|---|---|---|
| `docker compose up` stops with "Set POSTGRES_PASSWORD in .env" | required variables use `${VAR:?...}` (`docker-compose.yml:20-23,43,79-80`) | Fill the five required values in the root `.env`. |
| Worker shows unhealthy | The healthcheck used to import a module that does not exist (`app.core.config`); it now imports `app.config.config` (`docker-compose.yml:122`). Otherwise Redis is down or the worker is not registered (`backend/app/services/health.py:99`) | Run `docker compose ps` and `docker compose logs worker`; check `REDIS_URL`. Not verified by running Docker. |
| Password with special characters breaks the database URL | compose embeds passwords in URLs (`docker-compose.yml:19-21`) | Use hex passwords, e.g. `python -c "import secrets; print(secrets.token_hex(24))"`. |
| Frontend container exits: `API_URL must start with http:// or https://` | `frontend/nginx/40-runtime-config.sh:10-17` | Set `PUBLIC_API_URL` to a full origin without credentials or quotes. |
