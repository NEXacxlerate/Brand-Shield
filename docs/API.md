# ScamMind AI: API Specification (derived from the frontend contract)

Source of truth for screens: `ScamMind AI Screens.pdf` (10 screens). Frontend facts: `docs/FRONTEND_CONTRACT.md`.
This is a **proposed** contract. Legend used on every endpoint:

- **[CALLED]** = the frontend already calls this URL today (in `frontend/src/api/*.ts`).
  Important: of the 10 routed pages only Login calls the API. Most [CALLED] endpoints below are called only by the **orphaned** old-product pages or by `api/client.ts` itself. Each is labelled accordingly.
- **[NEW]** = needed by the PDF screens, not called by any frontend code today (the 10 pages currently use `localStorage`).
- **[EXISTS]** = a router of the same path already exists in `backend/app/routers` (name only; shape is old-product and may differ). See section 16.
- Fields marked `sample` follow the sample-data rules in section 2.

---

## 1. Conventions

- Base URL: `VITE_API_URL` (default `http://127.0.0.1:8000`). All paths start with `/api`.
- JSON, UTF-8. Timestamps ISO-8601 UTC with `Z` (`"2026-10-12T11:58:00Z"`). The UI formats them (e.g. "12 Oct, 11:58 AM"). Durations as integers.
- `brand_id`: collection endpoints accept optional `?brand_id=`; default is `me.default_brand_id`. Single brand per org assumed (open question).
- Pagination (list endpoints that can grow): `?limit=50&offset=0` (max limit 200); response includes `total`.
- Enum wire values are **lowercase snake_case**; the UI maps them to labels (tables in section 3).
- IDs: integers for brands/accounts/apps/sources/reports; detections use string ids `det_<n>` or integers (pick one; examples use integers). Frontend store today uses strings like `det-1`; any opaque id works.

### Auth

Bearer JWT. `Authorization: Bearer <access_token>` on every call except those marked anonymous. Short-lived access token (frontend copy: "Sessions use short-lived tokens"), refresh token rotates.
Roles: `admin | analyst | viewer`. Viewers: GET only. Review actions (status, mark official, scan, brand edits, settings, reports) need `analyst` or `admin`.

### Error format (what `api/client.ts` parses)

```json
{ "detail": "Incorrect email or password" }
```
or FastAPI validation (HTTP 422):
```json
{ "detail": [ { "loc": ["body","email"], "msg": "value is not a valid email address", "type": "value_error.email" } ] }
```
The client uses `detail` if string, else joins `detail[].msg` with `"; "`. **Every** error must carry `detail`. Status codes: 400 bad input, 401 missing/expired token (client auto-refreshes once, then redirects to `/login`), 403 role, 404, 409 conflict (duplicate), 413 file too large, 415 bad file type, 422 validation, 429 rate limit, 502/503 upstream.
Network failure (no HTTP response) is handled client-side as "Cannot reach the server...".

---

## 2. Sample-data rules

- Every record that is seeded demo content has `"source": "sample"`. Real records have `"source": "live"`. Applies to: detections, sources, source events, official accounts/apps (seeded Acme assets), reports/exports, test cases, audit entries.
- Org-level `data_mode` in Settings: `"live" | "sample"`.
  - `sample`: GET lists return only sample records; scan endpoints produce sample records and never contact real platforms; every list/aggregate response includes `"data_mode": "sample"` so the UI shows the footer "Sample data for the fictional brand Acme Bank. Not real detections."
  - `live`: only `source: "live"` records returned; footer hidden. Sources that cannot be reached report `unavailable` (never fall back silently to sample).
- Aggregate responses (dashboard, reports preview) carry `"data_mode"` and `"includes_sample": bool`.
- Seed (fictional brand Acme Bank) is the 11 detections, 8 sources, 5 accounts, 2 apps, 5 events, 12 test cases listed in the contract; reproduced in section 15 for the seeder.

---

## 3. Enums

| Name | Wire values | UI label |
|---|---|---|
| `role` | admin, analyst, viewer | |
| `detection.type` | `fake_profile`, `fake_brand_page`, `scam_account`, `fake_app` | Fake profile, Fake brand page, Scam account, Fake app |
| `detection.category` | `social`, `apps` | derived: `fake_app` => apps |
| `platform` | `instagram`, `facebook`, `x`, `telegram`, `linkedin`, `youtube`, `google_play`, `app_store`, `third_party_apk` | Instagram, Facebook, X, Telegram, LinkedIn, YouTube, Google Play, App Store (source name: "Apple App Store"), Third-party APK (source name: "Third-party APK sites") |
| detection platforms | all except `youtube` (youtube only appears for official accounts) | |
| official account platform | instagram, x, facebook, linkedin, youtube | |
| `detection.status` | `new`, `reviewing`, `confirmed`, `dismissed`, `marked_official` | New, Reviewing, Confirmed, Dismissed, Marked official |
| `risk_band` | `high` (score >= 85), `medium` (70 to 84), `low` (< 70) | High / Medium / Low. **Proposed**; PDF only shows "High". |
| `account.status` | `verified`, `unreachable` | Verified, Unreachable |
| `source.status` | `online`, `slow`, `unavailable` | Online, Slow, Unavailable |
| `source.kind` | `social`, `store` | |
| `scan.scope` | `all`, `social`, `apps` | |
| `job.state` | `queued`, `running`, `done`, `error` | |
| `lookalike.verdict` | `flagged`, `not_flagged`, `official` | Flagged, Not flagged, Official |
| `export.format` | `pdf`, `csv` | PDF report, CSV data |
| `data_mode` | `live`, `sample` | |
| `scan_schedule` | `5m`, `15m`, `1h`, `1d` | Every 5 minutes, Every 15 minutes, Hourly, Daily |

---

## 4. Auth

### POST /api/auth/login  [CALLED: LoginPage via `authApi.login`] [EXISTS]  anonymous
Request:
```json
{ "email": "admin@company.com", "password": "..." }
```
Response 200:
```json
{
  "access_token": "eyJ...", "refresh_token": "eyJ...", "token_type": "bearer", "expires_in": 900,
  "user": { "id": 1, "name": "Harini", "email": "admin@company.com", "role": "admin", "active": true, "default_brand_id": 1 }
}
```
Errors: 401 `{"detail":"Incorrect email or password"}`, 429 rate limited. The frontend must show this message on the Login page (today it swallows it and starts an offline session).
`persist` (keep me signed in) is client-only (localStorage vs sessionStorage); the server does not need it. The client expects `user.default_brand_id` in the login payload (it reads `ApiUser.default_brand_id`).

### POST /api/auth/refresh  [CALLED: client.ts on any 401] [EXISTS]  anonymous
Request `{ "refresh_token": "..." }`. Response: same shape as login (new access and refresh tokens, rotate). 401 on invalid/expired => client logs out.

### POST /api/auth/logout  [CALLED: `authApi.logout`, not triggered by the current Header] [EXISTS]  anonymous
Request `{ "refresh_token": "..." }`. Response `{ "ok": true, "detail": "" }`. Revokes the refresh token. Audit entry `auth.logout`.

### GET /api/me  [CALLED: `authApi.me`, `brandId()`] [EXISTS]
Response: `{ "id":1,"name":"Harini","email":"admin@company.com","role":"admin","active":true,"default_brand_id":1 }`. Header chip should use this instead of the hard-coded "Harini / admin@company.com".

### POST /api/auth/forgot  [CALLED: `authApi.forgot`, no page uses it] [EXISTS]  anonymous
Request `{ "email": "..." }` Response `{ "ok": true, "detail": "If the account exists, a reset link was sent." }` (always 200).

### POST /api/auth/reset  [CALLED: `authApi.reset`, no page] [EXISTS]  anonymous
Request `{ "token": "...", "new_password": "..." }` (min 8). Response `{ "ok": true, "detail": "Password updated" }`. No reset UI exists yet.

### POST /api/auth/register  [NEW for Setup page: "New organization? Set up your brand profile"] [EXISTS in backend, old shape]  anonymous
Creates the organization, first admin user and an empty brand so the Setup wizard can run.
Request:
```json
{ "name": "Harini", "email": "admin@company.com", "password": "...", "organization": "Acme Bank" }
```
Response 201: same token payload as login (user.default_brand_id set to the new brand). 409 if email exists.

---

## 5. Brand profile and assets (Brand Profile page, Setup page)

### GET /api/brands/{brand_id}  [CALLED only by orphan InvestigatePage via `GET /api/brands` list] [EXISTS]
Response:
```json
{
  "id": 1, "name": "Acme Bank", "industry": "Banking and financial services",
  "aliases": ["Acme","AcmeBank","Acme Bank India"],
  "keywords": ["acme","acmebank","#AcmeBank"],
  "domains": ["acmebank.com","acmebank.in"],
  "logo": { "url": "/api/brands/1/logo", "format": "png", "width": 512, "height": 512, "size_bytes": 86016, "square": true, "meets_requirements": true },
  "official_accounts": [ /* see 5.3 */ ],
  "official_apps": [ /* see 5.5 */ ],
  "profile_health": { "percent": 86, "message": "Good coverage. Fix one unreachable URL to reach 100%.",
    "checks": [ {"key":"name_aliases","label":"Brand name and aliases","ok":true},
                {"key":"logo","label":"Official logo meets requirements","ok":true},
                {"key":"domains","label":"Official domains added","ok":true},
                {"key":"apps_publisher","label":"Apps include publisher names","ok":true},
                {"key":"urls_reachable","label":"YouTube URL could not be reached","ok":false} ] },
  "allowlist": { "accounts": 5, "apps": 2, "domains": 2 },
  "official_assets": 7,
  "updated_at": "2026-10-12T09:12:00Z", "source": "sample"
}
```
`GET /api/brands` [CALLED by orphan Investigate] returns the list `[{id,name}]` (frontend fallback shows `[{id:1,name:"Acme Bank"}]`).
`profile_health` and `allowlist` are computed server-side (currently hard-coded in `BrandProfilePage.tsx`). `official_assets = accounts + apps`, shown in the sidebar and the dashboard KPI.

### PUT /api/brands/{brand_id}  [NEW for Brand Profile "Save brand profile"] [EXISTS]
Request (identity section only):
```json
{ "name":"Acme Bank","industry":"Banking and financial services",
  "aliases":["Acme","AcmeBank"],"keywords":["acme","#AcmeBank"],"domains":["acmebank.com"] }
```
Response: full brand object (5 above). Rules: name required (1 to 120), de-duplicate lists, domains validated and lowercased, `#` allowed in keywords. Audit `brand.updated` (the Source Health feed shows "Brand profile saved, allowlist refreshed"). Applies from the next scan.

### POST /api/brands  [NEW for Setup step 1] [EXISTS]
Request `{ "name":"Acme Bank","aliases":["Acme","AcmeBank","Acme Bank India"] }` Response 201 brand object. (Setup sends only name and aliases.)

### Logo upload

`POST /api/brands/{brand_id}/logo`  [NEW; the frontend "Replace logo" and Setup "Replace" buttons are `alert()` stubs]
multipart/form-data, field `file`. Accepted: PNG or SVG, max 2 MB (2,097,152 bytes), square. Recommended 512x512 px. Validation errors:
- 413 `{"detail":"Logo is larger than 2 MB"}`; 415 `{"detail":"Logo must be a PNG or SVG"}`; 422 `{"detail":"Logo must be square"}` (or accept and return `meets_requirements:false`).
Response:
```json
{ "url": "/api/brands/1/logo", "format": "png", "width": 512, "height": 512, "size_bytes": 86016, "square": true, "meets_requirements": true, "sha256": "..." }
```
Server derives perceptual hash for logo/icon matching. `GET /api/brands/{brand_id}/logo` returns the image (auth required, or signed URL for `<img>`).
`DELETE` not needed.

### 5.3 Official social accounts

`GET /api/brands/{brand_id}/accounts` [NEW]  Response:
```json
{ "total": 5, "items": [
  { "id": 1, "platform": "instagram", "handle": "@acmebank", "url": "instagram.com/acmebank", "status": "verified", "last_checked_at": "2026-10-12T09:12:00Z", "source": "sample" },
  { "id": 2, "platform": "x", "handle": "@AcmeBank", "url": "x.com/AcmeBank", "status": "verified", "source": "sample" },
  { "id": 3, "platform": "facebook", "handle": "acmebank", "url": "facebook.com/acmebank", "status": "verified", "source": "sample" },
  { "id": 4, "platform": "linkedin", "handle": "company/acmebank", "url": "linkedin.com/company/acmebank", "status": "verified", "source": "sample" },
  { "id": 5, "platform": "youtube", "handle": "@acmebank", "url": "youtube.com/@acmebank", "status": "unreachable", "source": "sample" } ] }
```
`POST /api/brands/{brand_id}/accounts` [NEW] request `{ "platform":"instagram", "handle":"acmebank" }`. Server normalises the handle (prefix `@` except facebook and linkedin) and builds the URL (`instagram.com/`, `x.com/`, `facebook.com/`, `linkedin.com/company/`, `youtube.com/@`), then verifies reachability to set `status` (`verified` or `unreachable`; the frontend today always says Verified). 201 returns the item. 409 if platform+handle already exists. Audit `account.added`.
`DELETE /api/brands/{brand_id}/accounts/{id}` [NEW] 200 `{"ok":true}`. Audit `account.removed`. Matching is by exact handle and URL, never name alone.

### 5.5 Official apps

`GET /api/brands/{brand_id}/apps` [NEW] items:
```json
{ "id": 1, "name": "Acme Bank Mobile", "package_id": "com.acmebank.mobile", "publisher": "Acme Bank Ltd", "stores": ["google_play","app_store"], "status": "verified", "source": "sample" }
{ "id": 2, "name": "Acme UPI", "package_id": "com.acmebank.upi", "publisher": "Acme Bank Ltd", "stores": ["google_play"], "status": "verified", "source": "sample" }
```
`POST /api/brands/{brand_id}/apps` [NEW] request `{ "name":"Acme Pay","package_id":"com.acme.pay","publisher":"Acme Bank Ltd","stores":["google_play"] }` (name, package_id, publisher required; stores subset of `google_play`, `app_store`; the UI today sends one store). 201 item; 409 duplicate package_id. Audit `app.added`.
`DELETE /api/brands/{brand_id}/apps/{id}` [NEW]. Audit `app.removed`.
`POST /api/brands/{brand_id}/apps/import` [NEW; button "Import from store listing URL" is a stub] request `{ "url": "https://play.google.com/store/apps/details?id=com.acmebank.mobile" }` response `{ "name":"...","package_id":"...","publisher":"...","stores":["google_play"],"icon_url":"..." }` (prefill only, not saved). 422 for unsupported URL, 502 if store unreachable.

---

## 6. Scans (Dashboard "Run scan now", Social "Scan social platforms now", Apps "Scan app stores now", Setup step 3)

### POST /api/scan  [NEW for these pages; old `POST /api/scan` exists] [EXISTS]
Request:
```json
{ "scope": "all", "brand_id": 1 }
```
`scope`: `all` (Dashboard, Setup), `social` (Social page), `apps` (App Store page). 202:
```json
{ "job_id": "job_8f2c1a" }
```
409 if a scan for that brand+scope is already running (`{"detail":"A scan is already running","job_id":"job_8f2c1a"}`). In `data_mode=sample` the job produces sample results only.

### GET /api/jobs/{job_id}  [NEW for these pages; EXISTS]  (poll every ~1 s until `done` or `error`)
```json
{
  "id": "job_8f2c1a", "kind": "scan", "scope": "social", "state": "running", "progress": 60,
  "message": "Checking Telegram", 
  "steps": [ {"source":"instagram","state":"done","checked":214,"new_detections":2},
             {"source":"telegram","state":"running","checked":41,"new_detections":0} ],
  "result": null
}
```
On `done`:
```json
{ "id":"job_8f2c1a","state":"done","progress":100,"message":"Scan finished",
  "result": { "sources_checked": 8, "sources_online": 6, "accounts_or_apps_checked": 486, "new_detections": 2, "partial_sources": ["telegram"], "unavailable_sources": ["app_store"], "finished_at": "2026-10-12T11:58:00Z" } }
```
The UI messages to drive today's alerts: "Scan complete! 8 sources queried." (Dashboard) and "{n} accounts analyzed. {k} new threats." (Social). A source being slow/unavailable does **not** fail the job (PDF: "The scan still finishes").

### GET /api/scan/status  [NEW]
`{ "last_scan_at":"2026-10-12T11:58:00Z","last_full_sync_at":"2026-10-12T12:05:00Z","next_scan_at":"2026-10-12T12:10:00Z","schedule":"5m","running_job_id":null }`
Feeds Dashboard hero line ("Last scan 12 Oct 2026, 11:58 AM · 6 of 8 sources online" with sources counts from /sources) and Source Health "Next scan 12:10".

---

## 7. Detections (Social page, App Store page, drill-downs)

### GET /api/detections  [NEW]
Query: `category=social|apps`, `type=fake_profile|fake_brand_page|scam_account|fake_app`, `platform=<slug>`, `status=<status>` (repeatable), `min_score`, `q` (name/handle), `sort=score_desc` (default, risk) | `found_desc`, `from`, `to` (ISO date, by `found_at`), `limit`, `offset`, `brand_id`.
Response (list rows are summaries; counts drive the tab labels "All 6 / Fake profiles 3 / ..." and "All stores 5 / Google Play 3 / ..."):
```json
{
  "total": 6, "data_mode": "sample",
  "counts": { "all": 6, "by_type": {"fake_profile":3,"fake_brand_page":1,"scam_account":2,"fake_app":0},
              "by_platform": {"instagram":2,"facebook":1,"x":2,"telegram":1} },
  "items": [
    { "id": 1, "category": "social", "type": "scam_account", "platform": "instagram",
      "name": "Acme Bank Support Care", "handle": "@acrne_bank_support", "package_id": null, "publisher": null,
      "score": 94, "risk_band": "high", "status": "new",
      "summary": "“rn” reads as “m”, added word “support”",
      "found_at": "2026-10-12T11:58:00Z", "stale": false, "source": "sample" }
  ]
}
```
Notes: `name` + `handle`/`package_id` replace the frontend's `name` + `handleOrPackage`. Dashboard "Recent detections" uses `sort=found_desc&limit=6`; "Needs review" uses `status=new&status=reviewing&min_score=85&limit=5`. Cached rows (App Store unreachable) carry `"stale": true, "cached_at": "..."`. Social tab default must be sorted by score desc (PDF claims "Sorted by risk").

### GET /api/detections/{id}  [NEW]
Detail for the right-hand panel. Social example:
```json
{
  "id": 1, "category": "social", "type": "scam_account", "platform": "instagram",
  "name": "Acme Bank Support Care", "handle": "@acrne_bank_support", "profile_url": "instagram.com/acrne_bank_support",
  "score": 94, "risk_band": "high", "status": "new", "found_at": "2026-10-12T11:58:00Z",
  "tags": ["“rn” reads as “m”","Added word: support","Logo 91% match","Bio asks for KYC"],
  "summary": "...",
  "official": { "name":"Acme Bank","handle":"@acmebank","bio":"Official page of Acme Bank. We will never ask for your PIN, OTP or KYC details over DM.","followers":"2.4M","joined":"2014","link":"acmebank.com","on_allowlist":true },
  "suspect": { "bio":"Official Acme Bank support. DM us your KYC details to avoid account block.","followers":"214","joined":"12 days ago","link":"acme-kyc-update.in","logo_match_percent":91 },
  "reasons": [ {"signal":"Name similarity","detail":"“acrne” reads as “acme” (rn → m)","points":34},
               {"signal":"Added word","detail":"“support”","points":10},
               {"signal":"Logo match","detail":"91% match with the official logo","points":25},
               {"signal":"Bio content","detail":"Asks for KYC details in DMs","points":17},
               {"signal":"Account signals","detail":"12 days old, 214 followers","points":8} ],
  "evidence": { "screenshot_url":"/api/detections/1/evidence/screenshot","page_url":"instagram.com/acrne_bank_support","captured_at":"2026-10-12T11:58:00Z","sha256":"9f3a8b27c1d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f7a8b9c0d1e2f3a4b" },
  "history": [ {"at":"2026-10-12T11:58:00Z","actor":"system","from":null,"to":"new"} ],
  "source": "sample"
}
```
Reasons: the frontend renders `label` as `"{signal} · {detail}"` and `+{points}`; sum of points equals `score` in the seed. The frontend currently stores a single string `label`; the split is recommended but a single `label` is acceptable if the owner prefers.
App variant adds (instead of `official`/`suspect` bios):
```json
{ "type":"fake_app","platform":"google_play","name":"Acme Bank Support Help","package_id":"com.acme.support.help","publisher":"Quick Tools Studio",
  "publisher_differs": true, "official_publisher":"Acme Bank Ltd",
  "official": { "name":"Acme Bank Mobile","package_id":"com.acmebank.mobile","publisher":"Acme Bank Ltd","stores":["google_play","app_store"],"downloads":"10M+","on_allowlist":true },
  "suspect": { "stores":["google_play"],"downloads":"500+","released":"6 days ago","icon_match_percent":93 },
  "description": { "overlap_percent":88, "snippet":"Secure mobile banking support from Acme Bank. Check balance, transfer funds and raise a support ticket.", "matched_phrases":["secure mobile banking","check balance","transfer funds"] } }
```
`publisher_differs` replaces the frontend's always-on banner (today shown even if the publisher matches).
`GET /api/detections/{id}/evidence/screenshot` [NEW] returns the stored image (auth). `GET /api/detections/{id}/evidence` [NEW] optional full bundle (URL, listing details, hashes).

### POST /api/detections/{id}/status  [NEW]  (four review buttons; person required, no auto takedown)
Request:
```json
{ "status": "confirmed", "note": "optional" }
```
`status` one of `reviewing` ("Keep reviewing"), `confirmed` ("Confirm impersonation" / "Confirm fake app"), `dismissed` ("Dismiss as false positive"). `new` cannot be set by a user. Response: updated detail object (7 above) plus `"audit_id": 123`. Writes an audit entry (`detection.status_changed`, target = handle or package id, detail `from -> to`) and updates dashboard counts. 409 if the detection is already `marked_official` and the transition is not allowed (define rule). Viewer role gets 403.

### POST /api/detections/{id}/mark-official  [NEW]  ("Mark as official")
Request `{ "note": "optional", "publisher": "Acme Bank Ltd" }` (publisher only used for apps; frontend defaults to 'Acme Bank Ltd'). Effects: detection `status = marked_official`; a new allowlist record is created (account for `social`: platform + handle + url from evidence, `status:"verified"`; app for `apps`: name, package_id, publisher, `stores:[platform]`). Response:
```json
{ "detection": { /* detail object */ }, "allowlist_entry": { "kind": "account", "id": 6 }, "official_assets": 8 }
```
Audit `detection.marked_official` + `account.added`/`app.added`. Future scans skip it (exact handle/package match).

Optional [NEW]: `POST /api/detections/{id}/reopen` (undo to `reviewing`); the UI has no undo today.

### GET /api/detections/excluded  [NEW]  ("Excluded as official")
Query `category=social|apps`. Matches the allowlist items that scans skipped, not scored:
```json
{ "items": [ { "kind":"account","platform":"instagram","label":"@acmebank on Instagram","status":"Official · not flagged","reason":"exact_handle" },
             { "kind":"app","label":"Acme Bank Mobile · com.acmebank.mobile","sub":"Acme Bank Ltd · Google Play, App Store","reason":"package_id_publisher" } ] }
```
Social page shows 5 (all accounts incl. YouTube); Apps page shows 2 (apps). Report stat "Official, excluded 7" = this total.

### GET /api/detections/false-positives  [NEW]  ("False-positive guard")
Query `category`. Look-alike names cleared automatically (never entered the queue):
```json
{ "items": [
  { "name":"Acme Bakery","platform":"facebook","kind":"page","category":"Bakery","logo_match_percent":6,"reason":"Different category, logo 6% match","status":"not_flagged","source":"sample" },
  { "name":"Acme Hotels","platform":"instagram","category":"Hospitality","logo_match_percent":4,"status":"not_flagged" },
  { "name":"@acme_weather","platform":"x","category":"Weather app","logo_match_percent":3,"status":"not_flagged" },
  { "name":"Acme Weather","package_id":"com.acme.weather","publisher":"Acme Corp","icon_match_percent":8,"description_match_percent":4,"status":"not_flagged" },
  { "name":"Acme Fitness Tracker","package_id":"com.acmefit.app","publisher":"Acme Fit Pvt Ltd","icon_match_percent":5,"description_match_percent":2,"status":"not_flagged" } ] }
```
UI shows the social ones on Social page, app ones on Apps page: filter via `category`.

---

## 8. Dashboard

### GET /api/dashboard  [CALLED by `dashboardApi` (orphaned, old shape); NEW shape needed by the live page] [EXISTS, old shape]
Query `brand_id`. Response:
```json
{
  "data_mode": "sample", "brand": {"id":1,"name":"Acme Bank"},
  "last_scan_at": "2026-10-12T11:58:00Z", "sources_online": 6, "sources_total": 8,
  "kpis": {
    "total_detections":      { "value": 11, "delta_week": 4, "trend": [4,6,8,7,9,10,11] },
    "social_impersonations": { "value": 6,  "delta_week": 2, "trend": [2,3,3,4,5,5,6] },
    "suspicious_apps":       { "value": 5,  "delta_week": 3, "trend": [1,2,2,3,3,4,5] },
    "official_assets":       { "value": 7 }
  },
  "by_type":     [ {"type":"fake_app","count":5,"percent":45}, {"type":"fake_profile","count":3,"percent":27}, {"type":"scam_account","count":2,"percent":18}, {"type":"fake_brand_page","count":1,"percent":10} ],
  "by_platform": [ {"platform":"google_play","count":3}, {"platform":"instagram","count":2}, {"platform":"x","count":2}, {"platform":"facebook","count":1}, {"platform":"telegram","count":1}, {"platform":"app_store","count":1}, {"platform":"third_party_apk","count":1} ],
  "needs_review": [ { "id":1,"name":"@acrne_bank_support","platform":"instagram","type":"scam_account","found_at":"2026-10-12T11:56:00Z","risk_band":"high" } ],
  "recent": [ { "id":1,"name":"@acrne_bank_support","summary":"“rn” reads as “m”, added word “support”","platform":"instagram","type":"scam_account","score":94,"status":"new","found_at":"2026-10-12T11:58:00Z" } ],
  "top_detection": { "id":1,"name":"@acrne_bank_support","platform":"instagram","score":94,"on_allowlist":false,"tags":["“rn” reads as “m”","Added word: support","Logo 91% match","Bio asks for KYC"] },
  "sources": [ {"id":1,"name":"Instagram","status":"online"}, {"id":4,"name":"Telegram","status":"slow"}, {"id":7,"name":"Apple App Store","status":"unavailable"} ]
}
```
Percentages sum 100 (45+27+18+10 in the PDF). "Recent detections" shows the first 6 (PDF). Donut center = `total_detections.value`. `by_platform` max for bar widths is computed by the UI (today hard-coded 4). `needs_review` relative time ("2 minutes ago") computed client-side from `found_at`. Dashboard click-through links to Social or Apps pass `?detection=<id>` (new UI behaviour).
Today's `GET /api/dashboard?brand_id=` response (`kpis[], states[], categories[], campaigns[], alerts[], recent[], ai_summary`) is the old product's and does not match.

---

## 9. Sources and Source Health

### GET /api/sources  [NEW]
```json
{
  "data_mode": "sample",
  "summary": { "online": 6, "slow": 1, "unavailable": 1, "total": 8, "next_scan_at": "2026-10-12T12:10:00Z", "schedule": "5m", "last_full_sync_at": "2026-10-12T12:05:00Z", "retry_policy": "1m,5m,15m,hourly" },
  "items": [
    { "id": 1, "slug": "instagram", "name": "Instagram", "kind": "social", "description": "Public profile and page search",
      "status": "online", "monitored": true, "message": "Working normally.", "last_sync_at": "2026-10-12T11:58:00Z",
      "checked": 214, "checked_unit": "profiles", "checked_of": null, "detail": "214 profiles checked", "retry_in_minutes": null, "stale_since": null, "source": "sample" },
    { "id": 4, "slug": "telegram", "name": "Telegram", "kind": "social", "description": "Public channels and groups",
      "status": "slow", "monitored": true, "message": "Rate limited. Partial results are kept. Retrying automatically in 4 minutes.",
      "last_sync_at": "2026-10-12T11:31:00Z", "checked": 41, "checked_of": 120, "detail": "41 of about 120 checked", "retry_in_minutes": 4 },
    { "id": 7, "slug": "app_store", "name": "Apple App Store", "kind": "store", "description": "Store search and listing details",
      "status": "unavailable", "monitored": true, "message": "The store could not be reached. Showing cached results from 9:40 AM. They are marked as stale on the app page.",
      "last_sync_at": "2026-10-12T09:40:00Z", "detail": "Cached results shown", "stale_since": "2026-10-12T09:40:00Z" }
  ]
}
```
Remaining seeded sources: facebook (96 pages checked, 11:55), x (138 profiles, 11:57), linkedin (22 pages, 11:50), google_play (310 apps, 11:58), third_party_apk (58 listings, 11:40, message "Working normally. Coverage is limited to known mirror sites."). `slug` equals the platform enum. Used by Dashboard mini card (first 6), Social sources bar (kind=social), Apps sources bar (kind=store), Source Health.
Query `kind=social|store` optional.

### POST /api/sources/{id}/retry  [NEW]  ("Retry now", shown when status is slow or unavailable; also the App Store "Retry" link)
Response 202:
```json
{ "job_id": "job_41aa", "source_id": 4 }
```
Poll `GET /api/jobs/{job_id}`; on done the source status/`last_sync_at`/`detail` update and an event is appended. 409 if source is not retryable (online) or a retry is running. In `sample` mode the retry may flip status per a script or stay the same.

### PATCH /api/sources/{id}  [NEW]  ("Monitor" checkbox)
Request `{ "monitored": false }` Response: the source object. Monitored sources are the ones scanned; this is the same switch as `Settings > monitored platforms` and they must stay in sync (today they are two separate local copies). Audit `source.monitor_toggled`.

### GET /api/sources/events  [NEW]  ("Recent source events")
Query `limit=5`.
```json
{ "items": [
  { "id": 1, "at": "2026-10-12T11:58:00Z", "source": "instagram", "message": "Instagram scan finished, 2 new detections", "level": "info", "data_source": "sample" },
  { "id": 2, "at": "2026-10-12T11:31:00Z", "source": "telegram",  "message": "Telegram rate limited, partial results kept", "level": "warning" },
  { "id": 3, "at": "2026-10-12T11:42:00Z", "source": "google_play","message": "Google Play scan finished, 1 new detection" },
  { "id": 4, "at": "2026-10-12T09:41:00Z", "source": "app_store",  "message": "Apple App Store unreachable, using cached results", "level": "error" },
  { "id": 5, "at": "2026-10-12T09:12:00Z", "source": null,         "message": "Brand profile saved, allowlist refreshed" } ] }
```
(In this object `source` is the platform slug, so the sample/live marker is named `data_source`.) Keep separate from the user audit log (section 12).

---

## 10. Look-alike Lab

### POST /api/lookalike/test  [NEW]  ("Test a name")
Request:
```json
{ "name": "acrnebank-refund", "brand_id": 1, "platform": null }
```
Server applies the Settings look-alike rules (section 11) and impersonation words, skips official handles/package IDs first, then evaluates. Response:
```json
{
  "input": "acrnebank-refund",
  "verdict": "flagged",
  "brand": "Acme Bank",
  "match_percent": 94,
  "headline": "Flagged as a look-alike of Acme Bank",
  "explanation": "This name matches the brand after normalization and is not on your allowlist. It goes to the review queue with these reasons.",
  "reasons": [ {"rule":"character_swaps","label":"Character swap (rn → m)"}, {"rule":"added_words","label":"Added word: refund"} ],
  "normalization": [
    { "step": 1, "label": "You typed", "value": "acrnebank-refund" },
    { "step": 2, "label": "Lower-cased", "value": "acrnebank-refund" },
    { "step": 3, "label": "Look-alike characters folded", "value": "acmebank-refund" },
    { "step": 4, "label": "Spaces and symbols removed", "value": "acmebankrefund" },
    { "step": 5, "label": "Brand and extra words", "value": "acmebank + refund" } ],
  "on_allowlist": false,
  "edit_distance": 0
}
```
`verdict`: `flagged | not_flagged | official`. For `not_flagged` the headline/explanation should say why (e.g. "Acme Bakery is three edits away" / "Extra word is not a known impersonation word"); for `official` it matched an allowlist handle/package (e.g. `Acme Bank`, `@acmebank`). Pure function, no side effects, safe to call on every keystroke with debounce; `name` max 200 chars, rate limited. Rules from the PDF: only one edit from the brand counts; extra words must be known impersonation words; official handles/package IDs skipped before name check; name alone never decides in real scans (logo, bio, publisher are scored too).

### GET /api/lookalike/test-cases  [NEW]
```json
{ "items": [
  {"id":1,"name":"acrnebank","expected":"flagged"}, {"id":2,"name":"Acme Bank Support","expected":"flagged"}, {"id":3,"name":"acme-bank","expected":"flagged"},
  {"id":4,"name":"A C M E Bank","expected":"flagged"}, {"id":5,"name":"acm3bank","expected":"flagged"}, {"id":6,"name":"Acme Bnak","expected":"flagged"},
  {"id":7,"name":"acmebank_official","expected":"flagged"}, {"id":8,"name":"Acme Bakery","expected":"not_flagged"}, {"id":9,"name":"Acme Hotels","expected":"not_flagged"},
  {"id":10,"name":"Acme Weather","expected":"not_flagged"}, {"id":11,"name":"Acme Bank","expected":"official"}, {"id":12,"name":"@acmebank","expected":"official"} ] }
```
Also `POST /api/lookalike/test-cases` `{ "name":"...","expected":"flagged" }` and `DELETE /api/lookalike/test-cases/{id}` [NEW, optional; the UI has no editor today].

### POST /api/lookalike/test-cases/run  [NEW]  (PDF: "Run on this page with the same logic as above")
Runs every case through the same engine as `/lookalike/test` with current rules.
```json
{ "total": 12, "passed": 12, "failed": 0,
  "items": [ { "id":1,"name":"acrnebank","expected":"flagged","result":"flagged","pass":true }, ... ],
  "ran_at": "2026-10-12T12:00:00Z" }
```
Drives "12 of 12 pass" and the table (currently hard-coded literals; there is no run button yet). Results must come from real evaluation, not echo `expected`.

---

## 11. Settings

### GET /api/settings  [NEW]   /   PUT /api/settings  [NEW]  (the page has no Save button today; one must be added)
Response and PUT body (PUT may be partial):
```json
{
  "data_mode": "sample",
  "monitoring": {
    "schedule": "5m",
    "sources": { "instagram": true, "facebook": true, "x": true, "telegram": true, "linkedin": true, "google_play": true, "app_store": true, "third_party_apk": true },
    "sensitivity": 75,
    "rules": { "character_swaps": true, "digits_and_symbols": true, "added_words": true, "spacing_and_separators": true, "transposed_or_missing": true },
    "impersonation_words": ["support","helpline","official","refund","rewards","kyc"]
  },
  "notifications": { "email_alerts": true, "high_risk_immediate": true, "weekly_digest": true, "webhook_url": "" },
  "account": { "organization": "Acme Brand Security Workspace", "user": { "name":"Harini","email":"admin@company.com","role":"admin" } },
  "updated_at": "2026-10-12T09:12:00Z"
}
```
Validation: `schedule` in `5m|15m|1h|1d`; `sensitivity` integer 50 to 95 (slider bounds; default 75); words lowercased, 1 to 30 chars, max ~50, no duplicates; webhook must be https URL or empty. Admin only. Audit `settings.updated` with changed keys. `data_mode` change (live/sample) is **admin only** and audited; it is a new control with no UI today (suggest a switch in Settings, Monitoring or Account tab). Notifications fields exist in the frontend store (`emailAlerts, highRiskImmediate, weeklyDigest, webhookUrl`) but the UI shows different labels ("risk scores above 85", "Daily digest at 9:00 AM", "Slack"); owner to reconcile. Old backend: `GET/PUT /api/settings/integrations` [EXISTS] is a different thing (third-party API keys).
Note: `sources` map here and `PATCH /api/sources/{id} {monitored}` are the same state.

### POST /api/settings/sensitivity-preview  [NEW]  (live text "11 of the 11 current detections would be sent to review at this level")
Request `{ "sensitivity": 75 }` Response `{ "would_review": 11, "total": 11, "message": "A balanced setting for most teams." }`. `message` suggestion by range (balanced around 75).

---

## 12. Reports and exports (CSV + printable HTML/PDF)

### GET /api/reports/preview  [NEW]  (right-hand "Brand Protection Report" card, honours the form filters)
Query: `from=2026-10-06&to=2026-10-12` (or `range=7d|30d|qtd`), `types=fake_profile,fake_brand_page,scam_account,fake_app` (comma list; omitted = all), `status=new|reviewing|confirmed` (optional; the form offers All, New only, Reviewing only, Confirmed only), `include_evidence=true`.
```json
{
  "title": "Brand Protection Report", "brand": "Acme Bank", "from": "2026-10-06", "to": "2026-10-12", "data_mode": "sample", "includes_sample": true,
  "stats": { "detections": 11, "social": 6, "apps": 5, "confirmed": 2, "official_excluded": 7 },
  "rows": [
    { "n": 1, "id": 1, "name": "@acrne_bank_support", "platform": "instagram", "type": "scam_account", "score": 94, "status": "new" },
    { "n": 2, "id": 5, "name": "Acme Bnak Mobile", "platform": "google_play", "type": "fake_app", "score": 93, "status": "confirmed" },
    { "n": 3, "id": 2, "name": "Acme Bank Support Help", "platform": "google_play", "type": "fake_app", "score": 91, "status": "reviewing" } ]
}
```
Rows sorted by score desc (PDF), `name` = handle for social, app display name for apps (PDF; the current UI prints package ids). The PDF's full 11-row order: 94, 93, 91, 91, 90, 89, 88, 87, 85, 82, 76.

### POST /api/reports  [NEW shape; old `POST /api/reports` EXISTS for investigations/campaigns]  ("Generate report")
Request:
```json
{ "from":"2026-10-06","to":"2026-10-12","types":["fake_profile","fake_brand_page","scam_account","fake_app"],
  "status":null,"include_evidence":true,"format":"pdf" }
```
Response 201:
```json
{ "id": 17, "filename": "acme-bank-detections-2026-10-12.pdf", "format": "pdf", "size_bytes": 244000, "created_by": "Harini",
  "created_at": "2026-10-12T12:03:00Z", "from":"2026-10-06","to":"2026-10-12","includes_sample": true,
  "download_url": "/api/reports/17/download", "preview_url": "/api/reports/17/preview", "source": "sample" }
```
Synchronous for small data; if long, return 202 with `job_id` (poll `/api/jobs/{id}`). Audit `report.generated`. CSV columns: `id,name,handle_or_package,platform,type,status,score,found_at,publisher,url,reasons` (+ `evidence_sha256,evidence_url,captured_at` when `include_evidence`).

### GET /api/reports  [NEW shape; list EXISTS]  ("Recent exports")
Query `limit=10`. Items as above (`filename`, `format`, `size_bytes`, `created_by`, `created_at`). PDF seed rows: `acme-bank-detections-2026-10-05.pdf` PDF 238 KB Harini 5 Oct; `acme-bank-weekly-2026-09-28.csv` CSV 12 KB Harini 28 Sep; `acme-bank-detections-2026-09-21.pdf` PDF 191 KB Harini 21 Sep (all `source:"sample"`).

### GET /api/reports/{id}/download  [NEW usage; EXISTS]  (button "Download")
Returns the file (`application/pdf` or `text/csv`, `Content-Disposition: attachment; filename="..."`). Frontend helper `downloadFile(path, filename)` sends the bearer token and uses `blob()`; error body must be JSON `{detail}`.

### GET /api/reports/{id}/preview  [CALLED by orphan ReportsApi (`getReportPreview`, `text:true`); EXISTS]
Returns printable HTML (`text/html`) of the saved report (A4 print CSS, header "Brand Protection Report", stats, table, evidence if included). The UI has no print button today; this is the "printable HTML" path (browser Print to PDF). Also `GET /api/reports/preview.html?<same query as /reports/preview>` [NEW] returns the same HTML for the unsaved form state.

Existing old-product report endpoints `POST /api/reports/{id}/approve`, `GET /api/campaigns/{id}/report` are not part of the PDF flow.

---

## 13. Audit log

### GET /api/audit  [NEW usage; EXISTS]  (no audit screen in the PDF; Settings > Account "Export Audit Log" button and the Login promise "Every review action is written to the audit log")
Query `from`, `to`, `actor`, `action`, `limit`, `offset`.
```json
{ "total": 5, "items": [
  { "id": 91, "ts": "2026-10-12T11:58:00Z", "actor": "Harini", "actor_id": 1, "action": "detection.status_changed", "target": "@acrne_bank_support", "detail": "new -> confirmed", "source": "sample" },
  { "id": 90, "ts": "2026-10-12T09:12:00Z", "actor": "Harini", "action": "brand.updated", "target": "Acme Bank", "detail": "allowlist refreshed" } ] }
```
`GET /api/audit/export.csv` [NEW] returns CSV (`ts,actor,action,target,detail`). Events to write (all produced by actions already in the UI): `auth.login`, `auth.logout`, `brand.updated`, `logo.replaced`, `account.added|removed`, `app.added|removed`, `detection.status_changed`, `detection.marked_official`, `scan.started|finished`, `source.retry`, `source.monitor_toggled`, `settings.updated`, `report.generated`, `data_mode.changed`. The frontend phrases used today: "Updated detection status to \"X\"", "Added to allowlist (marked official)", "Added official account", "Removed official account", "Added official app", "Removed official app". Append-only; viewers cannot read (admin and analyst only).

---

## 14. Evaluation (precision / recall)

**Not in the PDF and not in the frontend code today.** Requested for the build; proposed from data the app already has (reviewer decisions) and the Look-alike test cases.

### GET /api/evaluation  [NEW]
Query `from`, `to`, `type` (optional), `platform` (optional).
```json
{
  "data_mode": "sample", "period": { "from":"2026-09-13","to":"2026-10-12" },
  "reviewed": { "confirmed": 2, "dismissed": 1, "marked_official": 0, "pending": 8 },
  "detection": {
    "true_positives": 2, "false_positives": 1, "precision": 0.667,
    "definition": "precision = confirmed / (confirmed + dismissed)"
  },
  "lookalike_tests": { "total": 12, "passed": 12, "flagged_expected": 7, "not_flagged_expected": 3, "official_expected": 2,
                       "true_positives": 7, "false_negatives": 0, "false_positives": 0, "true_negatives": 3,
                       "precision": 1.0, "recall": 1.0, "ran_at": "2026-10-12T12:00:00Z" },
  "by_type": [ { "type": "fake_app", "confirmed": 1, "dismissed": 0, "precision": 1.0 } ],
  "by_threshold": [ { "sensitivity": 75, "would_review": 11, "precision": 0.667 } ]
}
```
Recall of live detection needs ground truth that does not exist in the app; only the Look-alike test cases (labelled) can supply recall unless a labelled set is added. Owner to confirm scope (see Open questions).
`POST /api/evaluation/run` [NEW] re-runs the look-alike suite and returns the same object (202 + job if slow).

---

## 15. Seed data to port from the frontend (`data/store.ts`) into the sample seeder

11 detections (`INITIAL_DETECTIONS`; all `source:"sample"`, brand Acme Bank):

| id | type | platform | name | handle / package | score | status | found (2026) |
|---|---|---|---|---|---|---|---|
| 1 | scam_account | instagram | Acme Bank Support Care | @acrne_bank_support | 94 | new | 12 Oct 11:58 |
| 2 | fake_app | google_play | Acme Bank Support Help | com.acme.support.help (Quick Tools Studio) | 91 | reviewing | 12 Oct 11:42 |
| 3 | fake_brand_page | facebook | Acme Bank Official Helpline | AcmeBankOfficialHelpline | 88 | reviewing | 12 Oct 10:55 |
| 4 | fake_profile | x | Acme Bank India | @acmebank.india | 91 | confirmed | 11 Oct 19:30 |
| 5 | fake_app | google_play | Acme Bnak Mobile | com.mobileappshub.acmebnak (Mobile Apps Hub) | 93 | confirmed | 11 Oct 16:12 |
| 6 | fake_profile | telegram | A C M E Bank | acme bank | 82 | new | 11 Oct 09:05 |
| 7 | scam_account | instagram | Acme Bank Rewards | @acme_bank_rewards | 90 | new | 12 Oct 08:30 |
| 8 | fake_app | third_party_apk | Acme Bank Mobile Lite | com.acme.bank.lite.apk (Unknown mirror) | 89 | new | 12 Oct 07:15 |
| 9 | fake_app | google_play | AcmeBank Rewards UPI | com.finrewards.acmebank (FinRewards Dev) | 87 | new | 11 Oct 23:20 |
| 10 | fake_app | app_store | Acme Bank KYC Update | com.kycupdate.acmeapp (App Utilities Lab) | 85 | new | 11 Oct 14:40 |
| 11 | fake_profile | x | Acme Bnk | @acmebnk | 76 | reviewing | 11 Oct 13:15 |

Each carries `reasons[]` with points summing to the score, `tags[]`, `evidence {url, timestamp, sha256}`, and per-type extras (`followers`, `joined`, `bioSnippet`, `logoMatchPercent` for social; `downloads`, `released`, `descriptionSnippet`, `descriptionKeywords`, `overlapPercent`, `iconMatchPercent` for apps). Full values in `frontend/src/data/store.ts` (`INITIAL_DETECTIONS`, `INITIAL_ACCOUNTS`, `INITIAL_APPS`, `INITIAL_SOURCES`, `INITIAL_AUDIT_LOG`, `INITIAL_SETTINGS`, `INITIAL_BRAND`). Note the frontend sample has det-4's mapping to "x" with type fake_profile and the dashboard donut count of 5 fake apps / 3 fake profiles / 2 scam accounts / 1 fake brand page, which matches this table.
Dates: the frontend seed is "12 Oct 2026" relative; the seeder should generate timestamps relative to "now" if the demo must look fresh.

---

## 16. Endpoint index

| Method and path | Screen | Frontend status | Existing backend router |
|---|---|---|---|
| POST /api/auth/login | Login | CALLED (live page) | auth |
| POST /api/auth/refresh | all | CALLED (client.ts) | auth |
| POST /api/auth/logout | Header | CALLED helper, not wired | auth |
| GET /api/me | all | CALLED (helper) | auth |
| POST /api/auth/forgot, /reset | Login (forgot link) | CALLED helpers, no UI | auth |
| POST /api/auth/register | Setup | NEW | auth (register) |
| GET /api/health | none | CALLED at import | admin |
| GET/POST /api/brands, GET/PUT /api/brands/{id} | Brand, Setup | NEW (list CALLED by orphan) | brands |
| POST/GET /api/brands/{id}/logo | Brand, Setup | NEW | none |
| GET/POST/DELETE /api/brands/{id}/accounts | Brand | NEW | none |
| GET/POST/DELETE /api/brands/{id}/apps, POST .../apps/import | Brand | NEW | none |
| POST /api/scan, GET /api/jobs/{id}, GET /api/scan/status | Dashboard, Social, Apps, Setup | NEW (exist, old use) | scan |
| GET /api/dashboard | Dashboard | CALLED by orphaned module, shape NEW | dashboard (old shape) |
| GET /api/detections, GET /api/detections/{id} | Social, Apps, Dashboard | NEW | investigations/entities (old) |
| POST /api/detections/{id}/status, /mark-official | Social, Apps | NEW | none |
| GET /api/detections/excluded, /false-positives | Social, Apps | NEW | none |
| GET /api/sources, PATCH /api/sources/{id}, POST /api/sources/{id}/retry, GET /api/sources/events | Sources, Dashboard, Social, Apps | NEW | none |
| POST /api/lookalike/test, GET/POST/DELETE /api/lookalike/test-cases, POST /api/lookalike/test-cases/run | Look-alike | NEW | none |
| GET/PUT /api/settings, POST /api/settings/sensitivity-preview | Settings | NEW | admin has /settings/integrations only |
| GET /api/reports/preview, POST /api/reports, GET /api/reports, GET /api/reports/{id}/download, /preview | Reports | list/preview/download CALLED by orphan module (old shape); rest NEW | reports (old shape) |
| GET /api/audit, GET /api/audit/export.csv | Settings > Account | NEW usage | admin (/audit) |
| GET /api/evaluation, POST /api/evaluation/run | none (no screen) | NEW | none |

### Existing `backend/app/routers` (names only, for reuse vs rebuild)
- `auth.py`: login, refresh, logout, register, forgot, reset, me
- `brands.py`: list, get, create, update, `/{id}/monitor` (old monitor page)
- `dashboard.py`: `/api/dashboard` (old shape)
- `scan.py`: `POST /api/scan`, `GET /api/jobs/{id}`
- `reports.py`: list, create, get, preview (HTML), download, approve
- `admin.py`: health, audit, settings/integrations, users
- `investigations.py`, `entities.py`, `evidence.py`, `campaigns.py`, `apps.py` (APK analyze), `watchlist.py` (+alerts), `simulator.py`: **old product only**, no PDF screen uses them.
Not present at all: accounts, official apps, logo upload, detections review actions, excluded and false-positive lists, sources and retry, look-alike lab, settings (monitoring), evaluation.

## 17. Open questions (owner decisions)

1. Reuse existing FastAPI app (and its DB, auth, jobs) and add the missing routers, or rebuild? Old-product tables (investigations, campaigns) are unused by the 10 screens.
2. `data_mode` semantics and who may toggle it; is sample the default for new orgs?
3. Risk-band thresholds (proposed 85 / 70).
4. Is an audit screen and an evaluation screen in scope? Neither is in the PDF.
5. Setup flow auth: register-first or open onboarding?
6. Detection id format and whether `marked_official` is reversible.
7. Evidence storage (screenshot capture method, hash of the image bytes) and retention.
8. Single brand per org (sidebar chevron implies switching).
9. Notifications: align the UI copy with the data model (`high_risk_immediate` threshold 85?, daily vs weekly digest, webhook).
10. Platform names for the wire enum (`app_store` vs source label "Apple App Store").
