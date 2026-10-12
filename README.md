# ScamMind AI

Brand-protection workspace: find fake profiles, look-alike websites and clone apps, link them into the campaign behind them, and prepare an
evidence-backed takedown report that **a person approves**.

* `frontend/` React + TypeScript + Vite app (10 designed screens + evaluation view; see [frontend/README.md](frontend/README.md) to run it against `server/`)
* `server/` the FastAPI server the frontend talks to (see [server/README.md](server/README.md))
* `backend/` FastAPI API with the TrustMesh detection engine: see [backend/README.md](backend/README.md) for what is real and what is sample data

## Run everything

```bash
docker compose up --build
# API       http://localhost:8000/docs
# Frontend  http://localhost:5173   sign in as admin@company.com (password: ADMIN_PASSWORD, default ChangeMe!123)
```

## Run for development

```bash
# terminal 1: API
cd backend && pip install -r requirements-dev.txt && cp .env.example .env && uvicorn app.main:app --reload

# terminal 2: frontend (VITE_API_URL defaults to http://127.0.0.1:8000)
cd frontend && npm install && npm run dev
```

Note: the frontend now targets `server/` (Phase 5). The old `backend/` is a different product and is not used by the frontend any more; the
frontend has no offline sample mode (sample data only comes from the server and is badged). See `frontend/README.md`.

```bash
cd frontend && npm run build   # type-check + production build
cd backend && pytest    # backend tests
```
