# BrandShield API reference

## Plain-language summary

BrandShield's backend is a web service that the website (and the Brand Studio tool) talk to. Everything a person can do on screen,
such as signing in, registering a brand, running a scan, reviewing a suspected fake account or downloading a report, is one call to
an address (an "endpoint") listed on this page. Each endpoint says who may call it (anyone, any signed-in user, only analysts and
admins, or only admins), what to send, and what comes back. Mistakes always come back in one predictable shape, and heavy read-only
pages are briefly remembered (cached) so the app feels fast. This page is written from the code, not from older docs: where the code
was unclear, a line starting `**Needs confirmation:**` says so.

Companion files: `docs/API.md` (older, long narrative reference, may be outdated), `docs/data-model.md` (tables and migrations).
All paths below are relative to the repo root; `backend/app/api/X.py:N` means line N of that file.

---

## 1. Conventions

### 1.1 Registration and prefixes

The app is built in `backend/app/main.py:50-184`. All routers are mounted under the prefix `/api` (`main.py:170-181`), except the
health router, which is mounted at the root and declares its own `/health...` and `/api/health...` paths (`main.py:182`,
`backend/app/api/health.py:22-43`).

| Router module | Prefix inside `/api` | Source |
|---|---|---|
| `auth` | (none; paths start `/auth`, plus `/me`) | `backend/app/api/auth.py` |
| `brands` | `/brands` | `backend/app/api/brands.py:48` |
| `audit` | (none; `/audit`) | `backend/app/api/audit.py` |
| `cron` | `/cron` | `backend/app/api/cron.py:20` |
| `sources` | (none; `/sources`, `/settings/data-mode`) | `backend/app/api/sources.py` |
| `scans` | (none; `/scan`, `/scans`, `/jobs`) | `backend/app/api/scans.py` |
| `detections` | `/detections` | `backend/app/api/detections.py:16` |
| `dashboard` | (none; `/dashboard`) | `backend/app/api/dashboard.py` |
| `lookalike` | `/lookalike` | `backend/app/api/lookalike.py:126` |
| `settings` | `/settings` | `backend/app/api/settings.py:21` |
| `reports` | `/reports` | `backend/app/api/reports.py:19` |
| `evaluation` | `/evaluation` | `backend/app/api/evaluation.py:20` |
| `candidates` (+ `images`) | `/candidates`, `/candidate-images` | `backend/app/api/candidates.py:23-24` |
| `providers` | `/providers` | `backend/app/api/providers.py:20` |
| `studio` | `/studio` | `backend/app/api/studio.py:29` |
| `studio_ai` | `/studio/ai` | `backend/app/api/studio_ai.py:27` |
| `voice` | (none; `/voice`) | `backend/app/api/voice.py` |
| `health` | root (own paths) | `backend/app/api/health.py` |

### 1.2 Authentication and roles

* Sign-in gives a short-lived access token (JWT, `ACCESS_TOKEN_MINUTES`, default 15) and a rotating refresh token
  (`REFRESH_TOKEN_DAYS`, default 7) (`backend/app/config/config.py:41-43`, `backend/app/config/security.py:26-43`).
* Send the access token as `Authorization: Bearer <access_token>`. A missing header gives `401 Not authenticated`; a bad, expired or
  wrong-type token, or an inactive user, gives `401 Invalid or expired token`; both carry `WWW-Authenticate: Bearer`
  (`backend/app/config/deps.py:28-43`).
* Roles are `admin`, `analyst`, `viewer` (`backend/app/models/user.py:17`). The guards are in `backend/app/config/deps.py:46-57`:

| Label used on this page | Guard | Who may call | Failure |
|---|---|---|---|
| public | none | anyone | n/a |
| any signed-in | `get_current_user` | admin, analyst, viewer | 401 |
| writer | `require_writer` = `require_roles("admin","analyst")` | analyst and admin (viewers are read-only) | 403 `You do not have permission to do this` |
| admin | `require_admin` | admin only | 403 |
| cron secret | `Authorization: Bearer <CRON_SECRET>` | the scheduler only | 401 / 503 |

* The shared **demo administrator** (see `GET /api/auth/demo`) is an admin that is blocked from global changes with
  `403 Disabled for the shared demo administrator: ...` (`backend/app/services/seed.py:113-116`).

### 1.3 Brand ownership (multi-tenant rule)

Every brand belongs to one account (`brands.owner_id`). Any endpoint that takes a `brand_id`, or an object belonging to a brand
(detection, scan, report, image, test case) answers **404** (never 403) when the object is not the caller's own, so existence does not
leak (`backend/app/api/common.py:22-58`). Even admins only see their own brands. When `brand_id` is optional (most endpoints) it
defaults to the account's *active* brand: the one chosen with `POST /api/brands/{id}/select`, else the oldest non-archived one
(`backend/app/api/common.py:30-50`); with none, `404 No brand profile yet. Create one first.`

### 1.4 Error format

Defined in `backend/app/config/errors.py:1-32`. Every error body has a `detail`:

| Status | Body | Notes |
|---|---|---|
| any `HTTPException` | `{"detail": "<message>"}` | `errors.py:17-20` |
| 422 validation | `{"detail": [{"loc": ["body","email"], "msg": "...", "type": "..."}]}` | `Value error, ` prefix is removed (`errors.py:12-13, 22-27`) |
| 500 | `{"detail": "Internal server error"}` | details are logged, never returned (`errors.py:29-32`) |
| 429 (general limiter) | `{"detail": "Too many requests. Slow down and retry shortly."}` + `Retry-After: 60` | `main.py:132-134` |

A few 409 bodies carry extra fields: a second scan returns `job_id`, `scan_id`, `scan` (`backend/app/api/scans.py:41-43`); a paid
source retry without `confirm=true` returns `code: "confirmation_required"`, `estimated_credits`, `provider`, `credits_remaining`
(`backend/app/api/sources.py:209-214`).

Example (real validation error shape, from `RegisterRequest` password rules, `backend/app/schemas/auth.py:30-42, 66-71`):

```json
{"detail": [{"loc": ["body"], "msg": "That password is too easy to guess. Choose a longer or less common one.", "type": "value_error"}]}
```

### 1.5 Rate limits

| Limiter | Default | Scope | Response | Source |
|---|---|---|---|---|
| General API | `API_RATE_LIMIT_PER_MINUTE` = 600 (0 = off) | every `/api/*` request except `OPTIONS`; counted per client IP **and** per hash of the `Authorization` header | 429, `Retry-After: 60` | `config.py:163`, `main.py:119-135` |
| Login failures | 5 failures per 900 s | key `email|ip`; only failed logins count; reset on success | 429 `Too many failed attempts. Try again later.` | `config.py:53-54`, `auth.py:63-66` |
| Sign-up per IP | 5 per hour | IP | 429 `Too many sign-up attempts. Try again later.` | `config.py:58`, `auth.py:107-110` |
| Sign-up per email | 3 per hour | email | same 429 | `config.py:59` |
| Studio AI | 20 per minute (chat + image together) | per user | 429 + `Retry-After: 30` | `config.py:143`, `studio_ai.py:63-68` |
| Studio AI daily quota | 200 text / 50 image per UTC day (0 = no limit) | per user, kept in `api_usage` | 429 `You have used today's text AI allowance (200). It resets at midnight UTC.` | `config.py:151-152`, `studio_ai.py:67-68` |
| Voice | 30 per minute | per user | 429 + `Retry-After: 20` | `config.py:149`, `voice.py:55-56` |

All limiters are in memory and per process (`backend/app/config/ratelimit.py:35-37`): with several workers each counts separately.
The rate-limit middleware only exempts paths that do not start with `/api`, so `/health` and `/health/live` are exempt but
`/api/health` is **not**, even though the comment at `main.py:121` says "/health* ... exempt" (`main.py:124`).

### 1.6 Response cache

`backend/app/config/response_cache.py` and `backend/app/main.py:137-158`.

* Only `GET` requests whose exact path is in `CACHEABLE` are cached, and only `200` answers (`response_cache.py:15-18`, `main.py:143-154`):

  `/api/dashboard`, `/api/sources`, `/api/settings`, `/api/detections`, `/api/detections/excluded`, `/api/detections/false-positives`,
  `/api/brands`, `/api/reports`, `/api/lookalike/test-cases`, `/api/scans`, `/api/scans/latest`, `/api/providers`.

  Paths with ids (for example `/api/brands/5`, `/api/detections/12`) are never cached.
* Key = (path, query string, SHA-256 of the `Authorization` header), so each sign-in has its own entries (`response_cache.py:24-25`).
* TTL `RESPONSE_CACHE_SECONDS`, default 15; `0` disables it (`config.py:123`). On Vercel the default becomes 0 (`config.py:184`).
* A hit returns the stored body with the header `X-Cache: hit` (`main.py:147`).
* Any non-`GET/HEAD/OPTIONS` request clears the whole cache (`main.py:155-158`), and so does a scan starting or finishing
  (`backend/app/core/pipeline/scan_pipeline.py:140`). Max 400 entries, then it is cleared (`response_cache.py:19, 38-39`).
* Because `cache_reads` is registered after `rate_limit`, it wraps it (Starlette runs the last-added middleware outermost): a cache
  hit is served **before** the rate limiter and **before** the token is validated, for up to the TTL, but only to a caller that
  presents byte-identical `Authorization` text to one that already got a 200.

**Needs confirmation:** whether serving a hit without
  re-validating an expired token is intended; the tests (`backend/tests/api/test_response_cache.py:43-50`) only cover "no token and wrong token are not served".

### 1.7 Pagination and filtering conventions

Offset paging with `limit` and `offset` query parameters; lists return `total` (count before paging) and `items`.

| Endpoint | `limit` default (range) | `offset` | Extra echo in response |
|---|---|---|---|
| `GET /api/detections` | 50 (1-200) | yes | `limit`, `offset` echoed |
| `GET /api/audit` | 50 (1-200) | yes | `total`, `items` |
| `GET /api/scans` | 20 (1-100) | yes | `total`, `items` only |
| `GET /api/reports` | 10 (1-100) | yes | `total`, `items` only |
| `GET /api/studio/items` | 100 (1-500) | yes | `limit`, `offset` echoed |

Not paged (whole list returned): `/api/brands`, accounts, apps, `/api/detections/excluded`, `/api/detections/false-positives`,
`/api/lookalike/test-cases`, `/api/sources`.

Other conventions: timestamps are ISO-8601 UTC with a trailing `Z` (`backend/app/config/time.py:16-20`); the date filters are
spelled `from` / `to` (the Python parameter is `from_`, aliased); `source=live|sample|all` selects the data mode, defaulting to the
current effective mode (`backend/app/api/detections.py:52-56`); a request body that is optional can be omitted entirely.

---

## 2. Auth (`backend/app/api/auth.py`)

Schemas: `backend/app/schemas/auth.py`. `UserOut = {id, name, email, role, active, default_brand_id}` (`auth.py` schema 78-85);
`TokenResponse = {access_token, refresh_token, token_type:"bearer", expires_in (seconds), user}` (`88-93`);
`OkResponse = {ok: true, detail: ""}` (`96-98`).

| Method | Path | Auth | Request | Success | Errors | Code |
|---|---|---|---|---|---|---|
| POST | `/api/auth/login` | public | body `LoginRequest {email: EmailStr, password: 1-256 chars, <=72 bytes}` | 200 `TokenResponse` | 401 `Incorrect email or password` (also inactive user); 429 too many failures; 422 | `auth.py:56` |
| GET | `/api/auth/demo` | **public** | none | 200 see below, `Cache-Control: no-store` | none | `auth.py:82` |
| POST | `/api/auth/register` | public | body `RegisterRequest {name 1-80 chars after cleanup, email (lower-cased, <=254), password}` | 201 `TokenResponse` (new user has role `analyst`) | 403 `Sign-up is disabled`; 409 `An account with this email already exists.`; 429; 422 password rules | `auth.py:99` |
| POST | `/api/auth/refresh` | public (refresh token in body) | body `RefreshRequest {refresh_token: min 10 chars}` | 200 new `TokenResponse`; old refresh token is revoked (rotation) | 401 `Invalid or expired refresh token` | `auth.py:148` |
| POST | `/api/auth/logout` | public (refresh token in body) | body `RefreshRequest` | 200 `OkResponse`; always 200, even for an already-invalid token | none | `auth.py:159` |
| GET | `/api/me` and `/api/auth/me` | any signed-in | none | 200 `UserOut` (`default_brand_id` = the active brand) | 401 | `auth.py:173-174` |

Details worth knowing:

* Password rules for sign-up: at least 10 characters, at most 72 bytes, not in a built-in list of trivial passwords, not all digits,
  at least 5 distinct characters, not equal to the name, the email or its local part (`backend/app/schemas/auth.py:27-42`).
* Refresh-token reuse: presenting an already-rotated token revokes **all** of that user's refresh tokens (`auth.py:132-140`).
* Login timing is equalised for unknown emails with a dummy hash (`auth.py:26`, `auth.py:69`).
* Every login attempt (success, failure) and sign-up is written to the audit log (`auth.py:72, 77, 122`).

### GET /api/auth/demo (recent addition)

Deliberately public: it feeds the login page's demo buttons (`auth.py:82-96`). Behaviour (`auth.py:83-96`,
`backend/app/services/seed.py:27-31, 100-105`):

* If `DEMO_EMAIL` and `DEMO_PASSWORD` are set (and the email differs from `ADMIN_EMAIL`), it returns the shared analyst demo credentials.
* If `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` are set **and** that account really exists, is an active admin and the password verifies,
  it also returns the guarded demo administrator.
* The real admin is never advertised.

Response shapes taken from `backend/tests/api/test_demo_admin.py:30-39`:

```json
{"enabled": false, "admin_enabled": false}
```
```json
{"enabled": false, "admin_enabled": true, "admin": {"email": "<DEMO_ADMIN_EMAIL>", "password": "<DEMO_ADMIN_PASSWORD>"}}
```
With the analyst demo on, `enabled` is `true` and `email` / `password` are present.

### Example (auth group)

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "<password>"}'
```
```json
{
  "access_token": "<jwt>",
  "refresh_token": "<jwt>",
  "token_type": "bearer",
  "expires_in": 900,
  "user": {"id": 1, "name": "Administrator", "email": "admin@example.com", "role": "admin", "active": true, "default_brand_id": null}
}
```
(`expires_in` = `ACCESS_TOKEN_MINUTES * 60`, `auth.py:51`; `name` default `ADMIN_NAME` = "Administrator", `config.py:51`.)

```bash
curl -X POST http://localhost:8000/api/auth/register -H "Content-Type: application/json" \
  -d '{"name": "Una Studio", "email": "una@example.com", "password": "<10+ char password>"}'
# -> 201, same TokenResponse shape, user.role == "analyst"   (backend/tests/api/test_studio_items.py:16)
curl http://localhost:8000/api/me -H "Authorization: Bearer <access_token>"
```

---

## 3. Brands (`backend/app/api/brands.py`)

Schemas: `backend/app/schemas/brand.py`. `BrandSummary = {id, name, active: bool}` (`schema/brand.py:273-276`). Limit: at most
`MAX_BRANDS_PER_ACCOUNT = 10` non-archived brands per account (`brands.py:46`).

| Method | Path | Auth | Request | Success | Errors | Code |
|---|---|---|---|---|---|---|
| GET | `/api/brands` | any signed-in | none | 200 `list[BrandSummary]` (own, non-archived brands, oldest first; `active` marks the current one) | | `brands.py:124` |
| **POST** | **`/api/brands/{brand_id}/select`** | any signed-in | path `brand_id` | 200 `BrandSummary` with `active: true`; stores `users.active_brand_id` | 404 not yours / archived | `brands.py:132` |
| POST | `/api/brands` | writer | body `BrandIdentity` | 201 `BrandOut`; the new brand becomes the active brand | 409 cap of 10; 422 | `brands.py:142` |
| GET | `/api/brands/{brand_id}` | any signed-in | | 200 `BrandOut` | 404 | `brands.py:157` |
| PUT | `/api/brands/{brand_id}` | writer | body `BrandIdentity` | 200 `BrandOut` (+ `refresh` object if identity changed) | 404, 422 | `brands.py:165` |
| POST | `/api/brands/{brand_id}/logo` | writer | multipart `file` (<= `LOGO_MAX_BYTES`, 2 MB) | 200 `LogoOut` | `LogoError` status (415/413/422 per validator), 404 | `brands.py:210` |
| GET | `/api/brands/{brand_id}/logo` | any signed-in | | 200 image bytes (`ETag`, `X-Content-Type-Options: nosniff`) | 404 `No logo uploaded` / `Logo file is missing` | `brands.py:242` |
| GET | `/api/brands/{brand_id}/accounts` | any signed-in | | 200 `AccountList {total, items}` | 404 | `brands.py:262` |
| POST | `/api/brands/{brand_id}/accounts` | writer | body `AccountCreate {platform, handle}` | 201 `AccountOut` (+ `warning` if the URL check failed) | 409 duplicate; 422 | `brands.py:268` |
| DELETE | `/api/brands/{brand_id}/accounts/{account_id}` | writer | | 200 `OkResponse` | 404 | `brands.py:313` |
| GET | `/api/brands/{brand_id}/apps` | any signed-in | | 200 `AppList {total, items}` | 404 | `brands.py:331` |
| POST | `/api/brands/{brand_id}/apps` | writer | body `AppCreate` | 201 `AppOut`; the same package on another store merges stores instead of 409 | 409 `... is already an official app`; 422 | `brands.py:337` |
| PATCH | `/api/brands/{brand_id}/apps/{app_id}` | writer | body `AppUpdate {apple_app_id}` | 200 `AppOut` | 404, 422 | `brands.py:381` |
| DELETE | `/api/brands/{brand_id}/apps/{app_id}` | writer | | 200 `OkResponse` | 404 | `brands.py:401` |
| DELETE | `/api/brands/{brand_id}` | **admin** | query `confirm` = exact brand name | 200 `OkResponse`; soft delete (`archived_at`) | 409 `Type the exact brand name in \`confirm\` to archive it` | `brands.py:419` |
| POST | `/api/brands/{brand_id}/restore` | **admin** | | 200 `BrandOut` | 409 cap of 10 | `brands.py:433` |
| POST | `/api/brands/{brand_id}/logos` | writer | multipart `file`, query `label` | 201 `ExtraLogoOut` | 409 `This logo is already registered`; 422 `At most 10 extra logos` | `brands.py:449` |
| GET | `/api/brands/{brand_id}/logos/{logo_id}/file` | any signed-in | | 200 image bytes | 404 `Logo not found` | `brands.py:475` |
| DELETE | `/api/brands/{brand_id}/logos/{logo_id}` | writer | | 200 `OkResponse` | 404 | `brands.py:486` |
| POST | `/api/brands/{brand_id}/publishers` | writer | body `PublisherCreate {store: google_play\|app_store\|any, name<=120, publisher_id<=120}` (needs name or id) | 201 `PublisherOut` | 409 duplicate; 422 | `brands.py:502` |
| DELETE | `/api/brands/{brand_id}/publishers/{publisher_id}` | writer | | 200 `OkResponse` (also drops its verification) | 404 | `brands.py:516` |
| PUT | `/api/brands/{brand_id}/verification` | writer | body `VerificationIn {asset_type: domain\|account\|app\|publisher\|logo, asset_key, status: unverified\|verified, method, note<=300}` | 200 `VerificationOut` | 404 `No such <type> is registered for this brand`; 422 (verified needs a `method` from `dns_txt, website_link, store_listing, platform_badge, manual_review, other`) | `brands.py:547` |

`BrandIdentity` request body (`schema/brand.py:7-38`): `name` (1-120, required), `industry` (<=120), `aliases`, `keywords`, `domains`
(each list <= 200 items; domains are normalised and deduplicated, max 50 after cleanup), `description` (<=2000, optional).
`PUT` leaves `description` untouched when the field is omitted (`brands.py:176-177`).

`BrandOut` fields (`schema/brand.py:250-270`): `id, name, description, archived, extra_logos[], publishers[], verifications[], industry, aliases,
keywords, domains, logo (LogoOut|null), official_accounts[], official_apps[], profile_health {percent, message, checks[], missing[]},
allowlist {accounts, apps, domains}, official_assets, updated_at, source, refresh`.

Identity changes (`name`, `aliases`, `keywords`, `domains`) retire earlier detections and rebuild the Look-alike Lab's built-in cases;
in sample mode a new scan is started automatically (`brands.py:162, 181-205`). The response then carries
`refresh: {"results_retired": <n>, "rescan": "needed"|"started", "message": "..."}`.

Account platforms and app stores are validated against `ACCOUNT_PLATFORMS` / `APP_STORES` in `backend/app/services/validators.py`
(error text lists the allowed values, `schema/brand.py:45-51, 75-85`).

### Example (brands group)

```bash
curl -X POST http://localhost:8000/api/brands \
  -H "Authorization: Bearer <access_token>" -H "Content-Type: application/json" \
  -d '{"name": "Acme Bank", "aliases": [], "keywords": [], "domains": []}'   # body from backend/tests/api/test_response_cache.py:46
# -> 201 BrandOut (id, name "Acme Bank", profile_health, allowlist, ...)
curl http://localhost:8000/api/brands -H "Authorization: Bearer <access_token>"
```
```json
[{"id": 1, "name": "Acme Bank", "active": true}]
```
```bash
curl -X POST http://localhost:8000/api/brands/2/select -H "Authorization: Bearer <access_token>"
```
```json
{"id": 2, "name": "Second Brand", "active": true}
```
After `select`, calls that omit `brand_id` (dashboard, detections, scans, reports, ...) work on brand 2, and `GET /api/me` reports
`default_brand_id: 2` (`backend/app/api/common.py:30-40`, `auth.py:29-36`).

---

## 4. Candidates (`backend/app/api/candidates.py`)

Manual entry, CSV/JSON import and image upload. Writers only, except fetching an image. No URL is ever opened (`candidates.py:1`).
Schemas live in `backend/app/core/pipeline/candidate_intake.py`: `SocialIn` (`:53`), `AppIn` (`:77`), `WebIn` (`:98`).

| Method | Path | Auth | Request | Success | Errors | Code |
|---|---|---|---|---|---|---|
| POST | `/api/candidates/social` | writer | query `brand_id?`; body `SocialIn {platform, handle, display_name?, url?, bio?, followers?, following?, posts?, created_at?, verified?, image_id?}` | 201 per-row result dict | 422 row error message | `candidates.py:36` |
| POST | `/api/candidates/app` | writer | body `AppIn {store, package_id, name, publisher?, publisher_id?, url?, description?, installs?, rating_count?, image_id?}` | 201 | 422 | `candidates.py:41` |
| POST | `/api/candidates/web` | writer | body `WebIn {url, title?, note?}` | 201 | 422 | `candidates.py:46` |
| POST | `/api/candidates/import` | writer | query `kind=social\|app\|web`, `format=csv\|json`, `dry_run` (default false), `brand_id?`; multipart `file` | 200 partial-success report (valid rows saved, bad rows reported) | 413 file > `IMPORT_MAX_BYTES` (1 MB); parse errors; rows capped at `IMPORT_MAX_ROWS` (500) | `candidates.py:51` |
| POST | `/api/candidate-images` | writer | query `purpose=candidate_image\|app_icon`, `brand_id?`; multipart `file` (<= 2 MB) | 201 `{id, format, width, height, size_bytes, sha256, purpose, url, note}` (de-duplicated by hash) | `LogoError` status | `candidates.py:75` |
| GET | `/api/candidate-images/{image_id}/file` | any signed-in | | 200 image bytes | 404 `Image not found` | `candidates.py:109` |

The return of the per-row endpoints is `ci.run_rows(...)["results"][0]` (`candidates.py:27-33`); see `candidate_intake.py` for its keys.
**Needs confirmation:** the exact per-row result keys (`status` is `error` on failure per `candidates.py:31`; other values are defined in `run_rows`, not re-verified here).

```bash
curl -X POST "http://localhost:8000/api/candidates/import?kind=social&format=csv&dry_run=true" \
  -H "Authorization: Bearer <access_token>" -F "file=@candidates.csv"
```

---

## 5. Dashboard (`backend/app/api/dashboard.py`)

| Method | Path | Auth | Request | Success | Code |
|---|---|---|---|---|---|
| GET | `/api/dashboard` | any signed-in | query `brand_id?` | 200 object (cached) | `dashboard.py:19` |

Response keys: from `dashboard.build` (`backend/app/services/dashboard.py:73-110`): `brand {id,name}`, `data_mode`, `is_sample`,
`includes_sample`, `kpis {total_detections, social_impersonations, suspicious_apps, web_threats, official_assets}` (each
`{value, delta_week, trend}`, `official_assets` only `{value}`), `counts {by_status, by_band, by_severity, by_type, by_category, cleared}`,
`by_type[]`, `by_platform[]`, `total_open`, `needs_review[]`, `recent[]`; the router adds `sources[]`, `sources_online`, `sources_total`,
`last_scan_at`, `last_scan`, `next_scan_at`, `schedule`, `credits` (only in live mode) (`dashboard.py:33-48`).

```bash
curl http://localhost:8000/api/dashboard -H "Authorization: Bearer <access_token>"
```

---

## 6. Detections (`backend/app/api/detections.py`)

Statuses a person can set: `reviewing`, `confirmed`, `dismissed` (aliases `keep_reviewing`, `confirm`, `dismiss`:
`backend/app/services/detections.py:34-35, 308-312`). `new`, `cleared` and `marked_official` are set by the system / mark-official.
Resolutions: `true_positive`, `false_positive`, `resolved`, `monitoring`.

| Method | Path | Auth | Request | Success | Errors | Code |
|---|---|---|---|---|---|---|
| GET | `/api/detections` | any signed-in | query below | 200 `{total, limit, offset, data_mode, is_sample, includes_sample, counts, items[]}` (cached) | 422 bad status/type | `detections.py:59` |
| GET | `/api/detections/excluded` | any signed-in | `category?`, `brand_id?` | 200 `{total, data_mode, is_sample, items[]}` (items skipped because they matched the allowlist) (cached) | | `detections.py:100` |
| GET | `/api/detections/false-positives` | any signed-in | `category?`, `source?`, `brand_id?` | 200 `{total, data_mode, is_sample, items[]}` (cached) | | `detections.py:114` |
| GET | `/api/detections/{id}` | any signed-in | | 200 detail (+ `data_mode`, `is_sample`) | 404 `Detection not found` | `detections.py:129` |
| GET | `/api/detections/{id}/evidence` | any signed-in | | 200 `{page_url, captured_at, sha256, hash_verified, snapshot, screenshot_available, screenshot_sha256, history}` | 404 | `detections.py:139`; `services/detections.py:286-293` |
| GET | `/api/detections/{id}/evidence/screenshot` | any signed-in | | 200 `image/png` | 404 `No screenshot was captured (screenshots are off by default)` | `detections.py:146` |
| POST | `/api/detections/{id}/status` | writer | body `StatusBody {status, note<=1000}` | 200 detail + `audit_id` | 422, 409 (marked official) | `detections.py:163` |
| POST | `/api/detections/{id}/resolution` | writer | body `ResolutionBody {resolution, note<=1000}` | 200 detail + `audit_id` | 422 | `detections.py:170` |
| POST | `/api/detections/{id}/confirm` | writer | optional body `NoteBody {note}` | 200 as `status` | | `detections.py:186` |
| POST | `/api/detections/{id}/keep-reviewing` | writer | optional `NoteBody` | 200 | | `detections.py:187` |
| POST | `/api/detections/{id}/dismiss` | writer | optional `NoteBody` | 200 | | `detections.py:188` |
| POST | `/api/detections/{id}/mark-official` | writer | optional body `MarkOfficialBody {note<=1000, publisher<=120}` | 200 `{detection, allowlist_entry, official_assets, audit_id}` | 409 | `detections.py:191` |

`GET /api/detections` query parameters (`detections.py:60-77`): `category` (social\|apps\|web), `type`, `platform`, `band`
(high\|medium\|low), `severity` (LOW\|MEDIUM\|HIGH\|CRITICAL), `resolution`, `status` (repeatable), `source` (live\|sample\|all),
`q` (<=200), `min_score` (0-100), `sort` (`score_desc` default, `score_asc`, `found_desc`, `found_asc`, `last_seen_desc`),
`from`, `to`, `limit`, `offset`, `brand_id`.

List item (`summary_row`, `services/detections.py:178-202`): `id, category, type, platform, name, handle, package_id, publisher,
profile_url, score, risk_band, severity, status, resolution, summary, tags, found_at, last_seen_at, stale, source, origin`.

Note: the shortcut routes `confirm`, `keep-reviewing`, `dismiss` are registered with `add_api_route` (`detections.py:177-188`).

### Example (detections group)

```bash
curl "http://localhost:8000/api/detections?category=social&band=high&status=new&limit=20&sort=score_desc" \
  -H "Authorization: Bearer <access_token>"
```
```json
{"total": 1, "limit": 20, "offset": 0, "data_mode": "sample", "is_sample": true, "includes_sample": true, "counts": {},
 "items": [{"id": 12, "category": "social", "type": "fake_profile", "platform": "instagram", "name": "...", "score": 88,
            "risk_band": "high", "severity": "CRITICAL", "status": "new", "resolution": null, "origin": "synthetic", "source": "sample"}]}
```
(`counts` content comes from `svc.list_detections`, not re-verified; the values above are illustrative of the real keys.)

```bash
curl -X POST http://localhost:8000/api/detections/12/status \
  -H "Authorization: Bearer <access_token>" -H "Content-Type: application/json" \
  -d '{"status": "confirmed", "note": "Uses our logo and asks for card numbers"}'
```

---

## 7. Scans, jobs, cron (`backend/app/api/scans.py`, `cron.py`)

| Method | Path | Auth | Request | Success | Errors | Code |
|---|---|---|---|---|---|---|
| POST | `/api/scan` | writer | optional body `ScanBody {scope: all\|social\|apps (default all), brand_id?}` | **202** `{job_id, scan_id, status, scan}` | 409 `Create the brand profile before scanning.`; 409 `A scan is already running` + `job_id`, `scan_id`, `scan`; 404 foreign brand | `scans.py:25` |
| GET | `/api/jobs/{job_id}` | any signed-in | | 200 `scan_view` | 404 `Job not found` | `scans.py:48` |
| GET | `/api/scan/status` | any signed-in | `brand_id?` | 200 `{last_scan_at, last_scan_status, last_full_sync_at, next_scan_at, schedule, running_job_id, data_mode, is_sample, scheduler}` | | `scans.py:56` |
| GET | `/api/scans` | any signed-in | `brand_id?`, `limit` (20, 1-100), `offset` | 200 `{total, items[]}` (cached) | | `scans.py:83` |
| GET | `/api/scans/latest` | any signed-in | `brand_id?` | 200 `{scan: scan_view\|null}` (cached) | | `scans.py:98` |
| GET | `/api/scans/{scan_id}` | any signed-in | | 200 `scan_view` | 404 `Scan not found` | `scans.py:105` |
| GET | `/api/cron/scan` | **cron secret** | header `Authorization: Bearer <CRON_SECRET>` | 200 `{ran, skipped, reason, scan_id}` | 503 `Scheduled scans via cron are not configured (set CRON_SECRET).`; 401 `Invalid cron credentials` | `cron.py:32` |

`scan_view` (`backend/app/core/pipeline/scan_pipeline.py:926-954`): `id, job_id, kind:"scan", brand_id, scope, status`
(`queued|running|completed|partial|failed`), `state` (older vocabulary `queued|running|done|error`), `progress, message, steps, result,
counts, source_report, timings, errors, started_by, data_mode, is_sample, created_at, started_at, finished_at`.

Only one queued/running scan per brand is allowed, enforced by the DB (`uq_scans_one_active_per_brand`, see `data-model.md`).
The cron endpoint reuses the scheduler decision and runs one inline scan with `started_by = "scheduler"` (`cron.py:1-6, 32-46`),
looking `CRON_SLACK` = 60 minutes ahead (`cron.py:24`).

```bash
curl -X POST http://localhost:8000/api/scan -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" -d '{"scope": "all"}'      # payload from backend/tests/api/test_scan_api.py:36
```
```json
{"job_id": "<job id>", "scan_id": 3, "status": "queued", "scan": {"id": 3, "kind": "scan", "scope": "all", "status": "queued", "state": "queued", "progress": 0}}
```
(Status can already be `completed` when the executor is `inline`, `scans.py:44`.)

---

## 8. Sources and data mode (`backend/app/api/sources.py`)

| Method | Path | Auth | Request | Success | Errors | Code |
|---|---|---|---|---|---|---|
| GET | `/api/sources` | any signed-in | `kind=social\|store` | 200 `{data_mode, requested_data_mode, summary, items[], tavily_credits, reputation}` (cached) | | `sources.py:125` |
| PATCH | `/api/sources/{source_id}` | writer | body `MonitoredBody {monitored: bool}` | 200 source item | 404 `Source not found` | `sources.py:160` |
| POST | `/api/sources/{source_id}/retry` | writer | query `confirm` (bool, default false) | **202** `{job_id, source_id, state:"done", status, source, reports, estimated_credits}` | 404; 409 not monitored / already online / no brand / no collector; 409 `confirmation_required` when the retry can spend paid credits | `sources.py:179` |
| GET | `/api/settings/data-mode` | any signed-in | | 200 selection (`sel.as_dict()`) | | `sources.py:233` |
| PUT | `/api/settings/data-mode` | **admin** | body `DataModeBody {data_mode: live\|sample\|auto}` | 200 selection | 403 for the demo admin unless `sample` | `sources.py:239` |

Source item keys: `id, slug, name, kind, description, status (online|slow|unavailable), monitored, message, last_sync_at, detail,
retry_in_minutes, next_retry_at, stale_since, cached_at, cached_age_seconds, collectors, source, retry_estimate` (`sources.py:103-122`).

---

## 9. Settings (`backend/app/api/settings.py`)

| Method | Path | Auth | Request | Success | Errors | Code |
|---|---|---|---|---|---|---|
| GET | `/api/settings` | any signed-in | | 200 view (cached) | | `settings.py:125` |
| PUT | `/api/settings` | **admin** | body `SettingsIn {data_mode?: live\|sample\|auto, monitoring?, notifications?}` | 200 view | 403 (demo admin limits), 422 | `settings.py:130` |
| POST | `/api/settings/sensitivity-preview` | any signed-in | body `{sensitivity: int}` within `SENSITIVITY_MIN..MAX` | 200 `{sensitivity, threshold, would_review, total, data_mode, is_sample, message}` | 422 | `settings.py:194` |

* `monitoring`: `schedule` (`off|5m|15m|1h|1d`), `sources` (map platform -> bool; unknown platform is a 422), `sensitivity`, `rules`
  (map of known rule names -> bool), `impersonation_words` (lower-cased, each <= 30 chars, <= 50 words) (`settings.py:24-67`).
* `notifications`: `email_alerts`, `high_risk_immediate`, `weekly_digest`, `webhook_url` (must be `https://...` or empty, <= 500)
  (`settings.py:70-83`). Stored only: the view says `"delivery": "not_implemented"` (`settings.py:117-119`).
* The webhook URL is shown only to a non-demo admin (`settings.py:118`).
* View keys: `data_mode, effective_data_mode, monitoring{...,threshold}, scheduler, notifications, account{organization,user}, updated_at` (`settings.py:105-121`).

```bash
curl -X PUT http://localhost:8000/api/settings -H "Authorization: Bearer <admin access token>" -H "Content-Type: application/json" \
  -d '{"monitoring": {"schedule": "1d", "sensitivity": 70}}'
```

---

## 10. Look-alike Lab (`backend/app/api/lookalike.py`)

| Method | Path | Auth | Request | Success | Errors | Code |
|---|---|---|---|---|---|---|
| POST | `/api/lookalike/test` | any signed-in | body `TestBody {name 1-200, brand_id?, platform?}` | 200 matcher verdict (pure, no side effects) | 422 | `lookalike.py:70` |
| POST | `/api/lookalike/test-url` | any signed-in | body `UrlBody {url 1-2048, brand_id?}` | 200 (never opens the URL) | 422 | `lookalike.py:77` |
| POST | `/api/lookalike/test-logo` | any signed-in | multipart `file`, optional `reference`; query `brand_id?` | 200 comparison; nothing stored | 422 `NO_LOGO` when no reference exists; `LogoError` | `lookalike.py:83` |
| GET | `/api/lookalike/logo-engine` | any signed-in | | 200 CLIP availability | | `lookalike.py:113` |
| GET | `/api/lookalike/test-urls` | any signed-in | `brand_id?` | 200 generated example domains | | `lookalike.py:119` |
| GET | `/api/lookalike/test-cases` | any signed-in | `brand_id?` | 200 `{total, items[{id,name,expected,builtin,source}]}` (cached) | | `lookalike.py:125` |
| POST | `/api/lookalike/test-cases` | **admin** | body `CaseBody {name, expected: flagged\|not_flagged\|official}`, `brand_id?` | 201 case | 409 `This test case already exists` | `lookalike.py:133` |
| DELETE | `/api/lookalike/test-cases/{case_id}` | **admin** | | 200 `{ok: true}` | 404 | `lookalike.py:147` |
| POST | `/api/lookalike/test-cases/run` | writer | `brand_id?` | 200 run result (`summary`, `items`, ...) | | `lookalike.py:158` |

```bash
curl -X POST http://localhost:8000/api/lookalike/test -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" -d '{"name": "Acme Bank Support"}'
```
**Needs confirmation:** the exact keys of the verdict returned by `lookalike.evaluate_name` (`backend/app/core/pipeline/lookalike.py`) were not enumerated here.

---

## 11. Reports (`backend/app/api/reports.py`)

Reports are drafts created from detections; approval only records a person's sign-off and sends nothing (`reports.py:110-111, 195-196`).
HTML responses carry `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` (`reports.py:20`).

| Method | Path | Auth | Request | Success | Errors | Code |
|---|---|---|---|---|---|---|
| GET | `/api/reports/preview` | any signed-in | query `from, to, types (comma list), status, ids (comma list), include_evidence, brand_id` | 200 `{title, brand, from, to, data_mode, is_sample, includes_sample, stats, include_evidence, rows[]}` | 422 bad ids | `reports.py:81` |
| GET | `/api/reports/preview.html` | any signed-in | same | 200 HTML | | `reports.py:96` |
| POST | `/api/reports` | writer | body `ReportIn` | 201 report object | 422 `format: pdf` not available; 422 `No detections match...` | `reports.py:110` |
| GET | `/api/reports` | any signed-in | `limit` (10, 1-100), `offset`, `brand_id?` | 200 `{total, items[]}` (cached) | | `reports.py:138` |
| GET | `/api/reports/{id}` | any signed-in | | 200 report + `rows[]` | 404 `Report not found` | `reports.py:157` |
| GET | `/api/reports/{id}/preview` | any signed-in | | 200 HTML | 404 | `reports.py:165` |
| GET | `/api/reports/{id}/export.csv` | any signed-in | | 200 CSV attachment | 404 | `reports.py:175` |
| GET | `/api/reports/{id}/export.html` | any signed-in | | 200 HTML attachment | 404 | `reports.py:181` |
| GET | `/api/reports/{id}/download` | any signed-in | | 200 file in the report's own format | 404 | `reports.py:187` |
| POST | `/api/reports/{id}/approve` | writer | | 200 report object | 409 `This report is already approved` | `reports.py:195` |

`ReportIn` (`reports.py:23-34`): `detection_ids` (<= 1000), `from`/`to` (dates), `types[]`, `status`, `include_evidence` (default true),
`format` (`csv|html|pdf`, default `html`; `pdf` is refused with 422), `title` (<= 200), `brand_id`.
Report object (`reports.py:52-60`): `id, title, filename, format, status, size_bytes, created_by, created_at, approved_by, approved_at,
from, to, count, detection_ids, stats, include_evidence, includes_sample, source, download_url, preview_url, csv_url, html_url`.

```bash
curl -X POST http://localhost:8000/api/reports -H "Authorization: Bearer <access_token>" -H "Content-Type: application/json" \
  -d '{"detection_ids": [12, 14], "format": "csv", "title": "Brand Protection Report"}'
```

---

## 12. Evaluation (`backend/app/api/evaluation.py`)

| Method | Path | Auth | Request | Success | Code |
|---|---|---|---|---|---|
| GET | `/api/evaluation` | any signed-in | `brand_id?` | 200 object | `evaluation.py:94` |
| POST | `/api/evaluation/run` | writer | `brand_id?` | 200 same object, synthetic cache refreshed; audited | `evaluation.py:101` |

Keys (`evaluation.py:81-91`): `by_category[]`, `data_mode`, `is_sample`, `label`, `synthetic {seed, per_technique, brands, computed_at,
by_technique[], overall, confusion, dataset, algorithm_version, ml_classifier, false_positives, cached}`, `lookalike_tests`,
`reviewed {confirmed, dismissed, marked_official, pending}`, `detection {true_positives, false_positives, precision, definition}`, `by_type[]`.
Precision = confirmed / (confirmed + dismissed); recall is not measurable (`evaluation.py:87-89`).

---

## 13. Providers (`backend/app/api/providers.py`)

| Method | Path | Auth | Request | Success | Errors | Code |
|---|---|---|---|---|---|---|
| GET | `/api/providers` | any signed-in | | 200 `{active_text_provider, hosted_text_analysis_enabled, text_providers[{name,label,configured,model,needs_key,reason,active}], embeddings, image_similarity_backend, note}` (cached) | | `providers.py:45` |
| PUT | `/api/providers/active` | **admin** | body `{provider: off\|local\|gemini\|huggingface}` | 200 same view | 403 demo admin | `providers.py:50` |

Keys are read from the environment and never returned (`providers.py:41`).

---

## 14. Audit (`backend/app/api/audit.py`)

| Method | Path | Auth | Request | Success | Code |
|---|---|---|---|---|---|
| GET | `/api/audit` | writer | `from`, `to` (datetimes), `actor`, `action`, `limit` (50, 1-200), `offset` | 200 `{total, items[{id, ts, actor, actor_id, action, target, detail, source}]}`, newest first | `audit.py:52` |
| GET | `/api/audit/export.csv` | writer | none | 200 CSV attachment `audit-log.csv`, columns `ts, actor, action, target, detail` | `audit.py:75` |

Admins see every row; analysts see only their own actions; the shared demo admin is treated like an analyst (`audit.py:36-49`).
Viewers get 403. CSV cells starting with `= + - @ TAB CR` are prefixed with `'` (`audit.py:70-72`).

---

## 15. Health (`backend/app/api/health.py`)

| Method | Path | Auth | Success | Notes | Code |
|---|---|---|---|---|---|
| GET | `/health` and `/api/health` | public | 200 `{status, version, database:{status}, components:{...}}` | **503** only when the database is down | `health.py:22-27` |
| GET | `/health/live` | public | 200 `{status:"ok", version}` | no dependency touched | `health.py:30-33` |
| GET | `/api/health/details` | **admin** | 200/503 `{status, version, environment, checks}` | collector reasons, migration revision, worker count, free disk | `health.py:36-40` |
| POST | `/api/health/canary` | **admin** | 200 canary result with `passed`, `failures` | in-memory fake brand; audited | `health.py:43-50` |

Components are `database, migration, collectors, redis, worker, data_dir` (`backend/app/services/health.py:202-216`);
overall status is `down` if the database is down, else `degraded` if any component is bad (`:220-223`).

```bash
curl http://localhost:8000/health
```
```json
{"status": "ok", "version": "<VERSION>", "database": {"status": "ok"}, "components": {"database": "ok", "migration": "ok", "collectors": "ok", "redis": "...", "worker": "...", "data_dir": "ok"}}
```
**Needs confirmation:** the literal status words for non-database components (`ok`/`degraded`/`down`/`unknown`/other) were not all enumerated from `backend/app/services/health.py`.

---

## 16. Studio items (`backend/app/api/studio.py`)

Per-user saved items for Brand Studio (replaces Firebase collections). Owner-only: another user's item is a plain 404
(`studio.py:165-169`). Types: `logo, palette, brand_name, content, audit, sentiment` (`backend/app/models/studio.py:9`).
Limits: label <= 200 chars, `data` <= 64 KB JSON, image <= 2 MB, <= 500 items per user (`studio.py:31-35`).

| Method | Path | Auth | Request | Success | Errors | Code |
|---|---|---|---|---|---|---|
| GET | `/api/studio/items` | any signed-in | `type?`, `limit` (100, 1-500), `offset` | 200 `{total, limit, offset, items[]}`, newest first | 422 bad `type` | `studio.py:103` |
| POST | `/api/studio/items` | any signed-in | JSON `{type, label, data?, image_base64?}` or multipart (`type`, `label`, `data` as JSON text, `file`) | 201 item | 413 too large; 415 other content type; 409 item cap; 422 | `studio.py:121` |
| DELETE | `/api/studio/items/{item_id}` | any signed-in | | 200 `OkResponse` `{ok:true, detail:""}` | 404 `Item not found` | `studio.py:172` |
| GET | `/api/studio/items/{item_id}/image` | any signed-in | | 200 image, `Cache-Control: private, max-age=300` | 404 `This item has no image` | `studio.py:183` |

Item shape (`studio.py:38-48`, asserted in `backend/tests/api/test_studio_items.py:55`):
`{id: "<string>", userId: "<string>", type, label, data, url (/api/studio/items/<id>/image or null), timestamp (ms), created_at}`.

```bash
curl -X POST http://localhost:8000/api/studio/items -H "Authorization: Bearer <access_token>" -H "Content-Type: application/json" \
  -d '{"type": "palette", "label": "Ocean palette", "data": {"paletteName": "Ocean", "mood": "calm", "colors": [{"name": "Deep", "hex": "#123456", "role": "Primary", "description": "x"}], "usage": "u"}}'
```
```json
{"id": "1", "userId": "2", "type": "palette", "label": "Ocean palette", "data": {"paletteName": "Ocean"}, "url": null, "timestamp": 1760000000000, "created_at": "2026-10-17T12:00:00Z"}
```
(data abbreviated; payload from `backend/tests/api/test_studio_items.py:12`.)

---

## 17. Studio AI (`backend/app/api/studio_ai.py`)

A server-side proxy so provider keys never reach the browser. Signed-in users only (any role). Limits come from
`backend/app/config/config.py:138-160`.

| Method | Path | Auth | Request | Success | Errors | Code |
|---|---|---|---|---|---|---|
| GET | `/api/studio/ai/status` | any signed-in | | 200 `{chat{configured, providers[], used_today, daily_limit}, image{configured, provider:"pollinations", used_today, daily_limit, sizes[]}, limits{...}}` | | `studio_ai.py:75` |
| POST | `/api/studio/ai/chat` | any signed-in | body `ChatBody {messages[1..200] of {role: system\|user\|assistant\|model, content or text}, response_format: json\|text (default text), temperature 0-2 (0.7), max_tokens?}` | 200 `{text, provider, model}` | 422 too many messages (>40) / `max_tokens` > 4096; 413 total chars > 30000; 503 `AI chat is not set up on the server.`; 429 | `studio_ai.py:88` |
| POST | `/api/studio/ai/image` | any signed-in | body `{prompt 1-20000 (<= 2000 after cleanup), size}`, query `format=json\|png` | 200 `{image_base64, data_url, media_type, width, height, provider, model}`; `format=png` returns the raw PNG | 422 bad size; 413 prompt too long; 503 not set up; 429 | `studio_ai.py:109` |

Allowed sizes: `512x512, 768x768, 1024x1024, 1024x768, 768x1024, 1280x720, 720x1280` (`studio_ai.py:30`). A failed provider call
refunds the daily quota (`studio_ai.py:105, 128`).

```bash
curl -X POST http://localhost:8000/api/studio/ai/chat -H "Authorization: Bearer <access_token>" -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Suggest three brand names for a coffee roaster"}], "response_format": "text"}'
```
```json
{"text": "...", "provider": "groq", "model": "openai/gpt-oss-120b"}
```
(`provider` is `groq` or `gemini`, `studio_ai.py:79`; default Groq model `STUDIO_GROQ_MODEL`, `config.py:141`.)

---

## 18. Voice (`backend/app/api/voice.py`) - recent addition

`POST /api/voice`, any signed-in user, per-user limit 30 per minute (`voice.py:54-56`). The browser sends a compact snapshot of the
visible page controls and text; the server (Gemini key stays server-side) answers with UI actions the browser performs, then calls
again with a fresh snapshot until `finish` or `ask` (`voice.py:1-8`). Fields whose label or name look sensitive (passwords etc.,
`SENSITIVE` regex in `backend/app/services/voice.py`) are removed server-side before planning (`voice.py:59-60`). Simple commands such as
"scroll down" or "open dashboard" work with no AI key (`config.py:144`, `backend/tests/api/test_voice.py:22-26`).

Request body `VoiceBody` (`voice.py:41-50`):

| Field | Type | Limit |
|---|---|---|
| `text` | string | <= 1000, required |
| `route` | string | <= 200, default `/` |
| `title` | string | <= 120 |
| `routes` | list of `{path (<=100), spoken_names[] (<=10)}` | <= 50 |
| `snapshot` | list of `Elem {i: "v<digits>", t, l, n, v, r, d, e, o[], c, off}` | <= 200 elements |
| `done_steps` | list of objects | <= 40 |
| `pending` | object or null | the question asked last turn |
| `last_turns` | list of `{role: text}` maps | <= 6 |
| `last_fill` | object or null | |

Response (`backend/app/services/voice.py:75-77`): `{actions[], reply, ask, finish, cancel_pending, source}`; `source` defaults to `"fast"`.
Errors: 401, 422, 429 (`Too many voice commands. Wait a moment and try again.`, `Retry-After: 20`).

Real example from `backend/tests/api/test_voice.py:11-17, 23-26`:

```bash
curl -X POST http://localhost:8000/api/voice -H "Authorization: Bearer <access_token>" -H "Content-Type: application/json" \
  -d '{"text": "open dashboard", "route": "/setup", "title": "Setup",
       "routes": [{"path": "/dashboard", "spoken_names": ["dashboard"]}, {"path": "/reports", "spoken_names": ["reports"]}],
       "snapshot": [{"i": "v1", "t": "input", "l": "Company name", "n": "brand_name"}], "pending": null}'
```
```json
{"actions": [{"type": "navigate", "path": "/dashboard"}], "reply": "...", "ask": null, "finish": true, "cancel_pending": false, "source": "fast"}
```
(`actions` from the test assertion at `test_voice.py:24`; `reply`, `finish` values shown are indicative.)

**Needs confirmation:** exact `reply` / `finish` values for the fast "navigate" path.

---

## 19. Endpoint index (quick lookup)

Total: 101 method+path registrations, counted from the route decorators in `backend/app/api/*.py` (98 `@router.<verb>` / `@images.<verb>`
decorators plus the 3 `add_api_route` shortcuts at `detections.py:186-188`). `/me` + `/auth/me` and `/health` + `/api/health` are each
one function registered under two paths, so they count twice.

Auth levels at a glance:

* public: `/health`, `/health/live`, `/api/health`, `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/demo`, `/api/cron/scan` (needs secret)
* admin only: `PUT /api/settings`, `PUT /api/settings/data-mode`, `PUT /api/providers/active`, `DELETE /api/brands/{id}`, `POST /api/brands/{id}/restore`, `POST|DELETE /api/lookalike/test-cases...`, `GET /api/health/details`, `POST /api/health/canary`
* writer (analyst + admin): all brand edits, scans, detection decisions, candidates, reports create/approve, evaluation run, audit read, source monitor/retry, lookalike cases run
* any signed-in: all other reads, `POST /api/brands/{id}/select`, lookalike testers, sensitivity preview, studio items, studio AI, voice
