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
