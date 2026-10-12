# ScamMind AI server (Phase 1: skeleton and data model)

FastAPI + SQLAlchemy 2 + Alembic. PostgreSQL in production, SQLite for local and tests.
Design decisions: `../docs/DECISIONS.md`. API contract: `../docs/API.md`. Licenses: `../docs/DEPENDENCIES.md`.

## Run

```powershell
cd server
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
copy .env.example .env        # then fill in JWT_SECRET (16+ chars), ADMIN_EMAIL, ADMIN_PASSWORD
.\.venv\Scripts\python -m alembic upgrade head
.\.venv\Scripts\python -m uvicorn app.main:create_app --factory --reload --port 8000
```

Secrets come only from environment variables or `server/.env` (gitignored). `.env.example` lists names only.
For PostgreSQL set `DATABASE_URL=postgresql+psycopg://user:password@host:5432/dbname` (not exercised yet in Phase 1).
The admin user is created on startup from `ADMIN_EMAIL` / `ADMIN_PASSWORD` if it does not exist; an existing password is never overwritten.

## Test

```powershell
cd server
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\python -m ruff check .
```

Tests use SQLite in memory and never touch the network (the URL checker is injected).

## Endpoints (Phase 1)

| Method and path | Role |
|---|---|
| GET `/health`, `/api/health` | public (503 if DB is down) |
| POST `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout` | public |
| GET `/api/me`, `/api/auth/me` | any signed-in user |
| GET/POST `/api/brands`, GET/PUT `/api/brands/{id}` | read: any; write: analyst, admin |
| POST/GET `/api/brands/{id}/logo` | upload: analyst, admin; read: any |
| GET/POST/DELETE `/api/brands/{id}/accounts` | read: any; write: analyst, admin |
| GET/POST/DELETE `/api/brands/{id}/apps` | read: any; write: analyst, admin |
| GET `/api/audit`, `/api/audit/export.csv` | analyst, admin |

Errors are always `{"detail": ...}` (string, or a list of `{loc,msg,type}` for 422).

## Phase 3: collectors with a fallback chain

See `../docs/COLLECTORS.md` (how each collector works, what to provide, first live check). New endpoints:
GET `/api/sources`, PATCH `/api/sources/{id}`, POST `/api/sources/{id}/retry`, GET/PUT `/api/settings/data-mode` (details in `../docs/API.md`, section 9).
Tests never touch the network: HTTP is mocked and real network/DNS access is blocked by a test guard; fixtures are hand-written (`tests/fixtures/README.md`).
