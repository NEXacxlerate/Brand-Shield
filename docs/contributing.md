# Contributing

**Plain-language summary**

* Before you push, run the same checks CI runs: `ruff` for Python, `oxlint` and `tsc` for the web app, plus the test suites.
* The repo enforces style through CI only. It has no written branch, review or release policy, so those points are marked
  **Needs confirmation** below instead of being invented.
* The sections at the end are step-by-step recipes for the most common changes: a new API endpoint, a database migration, a new page, a new
  data source (collector) and a new scoring signal.
* Project rule: commits and pull requests must not carry AI or Claude co-author or "generated with" trailers.

## 1. Code style and checks

| Area | Tool and rules | Source |
|---|---|---|
| Python lint | ruff, line length 140, target Python 3.11, rule sets `E F I UP B`, `B008` ignored (FastAPI `Depends()` defaults), `alembic/versions` excluded | `backend/pyproject.toml:24-31` |
| Python long lines | `E501` is ignored for tests, scripts, engine, collectors, providers, models, `app/api/*`, and a list of named modules | `backend/pyproject.toml:33-55` |
| Run | `python -m ruff check .` in `backend/` | `.github/workflows/ci.yml:31-33` |
| Python imports | sorted by ruff `I`; `# noqa: E402` is used where environment must be set before import (`backend/tests/conftest.py`, `backend/api/index.py`) | same |
| Frontend lint | oxlint with plugins `react`, `typescript`, `oxc`; `react/rules-of-hooks` is an error, `react/only-export-components` a warning | `frontend/.oxlintrc.json`, `frontend/package.json:9` |
| Frontend types | `tsc -b` (`npm run typecheck`); `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `erasableSyntaxOnly`, `verbatimModuleSyntax` | `frontend/tsconfig.app.json:19-25` |
| Studio types | `tsc --noEmit` (`npm run lint`); `isolatedModules`, no strict flags | `studio/package.json:51`, `studio/tsconfig.json` |
| Line endings | LF for `*.sh`, `Dockerfile`, `*.conf`, `*.template` | `.gitattributes:2-5` |
| Secrets | never commit `.env`; only `.env.example` files are tracked | `.gitignore` (`.env`, `.env.*`, `!.env.example`, `!backend/.env.example`) |

TypeScript strictness: **neither** `frontend/tsconfig.app.json` nor `studio/tsconfig.json` sets `"strict": true`. The frontend enables the unused
and fallthrough checks listed above; Studio enables none of them. **Needs confirmation:** whether turning on `strict` is intended; it is not
configured today.

Conventions visible in the code (not enforced by a tool): every API route that changes data records an audit row (`audit.record(...)`, for
example `backend/app/api/health.py:47`); secrets are `SecretStr` in `Settings` and never logged (`backend/app/config/config.py:71,91,110`);
module docstrings explain the "why" and cite the decision record (`docs/DECISIONS.md`).

## 2. Branches, pull requests and review

What the repo enforces:

| Item | Fact | Source |
|---|---|---|
| CI triggers | pushes to `main` and every pull request | `.github/workflows/ci.yml:6-9` |
| Required checks | the jobs `lint`, `test-server` (3.11 and 3.12), `test-server-postgres`, `test-frontend`, `test-studio`, `e2e`, `build` | `ci.yml:19-231` |
| Pipeline order | `e2e` needs the three test jobs; `build` needs lint and the three test jobs | `ci.yml:160,204` |
| Stale runs | a newer push on the same ref cancels the older run | `ci.yml:14-16` |
| PR template, CODEOWNERS, branch-protection rules | none in the repo (`.github/` contains only `workflows/ci.yml`) | `.github/` |

**Needs confirmation:** branch naming, whether `main` is protected, number of required reviewers, merge style (squash or merge commit) and
release/tagging process are not defined anywhere in the repo. The git history shows direct work on `main` with remotes `origin`, `newrepo` and
`brandshield-old`.

## 3. Commit messages

Read-only inspection of `git log` shows: a single imperative or descriptive sentence in sentence case, no issue numbers, no body, sometimes
a short prefix naming the area. Prefixes seen: `Docs:`, `Fix ...`, `Studio:`, `Frontend:`, `Tests:`, `e2e:`, `Look-alike Lab:`, `Phase N:`,
`Vercel ...`, `Brand Studio ...`, `Add ...`.

Examples from history:

* `Tests: 20 s default timeout for form tests (Register page flaked on Node 22)`
* `Studio: opening its dev server directly (port 3000) now continues on BrandShield's origin, where the shared login lives`
* `Docs: submission guide (project description, test access and evaluation walk-through)`
* `Fix CI: Node 22-safe logo test mock, browser tests follow the new Protect Your Brand sign-in flow and Setup wizard`

Rules:

* Describe what changed and why in one line; prefix with the area when it helps.
* **No AI or Claude co-author trailers.** Do not add `Co-Authored-By: Claude ...` or "Generated with Claude Code" lines to commits or pull
  request descriptions (project rule recorded in the maintainers' memory file `no-claude-coauthor-trailer.md`; it overrides any default).
* **Needs confirmation:** whether a formal convention (Conventional Commits) is wanted; none is configured (no commitlint, no hook).

## 4. Add a backend endpoint

1. **Router.** Create or extend a file in `backend/app/api/` with `router = APIRouter(prefix="/<name>")`. Pattern: `backend/app/api/providers.py:1-18`.
2. **Auth.** Use dependencies from `backend/app/config/deps.py`: `get_current_user`, `require_roles(...)`, `require_admin`, `get_settings_dep`,
   `get_store`; DB session via `Depends(get_db)` (`backend/app/db/session.py:52-57`). Brand data must be scoped to the caller's account
   (owner checks in `backend/app/api/brands.py`; isolation tests in `backend/tests/api/test_tenant_isolation.py`).
3. **Schema.** Request and response models are Pydantic; shared ones live in `backend/app/schemas/` (`auth.py`, `brand.py`), small ones are declared
   in the router file (see `ActiveIn` in `providers.py:23`).
4. **Register it.** Import the module in `backend/app/main.py:11-29` and add `api.include_router(<module>.router)` in the block at
   `main.py:170-181` (everything is mounted under `/api`; health is the only router mounted without it, `main.py:182`).
5. **Rate limits, cache.** `/api` calls count against the global limiter automatically (`main.py:119-135`). Read endpoints can opt into the
   short response cache by being listed in `backend/app/config/response_cache.py:15` (`CACHEABLE`); any write busts it (`main.py:155-158`).
6. **Audit.** Record changes with `audit.record(db, user, "<area>.<action>", target, detail)` then commit.
7. **Tests.** Add `backend/tests/api/test_<name>.py` using `client`, `admin_h`/`analyst_h`/`viewer_h`; test 401, 403 for the wrong role, 404 for
   another account's data (see `docs/testing.md`).
8. **Docs.** Update `docs/API.md` and, if the user sees it, the matching page in `docs/features/`.
9. **Frontend.** Add the call in `frontend/src/api/sm.ts` (object `sm`, line 64) and types in `frontend/src/api/types.ts`.
10. Run `python -m ruff check .` and `python -m pytest -q`.

## 5. Add a database migration (Alembic)

Migrations live in `backend/alembic/versions/` and are numbered by hand (`0001` to `0012` today). Template: `0012_active_brand.py`.

1. Change the SQLAlchemy model in `backend/app/models/` (and export it in `backend/app/models/__init__.py` if it is a new class, because
   `alembic/env.py:1` imports `app.models` to register tables).
2. Create `backend/alembic/versions/0013_<short_name>.py` with `revision = '0013'`, `down_revision = '0012'`, and both `upgrade()` and
   `downgrade()`. Every existing migration defines `downgrade()`.
3. Keep it additive and nullable where possible (see the note in `0012`), and SQLite-safe: Alembic runs with `render_as_batch=True`
   (`backend/alembic/env.py:16,25`).
4. Apply: `python -m scripts.migrate` from `backend/` (safe with several replicas on PostgreSQL: `backend/scripts/migrate.py:32-42`). The dev
   command `npm run backend` also applies pending migrations.
5. Test on SQLite and PostgreSQL: add to `backend/tests/db/` (patterns: `test_migration.py`, `test_migration_0010.py`); CI runs the suite on
   PostgreSQL (`ci.yml:73-112`) and runs the migration twice.
6. Update `docs/DATABASE_SCHEMA.md` / `docs/schema.sql` (generated by `backend/scripts/export_schema.py`).
7. On Vercel the migration is a manual step (`docs/setup-and-deployment.md` section 6).

## 6. Add a frontend page

1. Create `frontend/src/pages/<Name>Page.tsx` and a `.css` file next to it (pattern: `InvestigationsPage.tsx`).
2. **Route.** In `frontend/src/App.tsx` import it and add a `<Route path="/<name>" element={<AppLayout><NamePage /></AppLayout>} />` inside
   `<Route element={<RequireAuth />}>` (`App.tsx:89`). Put it inside `<Route element={<RequireAdmin />}>` (`App.tsx:175-179`) for admin-only pages.
3. **Layout.** Wrap with `AppLayout` (`frontend/src/components/layout/AppLayout.tsx`): it renders the `Sidebar` and remounts the page when the
   active brand changes.
4. **Sidebar.** Add a `NavLink` with an icon in `frontend/src/components/layout/Sidebar.tsx` (items start at the `sidebar-nav` block, around
   line 60); hide it for non-admins using `isAdmin` (`Sidebar.tsx:28`) when needed.
5. **Voice agent.** Add `{ path, spoken_names }` to `ALL_ROUTES` in `frontend/src/utils/voice.ts:74-89` (and to `ADMIN_ONLY`, `:72`, if admin
   only), so "open <name>" works. Give form fields a `data-voice="<field>"` attribute so the agent can fill them (examples:
   `Sidebar.tsx:49`, `BrandProfilePage.tsx:265`, `CandidateTools.tsx:120`); `data-voice-row` marks list rows (`Sidebar.tsx:156`). Password-like
   fields are never filled by voice (`voice.ts:96`, `backend/app/services/voice.py:38`).
6. **Data.** Fetch through `useApi` / the `sm` client (`frontend/src/api/sm.ts`) so the page cache and 401 refresh apply.
7. **Tests.** Add `<Name>Page.test.tsx` (pattern `InvestigationsPage.test.tsx`) and, for user flows, a spec in `frontend/e2e/`. Add the page to
   the full-walk test in `frontend/e2e/smoke.spec.ts` if it should be checked for console errors.
8. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` in `frontend/`.

## 7. Add a collector (data source)

1. Subclass `Collector` in a new file under `backend/app/core/collectors/` (`backend/app/core/collectors/base.py:179-196`): set `name`, `kind`,
   `platforms`, optionally `is_configured()`, and implement `collect(brand, ctx)` returning `Candidate` objects. It must raise only
   `SourceUnavailable(reason, message)`; the orchestrator catches it and carries on (`base.py:1-6`, `:36-45`).
2. Use a short `reason` code (for example `no_key`, `rate_limited`, `timeout`). Reasons in `PERMANENT_REASONS` are not retried automatically
   (`base.py:31`).
3. Use the shared SSRF-safe HTTP helpers (`default_client_factory`, `base.py:203`) and a per-scan query cap setting.
4. Add settings to `backend/app/config/config.py` (keys as `SecretStr`) and names to `backend/.env.example`.
5. Register it: add the name to `CHAIN_ORDER` (`backend/app/core/collectors/selection.py:27`), a `ChainEntry` in `select_collectors`
   (`selection.py:102-113`, which decides what counts as "live"), and construct it in `CollectorRuntime.build` (`selection.py:155` onward).
6. Credits or rate limits: see `backend/app/core/collectors/credits.py` (Tavily ledger) and the iTunes limiter in `CollectorRuntime`.
7. Fixtures and tests: hand-written responses under `backend/tests/fixtures/<name>/` and `backend/tests/core/collectors/test_<name>.py`
   using `httpx.MockTransport` (live calls fail the suite, `conftest.py:72-79`). Update `docs/COLLECTORS.md`.
8. Platforms shown on Source Health are listed in `base.py:28`; add new ones there.

## 8. Add a scoring signal

Scores explain themselves: every point is a `Reason(signal, points, max_points, note)` (`backend/app/core/engine/scoring.py:48-55`).

1. Decide the category: social (`SOCIAL_MAX`, `scoring.py:34`), app (`APP_MAX`, `:35`) or web (`WEB_MAX`, `backend/app/core/engine/domain_match.py:39`, plus `url_reputation` in
   `WEIGHTS_V2_WEB`, `backend/app/core/engine/risk_engine.py:43`).
2. Add the key with its maximum points to the table, then emit a `Reason` in the scoring function for that candidate type (for social, the
   function around `scoring.py:141-184`; web signals through `assess_web`, `risk_engine.py:199`).
3. The risk engine wraps reasons into `Signal` objects with provenance and status `present | clean | unavailable`
   (`risk_engine.py:121-148`); a signal that could not be checked must be `unavailable`, never "clean".
4. Weights are versioned: `ALGORITHM_V1 = "1.0"` (social, app) and `ALGORITHM_V2 = "2.0"` (web) (`risk_engine.py:36-37`). Changing existing weights moves
   real scores, and the repo pins them with `backend/tests/fixtures/golden_scores_v1.json` and `backend/tests/core/engine/test_risk_engine.py`.
   **Needs confirmation:** the approval process for changing weights; `risk_engine.py:41-42` notes new web weights "need the owner's approval,
   see docs/DECISIONS.md" but no procedure is written.
5. Severity cutoffs (`LOW` below 40, `MEDIUM` 40, `HIGH` 70, `CRITICAL` 85) come from `RiskConfig` and `SEVERITY_*_MIN` settings
   (`risk_engine.py:47-77`, `config.py:166-168`); the older band cutoffs (high 85, medium 70) are in `backend/app/core/pipeline/bands.py:1-11`.
6. Tests: extend `backend/tests/core/engine/test_scoring_pipeline.py` or `test_risk_engine.py`; keep the explanation text meaningful because
   it is shown to users and in reports.
7. Update the matching guide in `docs/features/` and `docs/glossary.md` if you introduce a new term.
