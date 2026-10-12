from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.api import audit, auth, brands, health
from app.core.config import Settings, get_settings
from app.core.errors import install_error_handlers
from app.core.logging import configure_logging
from app.core.ratelimit import FailureLimiter
from app.db.session import make_engine, make_session_factory
from app.services.seed import seed_admin
from app.services.url_safety import UrlChecker


def create_app(settings: Settings | None = None, *, engine: Engine | None = None, url_checker: UrlChecker | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level, settings.secret_values)
    engine = engine or make_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        try:
            with app.state.session_factory() as db:
                seed_admin(db, settings)
        except SQLAlchemyError:
            # Tables may not exist yet (migrations not applied). /health will report the problem.
            import logging

            logging.getLogger("app").warning("admin seed skipped: database not ready (run alembic upgrade head)")
        yield

    app = FastAPI(title="ScamMind AI", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = make_session_factory(engine)
    app.state.login_limiter = FailureLimiter(settings.login_max_failures, settings.login_window_seconds)
    app.state.url_checker = url_checker or UrlChecker(
        timeout=settings.url_check_timeout_seconds,
        max_redirects=settings.url_check_max_redirects,
        max_bytes=settings.url_check_max_bytes,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)

    api = APIRouter(prefix="/api")
    api.include_router(auth.router)
    api.include_router(brands.router)
    api.include_router(audit.router)
    app.include_router(health.router)
    app.include_router(api)
    return app
