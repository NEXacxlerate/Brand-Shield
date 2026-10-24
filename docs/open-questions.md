# Open questions and technical debt

**Plain-language summary.** While the documentation was written from the code, a number of things were found that are either unclear (a decision only the owner can make) or look like defects. Nothing here was changed in the code unless stated. Each item points to the document that has the details and the file references.

Items marked **Needs confirmation** are questions. Items under "Defects and inconsistencies" are things the code does that contradict its own comments, its UI or its docs.

## 1. Security and access (decide first)

| # | Item | Where |
|---|---|---|
| 1 | **Admin-only pages are admin-only in the browser only.** Settings, Source Health and Model Evaluation are hidden and guarded in the frontend (`frontend/src/App.tsx` `RequireAdmin`, `Sidebar.tsx`), but the backend lets any signed-in user read `GET /api/settings`, `/api/sources`, `/api/settings/data-mode`, `/api/providers`. Any analyst (including self-registered ones) can `PATCH /api/sources/{id}` and `POST /api/sources/{id}/retry`, which change shared state and can spend search credits. `GET /api/evaluation` is open to any role and analysts can re-run it. **Needs confirmation:** should these routes require an administrator? | [auth-and-security.md](auth-and-security.md), [features/source-health-and-providers.md](features/source-health-and-providers.md), [features/model-evaluation.md](features/model-evaluation.md), [features/settings-and-audit.md](features/settings-and-audit.md) |
| 2 | **The public demo admin can still change global monitoring settings** (schedule, sensitivity, rules, impersonation words, source toggles); `POST /api/sources/{id}/retry` has no demo-admin guard. **Needs confirmation:** acceptable? | [features/authentication-and-accounts.md](features/authentication-and-accounts.md) |
| 3 | `GET /api/settings` shows sensitivity, rules and impersonation words to every role. **Needs confirmation.** | [features/settings-and-audit.md](features/settings-and-audit.md) |
| 4 | A report's creator can approve their own report; reports do not re-verify the evidence hash. (From the unpublished reports draft, see section 5.) | section 5 |
| 5 | Log and Sentry masking omits `GROQ_API_KEY`, `POLLINATIONS_API_KEY`, `CRON_SECRET` and `DATABASE_URL` (`Settings.secret_values`, `backend/app/config/config.py`). | [auth-and-security.md](auth-and-security.md) |
| 6 | `/docs` and `/openapi.json` are not disabled (`backend/app/main.py:94`). **Needs confirmation:** public on Vercel/Docker? | [auth-and-security.md](auth-and-security.md) |
| 7 | No endpoint creates `viewer` accounts or changes roles. **Needs confirmation:** how should production viewers be created? | [auth-and-security.md](auth-and-security.md) |
| 8 | Client IP for per-IP limits is `request.client.host` with no proxy-header handling on Vercel; in-memory rate limiters and the response cache are per instance there. **Needs confirmation.** | [auth-and-security.md](auth-and-security.md), [background-jobs-and-integrations.md](background-jobs-and-integrations.md) |
| 9 | Row-level security exists only on `stored_files` and `studio_items`. **Needs confirmation:** is the Supabase Data API disabled for the other tables? Also: do dev, e2e and production share one Supabase project (the repo does not say; local runs here use the hosted database)? | [data-model.md](data-model.md), [auth-and-security.md](auth-and-security.md) |
| 10 | The standalone Studio nginx still sends `Permissions-Policy: microphone=()`. | [auth-and-security.md](auth-and-security.md) |
| 11 | The frontend CSP restricts `img-src` to `API_URL`. **Needs confirmation:** does it block any Studio images when Compose proxies `/studio/`? | [auth-and-security.md](auth-and-security.md) |
| 12 | Google Safe Browsing: manually added web URLs are sent to Google when a key is set. **Needs confirmation:** intended? The API's terms are non-commercial; Google suggests Web Risk for commercial use. | [features/web-threats.md](features/web-threats.md) |
| 13 | `/api/health` is not exempt from the rate limiter, although a comment in `main.py` says health routes are. | [api-reference.md](api-reference.md) |

## 2. Defects and inconsistencies found in the code

| # | Item | Where |
|---|---|---|
| 1 | The Setup wizard offers values the backend rejects with 422: platforms `tiktok` and `telegram`, store `apple` (backend expects `app_store`). | [features/brand-registry.md](features/brand-registry.md) |
| 2 | The wizard's scan-depth and alert-email fields are collected but never sent. | [features/brand-registry.md](features/brand-registry.md) |
| 3 | Removing an official account, app, logo or publisher does not reopen detections that were closed as `marked_official`. | [features/brand-registry.md](features/brand-registry.md) |
| 4 | No endpoint lists archived brands, so restoring needs the brand id. | [features/brand-registry.md](features/brand-registry.md) |
| 5 | The Investigations "Marked official" status filter always returns an empty list. | [features/investigations.md](features/investigations.md) |
| 6 | `frontend/src/api/auth.ts` defines `forgot()` and `reset()` but `/api/auth/forgot` and `/api/auth/reset` do not exist. | [features/authentication-and-accounts.md](features/authentication-and-accounts.md) |
| 7 | Dashboard "Needs review" links web look-alike cases to `/social` instead of `/web`. | [features/dashboard.md](features/dashboard.md) |
| 8 | Manual and imported candidates are saved with `source="live"`, so the default list filter hides them in sample mode. The import report's `accepted` count includes official and not-flagged rows. | [features/social-and-app-threats.md](features/social-and-app-threats.md), [features/candidate-import.md](features/candidate-import.md) |
| 9 | `REACHABILITY_CHECKS_PER_SCAN` and `SCHEDULER_MAX_QUERIES_PER_SCAN` are declared but nothing reads them; `TEXT_EMBEDDINGS_ENABLED` only feeds `/api/providers` status. | [features/scanning-and-detection.md](features/scanning-and-detection.md) |
| 10 | UI wording that no code supports: Web Threats empty state mentions "web checks enabled"; the App page footer says store screenshots are saved as evidence but screenshots are off by default. `TestBody.platform` is never sent by the UI. | [features/web-threats.md](features/web-threats.md), [features/lookalike-lab.md](features/lookalike-lab.md) |
| 11 | `reports.file_path` is never read or written. | [data-model.md](data-model.md) |
| 12 | `google-genai` has different version ranges in `requirements.txt` (`>=1.20,<3`) and `requirements-extra.txt` (`>=2.30,<3`). | [tech-stack.md](tech-stack.md) |
| 13 | CLIP install hints differ between the UI (`pip install fastembed`) and the backend (mentions `requirements-extra.txt`). | [features/lookalike-lab.md](features/lookalike-lab.md) |
| 14 | Neither `frontend` nor `studio` enables TypeScript `strict`. | [contributing.md](contributing.md) |
| 15 | The comment at `docker-compose.yml:11` says `backend/` belongs to an older product, while the images build from `./backend`. | [configuration.md](configuration.md) |

Fixed while this documentation was written: `Permissions-Policy` was `microphone=()` in `vercel.json` and the frontend nginx (now `microphone=(self)`), and the worker healthcheck in `docker-compose.yml` imported a non-existent module (now `app.config.config`). Neither fix was verified on a deployed or Docker build.

## 3. Operations and process

| # | Question | Where |
|---|---|---|
| 1 | How are Vercel deploys triggered, and is there a documented rollback? There is no deploy job in CI and no staging environment in the repo. | [setup-and-deployment.md](setup-and-deployment.md) |
| 2 | Is the Vercel cron in `services` mode working? It was not verified live (`docs/DEPLOY_VERCEL.md:55-57`). | [background-jobs-and-integrations.md](background-jobs-and-integrations.md) |
| 3 | Are the optional extras (fastembed, google-play-scraper, huggingface_hub) installed on Vercel? | [background-jobs-and-integrations.md](background-jobs-and-integrations.md) |
| 4 | Branch naming, branch protection, reviewers, merge style, release process, commit convention, and who approves scoring-weight changes. None is defined in the repo. | [contributing.md](contributing.md) |
| 5 | No script moves files between `STORAGE_BACKEND=local` and `database`. | [data-model.md](data-model.md) |
| 6 | The standalone landing-page HTML the React page was generated from is not in the repo. | [features/landing-page.md](features/landing-page.md) |

## 4. Documentation gaps

- Exact result keys of `/api/candidates/*`, the `/api/lookalike/test` verdict, non-database health statuses and the voice fast-path `reply`/`finish` values are not enumerated in [api-reference.md](api-reference.md).
- Per-page prop and layout detail in [frontend.md](frontend.md) was summarised from titles and imports, not a full read of every page.
- `EMAXCONNSESSION` is not a string in this repo; it is the code Supabase returns ([troubleshooting.md](troubleshooting.md)).

## 5. Missing document

`docs/features/reports.md` was not written: the agent drafting it was refused by its Write tool and left a draft outside the repo. Its findings (from the draft's own list): reports do not re-verify the evidence hash, and the creator can approve their own report. Reports are described briefly in [api-reference.md](api-reference.md) and the older `docs/USER_GUIDE.md`.
