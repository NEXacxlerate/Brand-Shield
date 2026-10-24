# Glossary

**Plain-language summary**

* This page defines the words BrandShield uses, in the sense the code uses them, with a pointer to where each one lives.
* Terms are grouped: what the product finds, how it matches, how it scores, where data comes from, who owns what.
* If a word here differs from everyday usage (for example "official" or "clean"), the code's meaning wins.

## Detecting and reviewing

| Term | Meaning in BrandShield | Where |
|---|---|---|
| Detection | A suspected impersonation stored for a person to review. Types: `fake_profile`, `fake_brand_page`, `scam_account`, `fake_app`, `lookalike_domain`; categories `social`, `apps`, `web`. Starts with status `new`; "a human must confirm every one". | `backend/app/models/detection.py:10-33` |
| Candidate | Raw material before scoring: something a collector found (a social profile, an app, a web page) or a person typed or imported. Becomes a detection if it scores high enough. Kinds: social, app, web. | `backend/app/core/collectors/base.py:1-6`, `backend/app/core/engine/models.py:34-60` |
| Candidate origin | Where a candidate came from: `scan` (a collector), `manual`, `import` (CSV/JSON) or `synthetic` (sample data). | `backend/app/models/detection.py:51-52` |
| Detection status | `new`, `reviewing`, `confirmed`, `dismissed`, `marked_official`, `cleared`. People can set `reviewing`, `confirmed`, `dismissed`; `cleared` (below threshold but near-name) and `marked_official` never appear in the lists. | `backend/app/models/detection.py:30-31`, `backend/app/services/detections.py:30-34` |
| Resolution | The outcome of an investigation, separate from status: `true_positive`, `false_positive`, `resolved`, `monitoring` (none recorded = null). Setting it writes a history event and an audit row. | `backend/app/models/detection.py:35`, `backend/app/services/detections.py:329-343` |
| Investigation | The review workflow around a detection: status, resolution, notes, event history, score history. | `backend/app/models/detection.py:84-98`, `frontend/src/pages/InvestigationsPage.tsx` |
| Stale | A cached copy of a candidate shown because the source was unavailable; it is not re-checked (for example by Safe Browsing). | `backend/app/models/detection.py:49`, `backend/app/core/pipeline/scan_pipeline.py:461-462` |
| Evidence | Page URL, capture time and SHA-256 of a saved snapshot (and optional screenshot) attached to a detection. | `backend/app/models/detection.py:44-45` |
| Report | A CSV or HTML export of detections (no PDF), prepared as a draft and approved by a person; nothing is sent. | `backend/app/models/ops.py:94-100`, `README.md` |
| Canary | A self-check that plants a fictional fake brand in an in-memory database and runs the real pipeline to prove name matching, allowlist and scoring still work. It makes no network calls. | `backend/app/api/health.py:43-49`, `backend/scripts/canary.py` |

## Brand assets and exclusion

| Term | Meaning | Where |
|---|---|---|
| Brand | What an account protects: name, aliases, keywords, domains, logo. An account may own several (max 10, archived ones excluded). | `backend/app/models/brand.py:10-40`, `backend/app/api/brands.py:46,145-146` |
| Official asset | Something that really belongs to the brand: an official social account (platform and handle), official app (package id, store ids, publisher), official domain, or logo. Verified assets record a verification state. | `backend/app/models/brand.py:43-125` |
| Allowlist | The exact-match set built from official assets. Matching candidates are dropped before scoring and listed as "Excluded as official". Never excludes by name alone. Handles are compared without `@` and in lower case. | `backend/app/core/engine/allowlist.py:1-30`, `backend/app/models/detection.py:56-62` |
| Marked official | A reviewer's decision that a detection is actually the brand's own asset (status `marked_official`). | `backend/app/services/detections.py:31` |
| Brand registry | The Brand Registry page and `/brand` route where official assets are managed. | `frontend/src/App.tsx:107-115`, `frontend/src/components/layout/Sidebar.tsx` |
| Active brand | Which of an account's brands the user is currently working on; stored on the user and revalidated on every read. Switch via `POST /api/brands/{id}/select`. | `backend/app/models/user.py:21`, `backend/app/api/brands.py:129-150`, `backend/alembic/versions/0012_active_brand.py:1-6` |

## Matching and look-alikes

| Term | Meaning | Where |
|---|---|---|
| Look-alike | A name, handle or domain deliberately close to the brand's. Techniques named by the matcher: homoglyph, digit or symbol swap, character swap, missing or extra letter, transposition, spacing or separator, added word. | `backend/app/core/engine/name_match.py:56-75`, `backend/app/core/engine/synthetic.py:1-25` |
| Look-alike Lab | The page with a name tester, test cases per brand, and logo comparison. | `frontend/src/pages/LookalikeLabPage.tsx`, `backend/app/api/lookalike.py` |
| Homoglyph | A character that looks like another: Unicode look-alikes, fullwidth forms, accented letters, plus folding of `0/o`, `1/l`, `3/e`, `rn/m`, `vv/w`. Flag `F_HOMOGLYPH`. | `backend/app/core/engine/normalize.py:12`, `backend/app/core/engine/name_match.py:17` |
| Punycode | The ASCII form (`xn--...`) of an internationalized domain name. The code keeps both forms: ASCII for comparison and Unicode for display and homoglyph checks. | `backend/app/core/engine/domain_match.py:7,197-214` |
| IDN homograph | A domain mixing scripts or using look-alike letters from other alphabets; worth up to 15 points. | `backend/app/core/engine/domain_match.py:39,348` |
| Registrable domain | The part of a host you can register: `label.public-suffix`, found with `tldextract` and its bundled public suffix list (`shop.acme-bank.co.uk` gives `acme-bank.co.uk`). Official-domain exclusion and look-alike comparison use it, so a subdomain on an official domain is not a look-alike. | `backend/app/core/engine/domain_match.py:5-12,220` |
| Brand in subdomain | A deceptive host such as `acme.evil.com`; up to 20 points. | `backend/app/core/engine/domain_match.py:39` |
| Added words | Extra words next to the brand name. Strong scam words (`STRONG_SCAM_WORDS`) and impersonation words ("support", "kyc"; `IMPERSONATION_WORDS`) add points only when the name already matched. | `backend/app/core/engine/vocab.py:4,14,61`, `backend/app/core/engine/scoring.py:150-162` |
| pHash / dHash / wHash | Perceptual image hashes. Logo similarity is 0-100 from pHash and dHash by default (algorithm `image-1`); `multihash` adds wHash (`image-2`: 0.4 pHash, 0.3 dHash, 0.3 wHash). "Likely copy" starts at 80, "similar" at 55. A hint, not proof of reuse. | `backend/app/core/engine/logo_similarity.py:1-32`, `backend/app/core/engine/image_hashes.py:1-14` |
| CLIP | An optional AI vision model (via `fastembed`, model `Qdrant/clip-ViT-B-32-vision`, ~336 MB download) used by the Look-alike Lab logo tester when installed (`LOGO_COMPARE_CLIP=auto`). Scans use hashes unless `IMAGE_SIMILARITY_BACKEND=clip`. Not available on Vercel. | `backend/requirements-extra.txt`, `backend/app/config/config.py:79-83` |
| Safe Browsing | Google's URL reputation service (Lookup API v4). Candidate URLs are sent to Google, never opened. Verdicts: `match`, `clean` (not a safety guarantee), `unknown`, `failed`; the last two reach the engine as `unavailable`. Needs `GOOGLE_SAFE_BROWSING_API_KEY`; non-commercial terms. | `backend/app/core/providers/safe_browsing.py:1-17`, `backend/app/core/providers/base.py:19-22` |
| SSRF guard | Every outbound fetch using a URL from data resolves DNS and refuses private, loopback, link-local and metadata addresses, limits redirects, size and content type. | `backend/app/core/pipeline/url_safety.py`, `backend/app/core/pipeline/image_fetch.py` |

## Scoring

| Term | Meaning | Where |
|---|---|---|
| Score | 0-100 integer for a candidate; every point comes from a `Reason` with signal name, points, maximum and a note, so every score is explainable. Social maxima: name 34, logo 28, added words 12, bio 28, account 18. App maxima: name 24, icon 30, publisher 22, description 17, store 10. | `backend/app/core/engine/scoring.py:34-35,48-55` |
| Signal | A scoring input with status `present`, `clean` or `unavailable` and a provenance. | `backend/app/core/engine/risk_engine.py:70-90` |
| Score band | The older three-way label stored in `Detection.band`: `high` 85+, `medium` 70-84, `low` below 70. | `backend/app/core/pipeline/bands.py:1-11`, `backend/app/models/detection.py:25` |
| Severity | The newer four-way label `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`, stored beside the band. Default cutoffs: MEDIUM 40, HIGH 70, CRITICAL 85 (`SEVERITY_MEDIUM_MIN`, `SEVERITY_HIGH_MIN`, `SEVERITY_CRITICAL_MIN`). | `backend/app/core/engine/risk_engine.py:47-68`, `backend/app/config/config.py:166-168` |
| Algorithm version | `1.0` for social and app scoring, `2.0` for web scoring. | `backend/app/core/engine/risk_engine.py:36-37`, `backend/app/models/detection.py:28` |
| Provenance | A label on each signal telling where it came from: `real_api` (live external answer), `local_algorithm` (deterministic code here), `pretrained_model`, `synthetic` (sample data, "not real evidence"). | `backend/app/core/providers/base.py:10-15` |
| Threshold / sensitivity | The score above which a candidate becomes a detection; adjustable in Settings and previewed with "would review" counts. | `backend/app/api/settings.py:206` |
| Prefilter | Skips logo and AI-text steps for candidates with no name signal and no keyword hit (`SCAN_PREFILTER`). | `backend/app/config/config.py:115` |
| Model Evaluation | Admin page that measures the name matcher on synthetic mutations and hard negatives; "NOT ground truth for real-world attackers". | `backend/app/core/engine/synthetic.py:1-8`, `backend/app/api/evaluation.py` |

## Data sources and modes

| Term | Meaning | Where |
|---|---|---|
| Collector | A class that fetches raw results from one provider and returns candidates; raises only `SourceUnavailable`. Live chain: Tavily, SearXNG (optional), iTunes, Google Play (optional); plus a sample collector. | `backend/app/core/collectors/base.py:179-196`, `backend/app/core/collectors/selection.py:27` |
| Source / Source Health | A platform row (instagram, facebook, x, telegram, linkedin, google_play, app_store, third_party_apk) with state and reasons such as `no_key`, `rate_limited`, `timeout`. Shown to admins on Source Health. | `backend/app/core/collectors/base.py:28`, `frontend/src/pages/SourceHealthPage.tsx` |
| Data mode | Setting with values `live`, `sample`, `auto` (default). `sample` uses fictional data and the "Sample data" badge; `live` queries real sources; `auto` is live only when a Tavily key, SearXNG URL or the google-play package is configured (iTunes alone does not count). Admin only. | `backend/app/services/data_mode.py:9-11`, `backend/app/core/collectors/selection.py:77-97` |
| Effective mode | What the data mode resolves to right now (`live` or `sample`). | `backend/app/services/data_mode.py:34-38` |
| Sample data | Fictional detections for a demo; flagged `source = "sample"`; never sent to Safe Browsing. | `backend/app/models/detection.py:50`, `backend/app/core/pipeline/scan_pipeline.py:457-460` |
| Credits | Tavily's monthly budget (`TAVILY_MONTHLY_BUDGET`, default 900 of the free 1000) counted in the ledger; one scan costs up to `TAVILY_MAX_QUERIES_PER_SCAN` (12). Studio and Safe Browsing have separate usage counters in `api_usage`. | `backend/app/config/config.py:92-93`, `backend/app/core/collectors/credits.py` |
| Scan | One run: collect, de-duplicate, allowlist, name match, logo and text signals, score, save. One queued or running scan per brand is enforced by the database. | `backend/app/models/ops.py:53-58`, `backend/app/core/pipeline/scan_pipeline.py` |
| Scan executor | How scans run: `auto` (RQ if `REDIS_URL`, else thread), `rq`, `thread`, `inline` (tests, Vercel). | `backend/app/config/config.py:111` |
| Scheduler / cron | Automatic scans: an in-process loop (one process only) or Vercel Cron calling `GET /api/cron/scan`. | `backend/app/services/scheduler.py:147`, `backend/app/api/cron.py` |
| Text provider | Optional hosted AI text analysis of bios and descriptions (`gemini`, `huggingface`, `local`, `off`); off by default so no candidate text leaves the server. | `backend/app/config/config.py:66-69`, `backend/app/api/providers.py` |

## Accounts, ownership and access

| Term | Meaning | Where |
|---|---|---|
| Tenant / owner | Each account owns its own brands; the brand's `owner_id` links to the user. Another account's brand, detections, reports, logos and evidence answer 404. (Settings, data mode, source health and credit counters are shared.) | `backend/app/models/brand.py:14`, `backend/tests/api/test_tenant_isolation.py` |
| Role | `admin` (settings, data mode, health details, canary, Source Health, Evaluation), `analyst` (review and scan; self-registered and demo accounts), `viewer` (read-only). | `backend/app/config/deps.py:46-57`, `backend/app/api/auth.py:114` |
| Demo account | A public shared analyst account from `DEMO_EMAIL` / `DEMO_PASSWORD`, advertised by a button on the login page. Both must be set. | `backend/app/config/config.py:47-48`, `backend/app/services/seed.py` |
| Demo administrator | A second public, guarded admin from `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD`: cannot select live or auto data, change the AI provider, see other accounts' audit rows or set the webhook (403 "Disabled for the shared demo administrator"). | `backend/app/services/seed.py:113-116`, `backend/app/api/settings.py:130-140` |
| Access / refresh token | JWT pair: access lasts 15 minutes, refresh 7 days; refresh tokens are stored server-side and rotated on each use; reusing a rotated one revokes all of that user's refresh tokens. Stored in browser `localStorage` under `scammind.auth` and `scammind.user`. | `backend/app/config/config.py:42-43`, `backend/app/api/auth.py:127-158`, `frontend/src/api/client.ts:57-58` |
| Audit log | Record of who did what (for example `detection.resolution_set`, `settings.data_mode_changed`, `health.canary`). | `backend/app/services/audit.py`, `backend/app/api/audit.py` |

## Apps and surfaces

| Term | Meaning | Where |
|---|---|---|
| Brand Studio | A separate React app at `/studio/` (naming, logos, palettes, copy) sharing the BrandShield login and registering brands in BrandShield. | `studio/vite.config.ts:11`, `docs/STUDIO.md` |
| Studio AI proxy | Server endpoints (`/api/studio/ai/*`) that call Groq or Gemini (chat) and Pollinations (images) so no provider key reaches the browser. | `backend/app/services/studio_ai.py:1-8`, `backend/app/api/studio_ai.py` |
| Voice agent | A signed-in microphone assistant: simple commands run locally, other sentences use Gemini function calling via `POST /api/voice`. Chrome or Edge only. | `backend/app/services/voice.py`, `frontend/src/hooks/useVoiceAgent.ts` |
| `data-voice` | HTML attribute naming a field the voice agent may fill. | `frontend/src/components/layout/Sidebar.tsx:49` |
| Migration | An Alembic script that changes the database schema; numbered `0001` to `0012`. | `backend/alembic/versions/` |
| Worker | The RQ process that runs scans when Redis is configured (`python -m app.worker`). | `backend/app/worker.py` |
