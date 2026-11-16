"""FastAPI application factory for the Kontakte-Akte backend."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app import SERVICE_NAME, __version__
from app.api import activity, auth, classifications, contacts, overview
from app.api.deps import AppState
from app.config import AppConfig, load_config
from app.database.manager import DatabaseLocked, DatabaseManager
from app.database.sqlcipher import assert_sqlcipher_available
from app.security.bridge import BridgeToken, LocalOnlyMiddleware
from app.services.errors import ServiceError

log = logging.getLogger("kontakte_akte")


def _configure_logging() -> None:
    # Only structural events are logged – never request bodies, names, notes or passwords.
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def _validation_message(exc: RequestValidationError) -> str:
    for error in exc.errors():
        message = str(error.get("msg", ""))
        if message.startswith("Value error, "):
            return message.removeprefix("Value error, ")
    return "Die Eingabe ist ungültig. Bitte prüfe die markierten Felder."


def create_app(config: AppConfig | None = None) -> FastAPI:
    _configure_logging()
    config = config or load_config()
    cipher_version = assert_sqlcipher_available()
    config.ensure_directories()

    app = FastAPI(
        title="Kontakte-Akte",
        version=__version__,
        docs_url="/api/docs" if config.dev_mode else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if config.dev_mode else None,
    )
    state = AppState(config=config, manager=DatabaseManager(config), bridge=BridgeToken(config.bridge_token_file))
    app.state.ka = state
    # No CORS middleware on purpose: browser origins are never allowed.
    app.add_middleware(LocalOnlyMiddleware, bridge=state.bridge)

    @app.exception_handler(ServiceError)
    async def _service_error(_: Request, exc: ServiceError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": {"code": exc.code, "message": exc.message}})

    @app.exception_handler(DatabaseLocked)
    async def _locked(_: Request, __: DatabaseLocked) -> JSONResponse:
        return JSONResponse(
            status_code=423, content={"detail": {"code": "locked", "message": "Kontakte-Akte ist gesperrt."}}
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [".".join(str(p) for p in e.get("loc", ()) if p != "body") for e in exc.errors()]
        return JSONResponse(
            status_code=422,
            content={"detail": {"code": "validation", "message": _validation_message(exc), "fields": fields}},
        )

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception) -> JSONResponse:
        log.error("Unhandled error: %s", type(exc).__name__)
        return JSONResponse(
            status_code=500,
            content={"detail": {"code": "internal", "message": "Ein unerwarteter Fehler ist aufgetreten."}},
        )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": SERVICE_NAME, "version": __version__}

    for router in (auth.router, contacts.router, classifications.router, activity.router, overview.router):
        app.include_router(router)

    log.info("Kontakte-Akte backend %s started (SQLCipher %s)", __version__, cipher_version)
    return app
