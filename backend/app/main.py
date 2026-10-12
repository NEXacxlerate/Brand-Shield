"""ScamMind AI API. Run: uvicorn app.main:app"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from . import jobs
from .config import settings
from .db import init_db, session_scope
from .routers import admin, apps, auth, brands, campaigns, dashboard, entities, evidence, investigations, reports, scan, simulator, watchlist
from .security import limiter
from .services import seed_service

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_dirs()
    if settings.env == "production" and (settings.secret_key.startswith("dev-only") or len(settings.secret_key) < 32):
        raise RuntimeError("Refusing to start: set SECRET_KEY to a long random value when ENV=production")
    if settings.admin_password == "ChangeMe!123":
        logging.getLogger("scammind").warning("ADMIN_PASSWORD is the default. Change it before exposing this server.")
    init_db()
    with session_scope() as db:
        seed_service.seed_demo(db)
    if settings.scheduler_enabled:
        jobs.start_scheduler()
    yield
    jobs.stop_scheduler()


app = FastAPI(title="ScamMind AI API", version="1.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.frontend_origin.split(",") if o.strip()], allow_credentials=True,
                   allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type"])


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    return resp


for r in (auth, dashboard, investigations, apps, campaigns, entities, brands, simulator, reports, watchlist, scan, evidence, admin):
    app.include_router(r.router)
