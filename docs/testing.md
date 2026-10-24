# Testing

**Plain-language summary**

* There are four layers of tests: backend (Python, `pytest`), BrandShield frontend (`vitest`), Brand Studio (`vitest`) and browser
  tests (Playwright) that drive the real app in sample mode.
* No test talks to the internet or uses real keys: the backend suite blocks network access and strips real keys from the environment.
* The backend suite runs on SQLite by default. CI also runs it on PostgreSQL by setting one variable.
* Counts below come from reading the test directories (files and `def test_` / `it(` occurrences), not from running them. Parametrized tests
  expand to more cases at run time.

## 1. Overview and commands

| Layer | Tool | Files / tests (counted by reading) | Run from | Command |
|---|---|---|---|---|
| Backend | pytest | 63 test files; `pytest --collect-only` reports 1263 test cases (parametrized tests expand the ~750 `def test_` functions) | `backend/` | `python -m pytest -q` |
| BrandShield frontend | vitest + jsdom + Testing Library | 22 files, about 137 `it(` | `frontend/` | `npm test` |
| Brand Studio | vitest + jsdom | 6 files, 41 `it(` | `studio/` | `npm test` (CI uses `npx vitest run`) |
| Browser (e2e) | Playwright, Chromium | 8 spec files, 31 tests | `frontend/` | `npm run e2e:install` once, then `npm run test:e2e` |
| Backend lint | ruff | n/a | `backend/` | `python -m ruff check .` |
| Frontend lint / types | oxlint / `tsc -b` | n/a | `frontend/` | `npm run lint` / `npm run typecheck` |
| Studio types | `tsc --noEmit` | n/a | `studio/` | `npm run lint` |

An earlier README quoted "about 1,240 tests" for the backend; that figure includes parametrized expansion and was not re-verified here
(`python -m pytest --collect-only -q` reported 1263 collected tests on 2026-10-23; the last full run passed 1262 with 5 skipped).

Use the project virtual environment on Windows: `.\.venv\Scripts\python -m pytest -q` (created by `npm run backend`, see
`docs/setup-and-deployment.md`). `requirements-dev.txt` adds `pytest>=8,<9` and `ruff>=0.5` to `requirements.txt` (`backend/requirements-dev.txt`).

## 2. Backend (pytest)

Configuration: `backend/pyproject.toml:19-22` (`testpaths = ["tests"]`, `pythonpath = ["."]`, DeprecationWarning ignored).
There are no custom markers; the only markers are `skipif` ones (`backend/tests/api/test_logo_clip.py:214` skips without `fastembed`;
`backend/tests/db/test_postgres.py:24` skips without `TEST_DATABASE_URL`).

### Files by directory

| Directory | Test files | `def test_` | Covers |
|---|---|---|---|
| `tests/api/` | 23 | 311 | HTTP endpoints: auth, register, brands, accounts, tenant isolation, scans, screens, Studio AI and items, voice, demo login, health, response cache, Vercel behaviour (`test_vercel.py`), logo CLIP/lookalike |
| `tests/config/` | 2 | 14 | `test_logging.py` (redaction, JSON), `test_sentry.py` |
| `tests/core/engine/` | 9 | part of 371 | name/domain matching, distance and normalization, URLs, risk engine, scoring pipeline, logo similarity, LLM text, synthetic evaluation |
| `tests/core/collectors/` | 9 | part of 371 | Tavily, iTunes, SearXNG, Google Play, selection and orchestrator, contract, sample collector, live check, race and SQLite lock cases |
| `tests/core/pipeline/` | 9 | part of 371 | scan flow, scan pipeline, web candidates, URL safety, registry intake, logos and images |
| `tests/core/providers/` | 2 | part of 371 | Safe Browsing, text providers |
| `tests/core/` (top) | 1 | part of 371 | `test_storage_backends.py` (local and database file stores) |
| `tests/db/` | 4 | 21 | migrations (`test_migration.py`, `_0004`, `_0010`) and `test_postgres.py` |
| `tests/services/` | 4 | 33 | audit, canary, profile health, scheduler per brand |

`tests/core/` totals 30 files and 371 `def test_` (9 + 9 + 9 + 2 + 1).

Support files: `tests/conftest.py`, `tests/pg_support.py`, `tests/scan_helpers.py`, `tests/fixtures/` (hand-written Tavily, iTunes and SearXNG
responses and `golden_scores_v1.json`; see `tests/fixtures/README.md`: they are written from public API docs, not captured live).

### What `conftest.py` guarantees

| Behaviour | Source |
|---|---|
| Sets throwaway environment before the app is imported: `APP_ENV=test`, a test-only `JWT_SECRET`, `DATABASE_URL=sqlite://`, `SCAN_EXECUTOR=inline`, `SCHEDULER_ENABLED=false` | `backend/tests/conftest.py:4-15` |
| Removes real keys from the shell: `VERCEL`, `STORAGE_BACKEND`, `MIGRATION_DATABASE_URL`, `CORS_ORIGIN_REGEX`, `CRON_SECRET`, `GOOGLE_SAFE_BROWSING_API_KEY`, `TAVILY_API_KEY`, `SEARXNG_BASE_URL`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `POLLINATIONS_API_KEY`, `HUGGINGFACE_API_TOKEN`, `REDIS_URL`, `SENTRY_DSN`, ... | `conftest.py:18-19` |
| Fast bcrypt (`BCRYPT_ROUNDS = 4`) | `conftest.py:42` |
| **Network guard** (autouse): `httpx.HTTPTransport.handle_request` raises `AssertionError("live network access attempted in a test")`; `socket.getaddrinfo` is blocked except `localhost`, `127.0.0.1`, `::1` (needed for the PostgreSQL job). `httpx.MockTransport` is unaffected | `conftest.py:65-82` |
| Optional packages treated as absent (Google Play scraper, fastembed/CLIP) so local extras do not change results | `conftest.py:85-94` |
| `Settings(_env_file=None)` so a developer's `backend/.env` never leaks in | `conftest.py:60-62` |

### Fixtures

| Fixture | Gives you | Source |
|---|---|---|
| `settings` | `Settings` with temp `data_dir`, in-memory DB, response cache off | `conftest.py:59-62` |
| `checker` | `FakeChecker` replacing the network URL checker (records calls, configurable result) | `conftest.py:47-56,97-99` |
| `app` | `create_app(...)` on a fresh in-memory SQLite engine with tables from `Base.metadata.create_all` | `conftest.py:102-106` |
| `client` | `TestClient` (runs lifespan, so the admin is seeded) | `conftest.py:109-112` |
| `db` | a SQLAlchemy session from the app | `conftest.py:115-118` |
| `admin_h`, `analyst_h`, `viewer_h` | `Authorization` headers for admin (`admin@example.com`), analyst and viewer users | `conftest.py:148-162` |
| `brand` | creates "Acme Bank" via `POST /api/brands` | `conftest.py:165-169` |
| helpers `login`, `headers_for`, `make_user`, `hand_brand_to` | create users and give legacy tests a brand owner | `conftest.py:121-145` |

### SQLite default and the PostgreSQL job

* Default: every engine is in-memory SQLite (`DATABASE_URL=sqlite://`, `conftest.py:11`).
* Set `TEST_DATABASE_URL` to run the same suite on PostgreSQL. `tests/pg_support.py:17-47` replaces `make_engine("sqlite://")` so each test
  engine gets its own random schema `t_<12 hex>` in that database, dropped at interpreter exit. File-based SQLite engines (migration tests, the
  seed race test) stay SQLite on purpose (`conftest.py:21-23`). **Use a throwaway database only.**
* CI: `test-server-postgres` starts `postgres:17-alpine`, runs `python -m scripts.migrate` twice (second must do nothing), then `pytest -q`
  with `TEST_DATABASE_URL` set (`.github/workflows/ci.yml:73-112`).

```powershell
cd backend
$env:TEST_DATABASE_URL = "postgresql+psycopg://user:password@localhost:5432/throwaway"
.\.venv\Scripts\python -m pytest -q
```

### Useful pytest invocations

| Goal | Command |
|---|---|
| One file | `python -m pytest tests/api/test_auth.py -q` |
| One test | `python -m pytest tests/api/test_auth.py -k login -q` |
| Only engine tests | `python -m pytest tests/core/engine -q` |
| List tests without running | `python -m pytest --collect-only -q` |
| Pipeline self-check (not pytest) | `python -m scripts.canary` (also run in CI: `ci.yml:69-71`) |

## 3. BrandShield frontend (vitest)

Configuration: `frontend/vite.config.ts:188-195`: jsdom, 20 s timeout (form tests type long passwords key by key), `src/**/*.test.{ts,tsx}`,
`restoreMocks: true`, setup file `src/test/setup.ts`. The setup runs Testing Library `cleanup`, clears the page query cache, `localStorage`
and `sessionStorage` after every test (`frontend/src/test/setup.ts:6-15`). Helpers: `src/test/helpers.ts` (`jsonResponse`, `mockFetch`,
`authHeader`).

Test files (22): `App.test.tsx`, `vercelConfig.test.ts`, `api/` (`baseUrl`, `client`, `format`), `components/common/LogoCompareCard`,
`hooks/` (`hooks`, `useApi.cache`), `landing/LandingRoute`, `pages/` (`InvestigationsPage`, `LoginPage`, `LoginPage.demo`, `ProtectBrandPage`,
`RegisterPage`, `SetupPage`, `SourceHealthPage`, `WebThreatsPage`), `utils/` (`brandExamples`, `passwordPolicy`, `studio`, `theme`, `voice`).

`npm run build` is also a check: it runs `tsc -b` then `vite build` (`frontend/package.json:8`).

## 4. Brand Studio (vitest)

Configuration: `studio/vite.config.ts:22-27` (jsdom, globals, `src/test/setup.ts`). Six files: `contexts/AuthContext.test.tsx`,
`lib/api.test.ts`, `lib/brandshield.test.ts`, `lib/devRedirect.test.ts`, `lib/items.test.ts`, `lib/session.test.ts`. `npm run lint` is
`tsc --noEmit` (`studio/package.json:51`).

## 5. Playwright end-to-end

Config: `frontend/playwright.config.ts`. One worker, no retries, 90 s test timeout (`:108-114`). It starts three servers itself
(`:123-171`):

| Server | Port | Command | Notes |
|---|---|---|---|
| Backend | 8765 (`E2E_API_PORT`) | `backend/scripts/e2e_server.py` using `backend/.venv` python (or `E2E_PYTHON`) | sample collector, temp SQLite, no Tavily/Gemini/Redis, stubbed URL checker, scheduler off (`e2e_server.py:1-26,45-51`) |
| BrandShield dev server | 5174 (`E2E_WEB_PORT`) | `npx vite --port 5174 --strictPort` | proxies `/studio` and `/api` |
| Brand Studio dev server | 3100 (`E2E_STUDIO_PORT`) | `npx vite --port 3100 --strictPort` in `studio/` | not 3000, so a developer's Studio can keep running |

Secrets: admin and viewer passwords are random per run, passed through environment only (`playwright.config.ts:99-105`). Demo accounts use
fixed throwaway values defined in the config (`:138-141`).

Specs (`frontend/e2e/`):

| Spec | Tests | Covers |
|---|---|---|
| `smoke.spec.ts` | 13 | login, setup wizard, brand profile, dashboard scan, social, apps, look-alike lab, source health, reports, settings, viewer role, token refresh, full page walk with no console errors |
| `register.spec.ts` | 6 | sign-up page and policy, duplicate email |
| `studio-flow.spec.ts` | 3 | Studio under the shared login, back to BrandShield, tenant separation |
| `multi-brand.spec.ts` | 3 | two brands from Studio, switch, "Add another brand" |
| `demo-login.spec.ts` | 2 | demo and guarded admin demo buttons |
| `voice.spec.ts` | 2 | voice agent with a fake speech recognizer, missing-recognition message |
| `protect-hover.spec.ts` | 1 | Protect Your Brand hover |
| `visual.spec.ts` | 1 | captures every page screenshot |
| `png.ts` | n/a | helper that builds test images |

Reports: in CI, list + GitHub annotations + HTML report, trace kept on failure (`playwright.config.ts:115,121`); the e2e job uploads
`frontend/test-results/` and `frontend/playwright-report/` for 7 days (`ci.yml:190-199`).

## 6. CI mapping

| CI job (`.github/workflows/ci.yml`) | Local equivalent |
|---|---|
| `lint` (`:19-47`) | `ruff check .` in `backend/`; `npm run lint` and `npm run typecheck` in `frontend/` |
| `test-server` (`:49-71`) | `python -m pytest -q`; `python -m scripts.canary` (matrix Python 3.11 and 3.12) |
| `test-server-postgres` (`:73-112`) | `TEST_DATABASE_URL=... python -m pytest -q` after `python -m scripts.migrate` |
| `test-frontend` (`:114-132`) | `npm test`; `npm run build` |
| `test-studio` (`:134-155`) | `npx tsc --noEmit`; `npx vitest run`; `npm run build` |
| `e2e` (`:157-199`) | `npm run test:e2e` in `frontend/` (needs `studio/` and `frontend/` installed, Chromium, backend packages) |
| `build` (`:201-231`) | `docker build` of `backend`, `studio`, `frontend` |

## 7. How to add a test

**Backend endpoint test**

1. Put it in `backend/tests/api/test_<topic>.py` (or the matching `core/`, `services/`, `db/` folder).
2. Use `client` plus `admin_h` / `analyst_h` / `viewer_h`; create data with the `brand` fixture or `client.post(...)`.
3. For scans use `tests/scan_helpers.py` (fake collectors; `SCAN_EXECUTOR=inline` makes scans synchronous).
4. Never reach the network: use `httpx.MockTransport` or the fakes. Real calls raise `AssertionError` (`conftest.py:72-79`).
5. Brand data is per account: another account's records must answer 404 (`tests/api/test_tenant_isolation.py`).
6. Run `python -m pytest tests/api/test_<topic>.py -q`, then `python -m ruff check .`.

**Frontend unit test**: add `Name.test.tsx` next to the file; mock `fetch` with `mockFetch` from `src/test/helpers.ts`; run `npm test`.

**Studio unit test**: add `*.test.ts(x)` under `studio/src`; run `npm test` in `studio/`.

**Browser test**: add `frontend/e2e/<name>.spec.ts`; read credentials from `process.env.E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` (as
`voice.spec.ts` does); keep it sample-mode and offline.

**Collector fixtures**: hand-written files live in `backend/tests/fixtures/{tavily,itunes,searxng}`; after a real live check replace them (see
`tests/fixtures/README.md`).
