import hashlib
import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.api import (
    audit,
    auth,
    brands,
    candidates,
    cron,
    dashboard,
    detections,
    evaluation,
    health,
    lookalike,
    providers,
    r2,
    reports,
    scans,
    sources,
    studio,
    studio_ai,
    voice,
)
from app.api import settings as settings_api
from app.config import response_cache
from app.config.config import Settings, get_settings, is_vercel
from app.config.errors import install_error_handlers
from app.config.logging import configure_logging
from app.config.observability import init_sentry
from app.config.ratelimit import FailureLimiter, RequestLimiter
from app.core.collectors.selection import CollectorRuntime
from app.core.pipeline.image_fetch import SafeFetcher
from app.core.pipeline.screenshot import ScreenshotProvider
from app.core.pipeline.url_safety import UrlChecker
from app.core.storage import build_store
from app.db.session import make_engine, make_session_factory
from app.services.context import build_context
from app.services.scheduler import SchedulerLoop
from app.services.seed import seed_admin, seed_demo, seed_demo_admin
from app.services.studio_ai import StudioAI
from app.services.voice import VoiceAgent


def create_app(
    settings: Settings | None = None,
    *,
    engine: Engine | None = None,
    url_checker: UrlChecker | None = None,
    collector_runtime: CollectorRuntime | None = None,
    image_fetcher: SafeFetcher | None = None,
    screenshot_provider: ScreenshotProvider | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level, settings.secret_values)
    init_sentry(settings)  # no-op unless SENTRY_DSN is set and sentry-sdk is installed
    engine = engine or make_engine(settings.database_url)
    if is_vercel():
        logging.getLogger("app").info(
            "Vercel mode: executor=%s scheduler=%s storage=%s cache_s=%s (scans via Vercel Cron)",
            settings.scan_executor, settings.scheduler_enabled, settings.storage_backend, settings.response_cache_seconds,
        )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        try:
            settings.data_dir.mkdir(parents=True, exist_ok=True)
        except OSError:
            if settings.storage_backend != "database":  # files then live in the database, DATA_DIR is only scratch space
                logging.getLogger("app").error("DATA_DIR cannot be created or is not writable: /health reports data_dir=down")
        try:
            with app.state.session_factory() as db:
                seed_admin(db, settings)
                seed_demo(db, settings)
                seed_demo_admin(db, settings)
        except SQLAlchemyError:
            # Tables may not exist yet (migrations not applied). /health will report the problem.
            logging.getLogger("app").warning("admin seed skipped: database not ready (run alembic upgrade head)")
        loop = None
        # The scheduler loop only runs when enabled, and never under APP_ENV=test.
        if settings.scheduler_enabled and settings.app_env != "test":
            loop = SchedulerLoop(app.state.scan_ctx, settings.scheduler_poll_seconds)
            loop.start()
        app.state.scheduler_loop = loop
        yield
        if loop is not None:
            loop.stop()

    app = FastAPI(title="BrandShield", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = make_session_factory(engine)
    app.state.file_store = build_store(settings, app.state.session_factory)
    app.state.login_limiter = FailureLimiter(settings.login_max_failures, settings.login_window_seconds)
    app.state.signup_ip_limiter = RequestLimiter(settings.signup_max_per_ip_per_hour, 3600)
    app.state.signup_email_limiter = RequestLimiter(settings.signup_max_per_email_per_hour, 3600)
    app.state.studio_ai = StudioAI(settings)
    app.state.studio_ai_limiter = RequestLimiter(settings.studio_ai_rate_per_minute, 60)
    app.state.voice_limiter = RequestLimiter(settings.voice_rate_per_minute, 60)
    app.state.voice_agent = VoiceAgent(settings)
    app.state.request_limiter = RequestLimiter(settings.api_rate_limit_per_minute, 60)
    app.state.url_checker = url_checker or UrlChecker(
        timeout=settings.url_check_timeout_seconds,
        max_redirects=settings.url_check_max_redirects,
        max_bytes=settings.url_check_max_bytes,
    )
    app.state.collector_runtime = collector_runtime or CollectorRuntime(settings, app.state.session_factory)
    app.state.scan_ctx = build_context(
        settings, app.state.session_factory, app.state.collector_runtime, fetcher=image_fetcher, screenshot=screenshot_provider,
        store=app.state.file_store,
    )
    app.state.scheduler_loop = None

    @app.middleware("http")
    async def rate_limit(request: Request, call_next):
        # /health* and CORS preflights are exempt. Both the client IP and (if present) the bearer token are limited,
        # so garbage tokens cannot be used to dodge the per-IP bucket.
        path = request.url.path
        if path.startswith("/api") and request.method != "OPTIONS":
            lim: RequestLimiter = request.app.state.request_limiter
            ip = request.client.host if request.client else "unknown"
            keys = [f"ip:{ip}"]
            auth = request.headers.get("authorization")
            if auth:
                keys.append("tok:" + hashlib.sha256(auth.encode()).hexdigest()[:16])
            if not all([lim.allow(k) for k in keys]):
                return JSONResponse(
                    {"detail": "Too many requests. Slow down and retry shortly."}, status_code=429, headers={"Retry-After": "60"}
                )
        return await call_next(request)

    @app.middleware("http")
    async def cache_reads(request: Request, call_next):
        ttl = settings.response_cache_seconds
        path = request.url.path
        if ttl <= 0 or not path.startswith("/api"):
            return await call_next(request)
        if request.method == "GET" and path in response_cache.CACHEABLE:
            key = response_cache.key_for(path, request.url.query, request.headers.get("authorization"))
            hit = response_cache.get(key, ttl)
            if hit is not None:
                return Response(content=hit[0], media_type=hit[1], headers={"X-Cache": "hit"})
            response = await call_next(request)
            if response.status_code != 200:
                return response
            body = b"".join([chunk async for chunk in response.body_iterator])
            media = response.media_type or "application/json"
            response_cache.put(key, body, media)
            return Response(content=body, status_code=200, media_type=media)
        response = await call_next(request)
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            response_cache.bust()  # any write: the next read recomputes
        return response

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_origin_regex=settings.cors_origin_regex or None,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)

    api = APIRouter(prefix="/api")
    api.include_router(auth.router)
    api.include_router(brands.router)
    api.include_router(audit.router)
    api.include_router(cron.router)
    api.include_router(sources.router)
    for r in (scans, detections, dashboard, lookalike, settings_api, reports, evaluation, candidates, providers):
        api.include_router(r.router)
    api.include_router(candidates.images)
    api.include_router(r2.router)
    api.include_router(studio.router)
    api.include_router(studio_ai.router)
    api.include_router(voice.router)
    app.include_router(health.router)
    app.include_router(api)
    return app
