# BrandShield

**BrandShield is a Digital Risk Protection platform.** You describe your brand (name, aliases, official social handles, official apps,
domains, logo). BrandShield scans public sources for look-alike **social profiles, fake apps and look-alike websites**, scores every
suspect with a reason for every point, excludes your own official assets, and prepares evidence-backed reports. **A person reviews every
detection and approves every report; nothing is ever sent or taken down automatically** (notifications and takedown e-mails are stored
preferences only, `backend/app/api/settings.py`). It also ships **Brand Studio**, an AI toolkit for naming, logos, palettes and copy, which
registers a new brand in BrandShield in one step. One login serves both, and every account owns its own brand
(`backend/app/models/brand.py:14`, `owner_id`).

Who it is for: brand-protection and security analysts who need to find and triage impersonation (analyst role), administrators who run the
sources and settings (admin role), and read-only stakeholders (viewer role). Roles: `backend/app/config/deps.py:46`.

Full documentation index: **[docs/index.md](docs/index.md)**.

## Features

| Area | What it does | Guide |
|---|---|---|
| Overview | Counts, trends and the scan trigger | [dashboard](docs/features/dashboard.md) |
| Scanning and detection | Collect, de-duplicate, allowlist, name/logo/text signals, score, human review | [scanning-and-detection](docs/features/scanning-and-detection.md) |
| Social and app threats | Fake profiles, pages and apps (Social Threats, App Threats pages) | [social-and-app-threats](docs/features/social-and-app-threats.md) |
| Web threats | Look-alike domains: registrable-domain comparison, punycode, Safe Browsing | [web-threats](docs/features/web-threats.md) |
| Look-alike Lab | Name tester, test cases, logo comparison (CLIP or perceptual hashes) | [lookalike-lab](docs/features/lookalike-lab.md) |
| Candidate import | Add suspects by hand or from CSV/JSON | [candidate-import](docs/features/candidate-import.md) |
| Accounts | Sign-in, sign-up, roles, demo accounts | [authentication-and-accounts](docs/features/authentication-and-accounts.md) |
| Brand Registry | Brand profile, official handles/apps/domains/logo (the allowlist) | [brand-registry](docs/features/brand-registry.md) |
| Investigations | Status, resolution, notes and history per detection | [investigations](docs/features/investigations.md) |
| Reports | Evidence-backed report drafts; a person approves | not written yet ([open questions](docs/open-questions.md)) |
| Source Health and providers | Collector status, credits, text/image providers (admin) | [source-health-and-providers](docs/features/source-health-and-providers.md) |
| Model Evaluation | Synthetic evaluation of the name matcher (admin) | [model-evaluation](docs/features/model-evaluation.md) |
| Settings and audit | Data mode, schedule, thresholds, audit log (admin) | [settings-and-audit](docs/features/settings-and-audit.md) |
| Brand Studio | AI naming, logo, palette, copy under `/studio/` | [brand-studio](docs/features/brand-studio.md) |
| Voice agent | Spoken navigation and form filling (Chrome/Edge) | [voice-agent](docs/features/voice-agent.md) |
| Landing page | Public marketing page at `/` for signed-out visitors | [landing-page](docs/features/landing-page.md) |

Routes and which are admin-only: `frontend/src/App.tsx:89-179`.

## Prerequisites

| Need | Version | Source |
|---|---|---|
| Python | 3.11+ (3.12 used by Docker, Vercel and CI lint) | `backend/pyproject.toml:10`, `backend/.python-version`, `backend/Dockerfile:8` |
| Node.js | 22 | `frontend/Dockerfile:8`, `.github/workflows/ci.yml:36` |
| Docker with compose plugin | optional, for the container stack | `docker-compose.yml` |
| PostgreSQL / Redis | optional; SQLite is the default database and scans run in a thread without Redis | `backend/app/config/config.py:28`, `:110-111` |

## Quick start

1. Create the backend settings file and fill the three required values (`JWT_SECRET` 16+ characters, `ADMIN_EMAIL`, `ADMIN_PASSWORD`):

   ```powershell
   copy backend\.env.example backend\.env
   python -c "import secrets; print(secrets.token_urlsafe(48))"    # use as JWT_SECRET
   ```

   `JWT_SECRET` has no default, so the API will not start without it (`backend/app/config/config.py:40`).
2. Start the API (first run creates `backend/.venv`, installs `requirements.txt`, applies migrations, then serves on port 8000):

   ```powershell
   npm run backend
   ```
3. In a second terminal start the web apps (first run runs `npm install` in `frontend/` and `studio/`):

   ```powershell
   npm run frontend
   ```
4. Open **http://localhost:5173** (BrandShield; Brand Studio is at `/studio/` on the same address). API docs: http://localhost:8000/docs.

Both commands work from the project root (`package.json:5-8`) and from the parent folder `ScamMind AI New/` (its `package.json` forwards
them with `npm --prefix "ScamMind AI"`). What they do, ports and port checks: [docs/setup-and-deployment.md](docs/setup-and-deployment.md).

With no live source configured the app is in **sample mode**: detections are fictional and a "Sample data" badge is shown
(`backend/app/core/collectors/selection.py:68-100`). Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`, the demo button if `DEMO_EMAIL` /
`DEMO_PASSWORD` are set, or create an account at `/register`.

## Commands

| Task | Command | Where |
|---|---|---|
| API (migrate + reload server) | `npm run backend` | project root |
| Web apps (BrandShield 5173, Studio 3000) | `npm run frontend` | project root |
| Backend tests | `python -m pytest -q` | `backend/` (use `.venv`) |
| Backend lint | `python -m ruff check .` | `backend/` |
| Frontend lint / type-check / tests / build | `npm run lint` / `npm run typecheck` / `npm test` / `npm run build` | `frontend/` |
| Studio type-check / tests / build | `npm run lint` / `npm test` / `npm run build` | `studio/` |
| Browser tests | `npm run e2e:install` once, then `npm run test:e2e` | `frontend/` |
| Docker stack | `docker compose up --build` (after `copy .env.example .env`) | project root |
| Apply migrations by hand | `python -m scripts.migrate` | `backend/` |
| Pipeline self-check | `python -m scripts.canary` | `backend/` |

Details: [docs/testing.md](docs/testing.md) and [docs/setup-and-deployment.md](docs/setup-and-deployment.md).

## Project layout

| Path | Contents |
|---|---|
| `backend/` | FastAPI app: `app/api` routers, `app/core` (engine, collectors, pipeline, providers), `app/services`, `app/models`, `alembic/` migrations (0001-0012), `scripts/`, `tests/` |
| `frontend/` | React 19 + TypeScript + Vite app (`src/pages`, `src/components`, `src/api`, `src/hooks`), `e2e/` Playwright specs, `nginx/` for the container |
| `studio/` | Brand Studio (React + Vite + Tailwind, base `/studio/`, `studio/vite.config.ts:11`) |
| `docs/` | Documentation: [index](docs/index.md), plus existing guides (`API.md`, `DECISIONS.md`, `SECURITY.md`, `DEPLOY_VERCEL.md`, `USER_GUIDE.md`, `FEATURE_STATUS.md`, ...) |
| `scripts/dev.mjs` | The two one-command dev launchers |
| `vercel.json` | Single Vercel project with three services and a daily cron |
| `docker-compose.yml`, `docker-compose.dev.yml` | api, worker, db, redis, frontend, studio |
| `.github/workflows/ci.yml` | CI pipeline |

## Health and safety notes

* `GET /health` (readiness), `GET /health/live` (liveness): `backend/app/api/health.py:22-33`.
* Passwords use bcrypt, tokens are JWT with server-side refresh rotation, secrets are redacted from logs
  (`backend/app/config/logging.py`). Read [docs/SECURITY.md](docs/SECURITY.md) before exposing the app.
* The in-memory rate limiters are per process (`backend/app/config/ratelimit.py`).
* Every account sees only its own brand and detections; another account's records answer 404 (`backend/tests/api/test_tenant_isolation.py`).

## More documentation

[docs/index.md](docs/index.md) · [setup and deployment](docs/setup-and-deployment.md) · [testing](docs/testing.md) ·
[troubleshooting](docs/troubleshooting.md) · [contributing](docs/contributing.md) · [glossary](docs/glossary.md) ·
[API](docs/API.md) · [Vercel guide](docs/DEPLOY_VERCEL.md) · [user guide](docs/USER_GUIDE.md) · [feature status](docs/FEATURE_STATUS.md)
