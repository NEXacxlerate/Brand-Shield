# BrandShield documentation index

**Plain-language summary.** BrandShield finds fake social profiles, fake apps and look-alike websites that imitate a brand, explains every score, and leaves each decision to a person. This folder explains how it is built and how to run it. New to the project? Read the [README](../README.md), then [architecture](architecture.md), then the feature you care about.

## Start here

| Document | What it covers |
|---|---|
| [../README.md](../README.md) | What the app does, quick start (`npm run backend`, `npm run frontend`), commands |
| [architecture.md](architecture.md) | Components, diagrams (context, components, deployment), folders, design decisions |
| [tech-stack.md](tech-stack.md) | Every language, library, service and tool, with versions |
| [setup-and-deployment.md](setup-and-deployment.md) | Local setup, Docker, Vercel and Supabase, CI/CD, rollback, logging |
| [configuration.md](configuration.md) | Every environment variable and config file (names only) |

## Reference

| Document | What it covers |
|---|---|
| [api-reference.md](api-reference.md) | Every endpoint: auth, request, response, status codes |
| [data-model.md](data-model.md) | Tables, relationships (ER diagram), migrations 0001-0012 |
| [auth-and-security.md](auth-and-security.md) | Login and tokens, roles, tenant isolation, demo accounts, known risks |
| [frontend.md](frontend.md) | Pages, routing, state, components, styling, API integration |
| [background-jobs-and-integrations.md](background-jobs-and-integrations.md) | Scheduler, worker, cron, and every third-party service |
| [testing.md](testing.md) | Test strategy, how to run, structure |
| [troubleshooting.md](troubleshooting.md) | Common errors, causes and fixes |
| [contributing.md](contributing.md) | Code style, how to add endpoints, pages, migrations, collectors |
| [glossary.md](glossary.md) | Domain terms as this code uses them |
| [open-questions.md](open-questions.md) | Things that need your decision, and defects found |

## Features

| Feature | Document |
|---|---|
| Sign-in, accounts, roles, demo accounts | [features/authentication-and-accounts.md](features/authentication-and-accounts.md) |
| Brand profile, multiple brands, official assets | [features/brand-registry.md](features/brand-registry.md) |
| Scanning and detection (collectors, scoring) | [features/scanning-and-detection.md](features/scanning-and-detection.md) |
| Social Threats and App Threats | [features/social-and-app-threats.md](features/social-and-app-threats.md) |
| Web Threats (look-alike domains, Safe Browsing) | [features/web-threats.md](features/web-threats.md) |
| Look-alike Lab (names, URLs, logos) | [features/lookalike-lab.md](features/lookalike-lab.md) |
| Candidate import (manual and file) | [features/candidate-import.md](features/candidate-import.md) |
| Investigations | [features/investigations.md](features/investigations.md) |
| Reports | *not written yet, see [open-questions.md](open-questions.md) section 5* |
| Source Health and providers | [features/source-health-and-providers.md](features/source-health-and-providers.md) |
| Model Evaluation | [features/model-evaluation.md](features/model-evaluation.md) |
| Settings and audit | [features/settings-and-audit.md](features/settings-and-audit.md) |
| Dashboard | [features/dashboard.md](features/dashboard.md) |
| Brand Studio | [features/brand-studio.md](features/brand-studio.md) |
| Voice assistant | [features/voice-agent.md](features/voice-agent.md) |
| Landing page | [features/landing-page.md](features/landing-page.md) |

## Older documents in this folder

These predate the set above and may be out of date; where they differ, the code and the documents above win: [API.md](API.md), [COLLECTORS.md](COLLECTORS.md), [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) (generated), [DECISIONS.md](DECISIONS.md), [DEPENDENCIES.md](DEPENDENCIES.md), [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md), [DONE_AUDIT.md](DONE_AUDIT.md), [EXTENSION_PLAN.md](EXTENSION_PLAN.md), [FEATURE_STATUS.md](FEATURE_STATUS.md), [FRONTEND_CONTRACT.md](FRONTEND_CONTRACT.md), [SECURITY.md](SECURITY.md), [SPEC_FROM_REFERENCE.md](SPEC_FROM_REFERENCE.md), [STUDIO.md](STUDIO.md), [STUDIO_INTEGRATION_CONTRACT.md](STUDIO_INTEGRATION_CONTRACT.md), [SUBMISSION.md](SUBMISSION.md), [USER_GUIDE.md](USER_GUIDE.md), [schema.sql](schema.sql).
