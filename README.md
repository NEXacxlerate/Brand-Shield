# ScamMind AI

Brand-protection workspace: find fake profiles, look-alike websites and clone apps, link them into the campaign behind them, and prepare an
evidence-backed takedown report that **a person approves**.

* `frontend/` React + TypeScript + Vite app (12 pages; source in `frontend/src`)
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

If the API cannot be reached the login page offers "Continue with sample data (offline)", the pages render the bundled sample data and the
header shows an **Offline: showing sample data** chip.

```bash
cd frontend && npm run build   # type-check + production build
cd backend && pytest    # backend tests
```
