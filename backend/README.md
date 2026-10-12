# ScamMind AI backend

FastAPI + SQLAlchemy 2 + Alembic API behind every page of the ScamMind AI React app. The detection engine is ported from
**TrustMesh** (`trustmesh.zip`): the algorithms, weights and reasons are unchanged. Every score is a sum of listed signals and every
signal carries its reason. A human approves every takedown.

```
backend/
  app/
    engine/      ported TrustMesh code (pure functions, no database): similarity, detectors, ids, analysis, live, explain, seed_data
                 plus new pure modules: layout (deterministic force layout), evolution (growth + simulator), dna, ssrf
    services/    persistence and orchestration around the engine (analysis, scan, investigations, reports, watchlist, dashboard, ...)
    routers/     the HTTP API (one file per area), every route has a Pydantic response model (app/schemas.py)
    models.py    SQLAlchemy models        jobs.py  APScheduler jobs        security.py  bcrypt, JWT, roles, rate limiting
  alembic/       migrations (0001 creates the schema; applied automatically on start-up)
  tests/         117 pytest tests
```

## Run

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate          # source .venv/bin/activate on macOS/Linux
pip install -r requirements-dev.txt
cp .env.example .env                                     # set SECRET_KEY and ADMIN_PASSWORD
uvicorn app.main:app --reload                            # http://127.0.0.1:8000/docs
pytest                                                   # all tests must pass
```

Everything together (API on :8000, frontend on :5173): `docker compose up --build` from the repository root.
Sign in as **Harini** (`ADMIN_EMAIL`, default `admin@company.com`) with `ADMIN_PASSWORD`.

`DATABASE_URL` switches the database (SQLite file in `DATA_DIR` by default; for Postgres install `psycopg[binary]` and use
`postgresql+psycopg://...`). WeasyPrint needs Pango/Cairo for PDFs (the Dockerfile installs them; on Windows install the GTK runtime).
Without them `GET /api/reports/{id}/download` answers 503 for PDFs while the HTML preview and JSON reports keep working.

> `backend/main.py` is the earlier mock API that predates this service. It is not used (`uvicorn app.main:app` is the entry point).

## What is real and what is sample

| Real (runs on any input) | Sample (synthetic, flagged `sample: true`) |
|---|---|
| Name similarity (homoglyphs, Damerau-Levenshtein), TF-IDF scam-wording match, 64-bit dHash logo matching | **Social profiles** of the demo brand (platforms do not allow free scraping; the `SampleConnector` is the plug-in point for an official-API or licensed-feed connector) |
| Identifier extraction (phones, UPI IDs, Telegram, emails, domains, signing certs) | Websites and app metadata of the demo brand Acme Bank (fictional) |
| Scoring (signal points, capped 0 to 100), severity bands, stages, union-find campaign clustering, Attack DNA, attack path | **Seeded history**: 2,487 investigations, state counts, category split, weekly KPI trends, weekly activity, a few synthetic alerts (all `source=sample` / `is_sample=true`) |
| Look-alike domain generation + **live DNS A/MX, RDAP, crt.sh, SSRF-safe page fetch** (`POST /api/scan` with `mode: "live"`, deep investigations, watchlist checks) | Demo-entity regions (`state_code`) come from analyst notes in the demo data. Phone numbers and IPs are never geolocated |
| **APK parsing** (androguard): package, version, developer, signing certificate SHA-256, permissions, URLs in strings, icon hash | |
| Forecast and blast radius (labelled as estimates), what-if simulator (the drop % is the user's assumption, and says so) | |
| Evidence storage with SHA-256 and chain of custody, reports (HTML, PDF via WeasyPrint, full JSON), audit log, auth and roles, background jobs | |
| Optional LLM rewrite of summaries (any OpenAI-compatible endpoint). **Not tested against a real key**; it always falls back to the rule-based text | |

Dashboard numbers are the seeded history plus whatever real work was added since (non-sample entities, investigations created by users),
so on a fresh demo they read exactly 2,487 / 326 / 1,092 / 4,586 and the state and category splits in the brief.

## Roles

| Role | Can |
|---|---|
| viewer | read everything except the audit log, users and integrations; run the (read-only) simulator |
| analyst | + investigate, upload evidence/APKs, confirm/dismiss/reopen entities, confirm campaigns, create and **approve** reports, manage the watchlist, run scans, mark alerts read, read the audit log |
| admin | + users, brands (create/update, logo upload), integrations |

Roles come from the database on every request (not from the token), so a demoted or deactivated user loses access immediately.
Every write is recorded in the `audit` table. Login is limited to 5/min, investigations 30/min, uploads 10/min.

## The human stays in control

* `POST /api/reports` only creates a **draft**. `POST /api/reports/{id}/approve` is the single code path that marks entities `reported`;
  it requires analyst or admin, takes the approver from the JWT (never from the request body) and writes the audit log.
* Dismissing an entity removes it from clustering and re-runs the analysis; reopening restores it. A reported entity cannot be dismissed.
* Nothing is sent to any platform: "reported" means a person approved the dossier for filing.

## API

OpenAPI is at `/docs`. Shapes follow `app/schemas.py`. Notes where the implementation made a choice:

* **Campaign id** = the id of the campaign's lowest-numbered entity (union-find root), so the demo campaigns are `C-1` and `C-9`.
* `GET /api/campaigns/{id}/dna` labels a family `Strong` (>= 0.75), `Medium` (>= 0.4) or `Weak`; `similarity` is 0..1.
* `GET /api/brands/{id}/monitor`: grade from the highest campaign risk (A 0-19, B 20-39, C 40-59, D 60-79, F 80-100).
  "Removed by platform" = reported entities whose watchlist item went offline; "In progress at platform" = reported entities whose watch item changed.
* `POST /api/simulator`: baseline additions/week = the last-7-day pace (x1.5 per following week if `accelerate`, x0.5 if `slow`);
  `acted` = baseline additions x (1 - `assumed_drop_pct`/100), added to today's size. Read-only, so viewers may use it.
* Investigations: `quick` never touches the network; `deep` also runs DNS, RDAP, crt.sh and a page fetch for domains. Unknown facts add no points.
* Extra tables beyond the brief: `revoked_tokens` (logout/rotation), `jobs` (scan progress), `metrics` (seeded history and nightly snapshots).
* `GET /api/entities`, `GET /api/entities/{id}`, `GET /api/campaigns/{id}/report` (HTML preview) and `GET /api/reports/{id}/preview` were added for the UI.

## Security notes

* CORS limited to `FRONTEND_ORIGIN`. Passwords hashed with bcrypt; JWTs signed HS256 from `SECRET_KEY`
  (access 15 min, refresh 7 days, rotated on use, revocable). Reset tokens are single-use and bound to the current password hash;
  in dev they are printed to the console (`/login?reset=<token>`), there is no email service.
* Every outbound fetch goes through `engine/ssrf.py`: every resolved address must be globally routable (private, loopback, link-local such as
  169.254.169.254, CGNAT and reserved ranges are refused), redirects are re-checked per hop, no JavaScript is executed, size and time are capped,
  failures degrade to "unknown". The check resolves the name before connecting, so a hostile DNS server that changes its answer between the two
  lookups (DNS rebinding) is a residual risk; run the API in a network with no route to internal services if that matters for you.
* Uploads: size limits, magic-byte checks (the client's content type and extension are ignored), APK zip-bomb checks, files stored under `DATA_DIR`
  (outside any web root) and served only through authenticated download endpoints as attachments with `nosniff`. Evidence is re-hashed on download.
* API keys for VirusTotal, AbuseIPDB and URLhaus are read from environment variables only and are never stored or returned.

## Background jobs

`watchlist` every 15 minutes (domains: DNS A/MX change, new certificate on crt.sh, page title change, gone offline; payment IDs, phones, handles and apps:
do they appear on new entities); `nightly` at 02:00 UTC (re-run `analyze()` per brand and record stage changes, refresh the dashboard aggregates,
purge expired revoked tokens). The first check of an item only records a baseline.

## Tests

`pytest` (117 tests): similarity and logo hashing (JPEG and resizing), SSRF guard (127.0.0.1, 10.x, 169.254.169.254, redirect to internal space),
clustering (two campaigns of 10 and 6; fan page, bakery and official account not flagged; the lone giveaway unclustered), dismiss/reopen,
dashboard aggregates, auth (expired token, refresh rotation, reset, role matrix on **every** write route), reports (a viewer cannot approve,
nothing becomes `reported` before approval, approval is audited), APK parsing of a generated fixture, evidence custody and tamper detection,
watchlist and scheduled jobs, and contract tests validating every endpoint against its Pydantic schema.
