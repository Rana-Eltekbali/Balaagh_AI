import json
import logging
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from zoneinfo import ZoneInfo

import anyio
import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException
from starlette.middleware.cors import CORSMiddleware

from app.api import analytics, dashboard, health, locations, reports
from app.config import Settings, get_settings
from app.db.session import create_database
from app.ml.loader import load_models
from app.schemas.summaries import ModelEvaluation
from app.services.analysis_receipt import AnalysisReceipt
from app.services.inference import InferenceService
from app.services.summary_service import SummaryService
from app.utils.http import RequestMiddleware, configure_logging, error_response

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None, *, models=None):
    cfg = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        configure_logging()
        ZoneInfo(cfg.reports_timezone)
        engine, sessions = create_database(cfg)
        app.state.sessions = sessions
        app.state.engine = engine
        try:
            try:
                async with engine.connect() as connection:
                    await connection.execute(text("SELECT 1"))
            except Exception:
                raise RuntimeError(
                    "Database unavailable; check DATABASE_URL, TLS, network and migrations"
                ) from None
            loaded = models
            if loaded is None and cfg.inference_mode == "real":
                loaded = await anyio.to_thread.run_sync(load_models, cfg)
            app.state.models_loaded = loaded is not None
            key = cfg.analysis_signing_key.get_secret_value() or secrets.token_urlsafe(48)
            if not cfg.analysis_signing_key.get_secret_value():
                logger.warning(
                    "Ephemeral analysis signing key: unsaved analysis receipts expire on restart"
                )
            receipt = AnalysisReceipt(key, cfg.analysis_token_ttl_seconds)
            app.state.receipt = receipt
            app.state.evaluation = None
            if cfg.model_evaluation_json:
                try:
                    payload = json.loads(
                        Path(cfg.model_evaluation_json).read_text(encoding="utf-8")
                    )
                    app.state.evaluation = ModelEvaluation.model_validate(payload)
                except (OSError, ValueError):
                    logger.warning(
                        "Evaluation metrics unavailable: configured file is missing or invalid"
                    )
            async with httpx.AsyncClient(follow_redirects=False) as client:
                summary = SummaryService(cfg, client)
                app.state.inference = InferenceService(loaded, summary, receipt, cfg)
                yield
        finally:
            await engine.dispose()

    app = FastAPI(title="Balaagh AI", version="1.0.0", lifespan=lifespan)
    app.state.settings = cfg
    app.add_middleware(RequestMiddleware, max_bytes=cfg.request_max_bytes)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "Authorization"],
        expose_headers=["X-Request-ID"],
    )

    @app.exception_handler(HTTPException)
    async def http_error(_request: Request, exc: HTTPException):
        return error_response(exc.status_code, f"http_{exc.status_code}", str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, _exc: RequestValidationError):
        return error_response(
            422, "validation_error", "Invalid request fields or values; check the API schema"
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_error(_request: Request, _exc: SQLAlchemyError):
        logger.error("database_operation_failed")
        return error_response(503, "database_unavailable", "Database operation failed; retry later")

    @app.exception_handler(Exception)
    async def unexpected_error(_request: Request, _exc: Exception):
        logger.error("request_failed_unexpectedly type=%s", type(_exc).__name__)
        return error_response(500, "internal_error", "Unable to complete this request")

    for router in (
        health.router,
        reports.router,
        dashboard.router,
        locations.router,
        analytics.router,
    ):
        app.include_router(router, prefix="/api")
    return app


app = create_app()
