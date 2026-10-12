# Decisions (defaults chosen because the owner did not answer; change any of them)

| # | Decision | Notes |
|---|---|---|
| 1 | Rebuild from scratch in `server/` | Old `backend/` (investigations/campaigns product) is untouched and unused. |
| 2 | Keep old `backend/` and the 9 orphaned frontend pages for now | Revisit later; nothing in `server/` imports them. |
| 3 | Real login errors, no offline bypass | Frontend change (LoginPage / RequireAuth) is Phase 5. The API already returns 401 `Incorrect email or password`. |
| 4 | `/setup` requires admin login first | No public `POST /api/auth/register` is built. The first admin is seeded from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. |
| 5 | Data mode setting `live \| sample \| auto`, default `auto`, in `settings`, admin-only to change | API.md only lists `live \| sample`; `auto` is an addition. Endpoint comes in a later phase. Records carry `source` = `live` or `sample`. |
| 6 | Risk bands: 85+ high, 70-84 medium, below 70 low | `app/services/bands.py`. |
| 7 | Audit log and evaluation endpoints are in scope | Audit writer + `GET /api/audit` (+ `export.csv`) in Phase 1; evaluation later. |
| 8 | One brand per organisation for now | `brands` is still a table; `POST /api/brands` returns 409 if one exists. |
| 9 | Evidence = SHA-256 of the saved snapshot; screenshots off by default | Stored in `detections.evidence` JSON. |

## Additional Phase 1 choices (flagged for review)

- Logo formats are PNG, JPEG, WebP (API.md said PNG/SVG). SVG is refused on purpose: it can carry script. Min 256 px both sides, aspect 0.8 to 1.25, max 2 MB, re-encoded on save (strips metadata and appended bytes).
- Handle rule is 3 to 30 of letters, digits, dot, underscore (stricter than API.md examples): LinkedIn company slugs with hyphens or slashes (`company/acme-bank`) are rejected for now.
- Account `handle` is stored bare and returned in display form (`@` prefix for instagram, x, youtube) as in API.md; `url` has no scheme as in API.md.
- A failed reachability check never blocks adding an account: it is saved with `status: "unreachable"` and a `warning` text.
- Refresh tokens are tracked server-side (table `refresh_tokens`), rotated on use; re-using a rotated token revokes all of that user's refresh tokens.
- Login is rate limited in memory (5 failures per email+IP per 15 minutes -> 429). Single process only until Redis arrives.
- Passwords are hashed with bcrypt (72-byte limit enforced at the schema).

## Phase 2 choices (detection engine, flagged for review)

- Engine lives in `server/app/engine/` with no FastAPI/SQLAlchemy/network imports. It only scores; every detection comes out as `status="pending_review"`.
- Allowlist is exact handle / profile URL / package id / App Store id only, checked before scoring. A mirror-site listing (APKPure etc.) of the official package id is NOT official. The brand's exact name never excludes a candidate.
- Verdicts: `flagged` (impersonation likely), `brand_name` (uses the exact name; may be the brand or an impersonator), `review` (uncertain, human look), `safe`. Only `flagged`/`brand_name` get full name points; `review` gets half.
- Why "Acme Bakery/Hotels/Weather" are not flagged: a hit needs the full brand token (or one edit of it with every leftover piece explained by known words). Partial matches on the first word are `safe`, or `review` if the rest is an impersonation word ("Acme Support"). A word list of benign trailing words exists only as a supplement (`BrandProfileInput.extra_benign_words`).
- Edit tolerance is only applied to brand tokens of 5+ letters (two edits: 8+). Typos of very short brands (e.g. "Zoho") are not detected by design; exact, look-alike and combo forms are.
- A one-letter change that yields an ordinary dictionary word ("Acme Bark") is `review`, not `flagged`.
- A leading `@` is treated as a handle prefix and stripped, so `@cmebank` reads as "missing letter", not "a" via symbol swap.
- Logo thresholds (synthetic shape logos, not real brands): >= 80 likely copy, >= 55 similar, below 55 no points. Colour-inverted logos score ~0. Re-tune on real labelled data.
- Score model: reasons sum to `raw_total`; per-category caps are applied inside the reasons; the 100 cap is applied last (`capped` flag). Publisher-difference counts only with another brand signal; 22 when the publisher name resembles the brand, else 20.
- LLM scam-intent check: setting `scam_llm_enabled` (default false) and `scam_llm_model` (default `claude-haiku-4-5`, please confirm the model id you want). Not wired into any endpoint yet.
- Ruff: `E501` is ignored in `app/engine/*` and `scripts/*` (regex and word tables).


## Phase 3 choices (collectors, flagged for review)

- **Collectors are providers; `sources` rows are platforms.** A collector (tavily, searxng, itunes, google_play, sample) declares the platforms it covers. A platform is `online` if any covering collector works, `slow` if only slow/partial ones do, else `unavailable`. Per-collector health, back-off and the last good result live in a new table `collector_state` (migration 0002).
- **Auto mode ignores iTunes.** iTunes needs no key, so on its own it does not turn `auto` into `live`; a fresh install must not query real stores for a demo brand. `auto` = live when a Tavily key, a SearXNG base URL or the google-play package is present. Explicit `live` still runs iTunes.
- **Live mode without a key shows honest gaps.** Tavily stays in the live chain and reports `unavailable (no_key)`; sources are never filled with sample data in live mode.
- **Back-off** 1 m, 5 m, 15 m, 1 h, 6 h (capped), reset on success; a provider `Retry-After` (capped at 24 h) wins. Local-config problems (`no_key`, `not_installed`, `not_configured`, `unsafe_base_url`) are re-checked on every scan, not backed off. `invalid_key` is backed off like other failures; a manual retry (the retry button) ignores back-off.
- **Tavily credits:** budget guard is atomic (`UPDATE ... WHERE credits + cost <= budget`), basic = 1, advanced = 2. 4xx answers (401/429/432/433) are refunded because they are not billed; 5xx and timeouts keep the reservation (they may have been billed). The guard uses the larger of our counter and Tavily's reported `usage.credits`. Default budget 900 of the 1000 free credits. Default per-scan cap 12 queries.
- **Partial results are kept:** if a later query of a scan is rate limited, out of budget or fails, earlier results are returned and the source shows `slow` with a note.
- **Tavily uses `include_domains` for the platforms still monitored**, quoted queries with `exact_match`, brand x (support, official, helpline, rewards), aliases/keywords, then look-alike variants (same techniques as the Phase 2 synthetic generator).
- **SearXNG SSRF:** the operator-set base URL must resolve to public addresses (reusing `url_safety.validate_public_url`) unless `SEARXNG_ALLOW_PRIVATE_HOSTS=true`. No DNS pinning is applied to it (operator configuration, not user input).
- **Result URLs are never fetched by default.** Collectors only read provider responses. Optional reachability checks (`REACHABILITY_CHECKS_PER_SCAN`, default 0) go through the SSRF-safe `UrlChecker`.
- **Google Play** goes through an optional, lazily imported package (`google-play-scraper`), not installed, not in requirements. It scrapes Play pages (unofficial; terms-of-use risk and license are unverified). Without it the source reports `not_installed`.
- **Sample collector** carries `source="sample"` on every candidate and `extras.sample_role` (`official_echo`, `lookalike`, `hard_negative`) so tests and the evaluation can check the engine; the role is ground truth, not a score.
- **Retry endpoint is synchronous** in Phase 3 (returns 202 with the result); Phase 4 makes it a job.
- **Settings:** `env_ignore_empty=True`, so `NAME=` left blank in `.env` (as in `.env.example`) means "not set" instead of a parse error. Tests ignore `server/.env` and block real network/DNS access.
- Audit actions added: `source.monitor_toggled`, `source.retry`, `settings.data_mode_changed`.

## Phase 4 choices (scan pipeline, jobs, screens API; flagged for review)

**Detection rules**
- **Detection rule:** a candidate becomes a detection when it has evidence tied to THIS brand (name, logo/icon or description overlap scored above 0) AND either its score reaches the threshold or the engine flagged its name outright. Account/store oddities alone (young account, unverified, few posts) never make a detection. Threshold = `100 - sensitivity` (sensitivity 50 to 95, default 75, so threshold 25). A flagged name always goes to review; the slider moves the bar for weaker evidence only. This is my design: please confirm.
- **Cleared (false-positive guard):** below threshold but the name partly resembles the brand (verdict not `safe`, or name match >= 25%, which includes "Acme Bakery") is stored with `status="cleared"`. Cleared rows never appear in detection lists, counts or reports; they feed `/detections/false-positives`.
- **Prefilter** (`SCAN_PREFILTER`, default on): no name signal and no brand keyword/domain hit means the candidate is dropped before the logo download and the optional AI check. Trade-off: a logo copy with a completely unrelated name is not found.
- **Human decisions survive re-scans:** `reviewing`, `confirmed`, `dismissed`, `marked_official` are never changed by a scan. A re-scan only updates `last_seen_at`, the score history, evidence (a new snapshot only when the content changed) and, when the score moved by 10 points or more, adds a system note (no reopening). Untouched `new` / `cleared` rows are re-scored and can move between `new` and `cleared` (history event written).
- **Allowlist wins everywhere:** a scan that meets an exact official handle/URL/package/bundle id records an `official_matches` row (reason, matched rule, times seen) and closes any existing detection for it as `marked_official`. Adding an official account/app (Brand Profile page) does the same immediately.
- **Status vocabulary:** wire values stay `new | reviewing | confirmed | dismissed | marked_official` (plus internal `cleared`). "Keep reviewing" = `reviewing` (`keep_reviewing` is accepted as an alias). `marked_official` is not reversible through the API (remove the asset from the allowlist yourself); a decided detection can be moved between reviewing/confirmed/dismissed.
- **Mark as official limits:** only Google Play / App Store apps (a third-party APK listing is never official) and handles up to 30 characters (allowlist column size). Telegram is accepted for mark-official although the Brand Profile form does not offer it yet.
- **Scan statuses:** `queued | running | completed | partial | failed` (column `scans.state` keeps its name; the API also returns the old job vocabulary `state: queued|running|done|error`). `partial` = at least one source unavailable or returned partial results. `failed` = an internal crash, or EVERY active source unavailable with nothing (not even cached results) to analyse. A queued/running scan older than `SCAN_STALE_MINUTES` (30) is failed automatically so scans can start again.
- **One scan per brand:** the second start returns 409 with the running scan (`job_id`, `scan`). Enforced in the application (check then insert), not by a database constraint: two requests in the same millisecond on different servers could both pass. Acceptable for one brand/one API process; revisit with a partial unique index on Postgres.
- **Evidence:** snapshot = canonical JSON of the candidate (fetch time excluded), stored at `DATA_DIR/evidence/<sha[:2]>/<sha>.json`, so identical content is stored once. The endpoint re-hashes the file and reports `hash_verified`. Screenshots: hook only (`SCREENSHOTS_ENABLED`, Playwright not installed, not tested live).
- **Logo fetch:** result URLs go through the new `services/image_fetch.py` (same SSRF rules as `url_safety`, plus size/type/magic checks, 25 downloads per scan). Only for live candidates with an icon URL; sample data never triggers a download. Any failure is recorded as "Logo unavailable: <why>" and the candidate continues. Result pages are NOT fetched (no og:image scraping): only the image URL a source supplies.
- **Optional AI text check** runs only when `SCAM_LLM_ENABLED=true` AND `ANTHROPIC_API_KEY` is set; never for sample data; failures are skipped silently (counted). When enabled without a key the scan records a note.

**Jobs and scheduler**
- `REDIS_URL` set: RQ queue `scans` (`python -m app.worker`, SimpleWorker on Windows). Unset: in-process thread. If Redis is unreachable when queuing, the scan falls back to a thread (logged). `SCAN_EXECUTOR=inline` runs synchronously (tests).
- Scheduler: in-process loop started by the app lifespan unless `APP_ENV=test` or `SCHEDULER_ENABLED=false`. Interval = `SCAN_INTERVAL_MINUTES` (env wins, `0` = off) else the Settings schedule (`off|5m|15m|1h|1d`, default `1d`; "off" is an addition to API.md). With several API processes each runs a loop; the one-running-scan rule and the "last scan" check keep it to one scan, but run the scheduler in one process only.
- **Credit-aware rule** (pure function `decide_schedule`, only when Tavily is in the live chain): cost per scan = max queries x credits per query (12 x 1). Keep one scan's worth in reserve for manual scans. If less than one scan remains above the reserve, scheduled scans pause until the 1st of next month. Otherwise the interval is stretched to `days_left x 24h / affordable_scans` if that is longer than the configured one (so "hourly" with 900 credits becomes about every 6 hours at mid-month). Manual scans are never blocked by this rule, only by the hard Tavily budget guard.
- Notifications (email, high-risk alert, weekly digest, webhook) are stored preferences only: **nothing is sent**. `GET /settings` says `delivery: "not_implemented"`. Webhook URLs are shown to admins only (they often contain a secret token).

**Screens**
- Lists default to the current effective data mode (`sample` shows only sample rows, `live` only live rows); `source=all` or `source=sample|live` overrides. Every list/aggregate carries `data_mode` and `is_sample`.
- Look-alike lab: `official` = exact allowlisted handle/package, OR the typed text is exactly the brand name/alias (`official_basis: "name"`, with the reminder that real scans never exclude by name). `review` verdicts are shown as `not_flagged` (with `engine_verdict`). Settings rules switch off techniques: a flagged name whose techniques are all off becomes `review` in the lab and in scans. The 12 default cases are written for "Acme Bank" and seeded once (an admin's deletions are respected).
- Reports: created as DRAFT from `detection_ids` or, by default, the confirmed detections; the rows are snapshotted. Formats are `csv` and `html` (printable, browser Print to PDF). **No PDF**: no PDF library is installed and none was added. Approving is a person's action (audited). Nothing is sent anywhere.
- Evaluation: synthetic numbers (5 built-in brands, seed 7) cached in memory per process and labelled optimistic; real precision only from reviewer decisions (confirmed / (confirmed + dismissed)); recall of real detections cannot be measured.
- Audit actions added: `scan.started`, `scan.finished`, `detection.status_changed`, `detection.marked_official`, `report.generated`, `report.approved`, `settings.updated`, `lookalike.case_added`, `lookalike.case_removed`, `lookalike.cases_run`, `evaluation.run` (plus the existing `account.added`, `app.added`, `source.monitor_toggled`, `settings.data_mode_changed`). `scan.started`/`finished` by the scheduler carry actor `scheduler`.
- Migration `0003_scan_pipeline` (SQLite batch mode, also written for PostgreSQL but **not run on Postgres**).
