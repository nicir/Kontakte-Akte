from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request

from app.api.deps import AppState, api_error, get_state, require_session, session_token
from app.database.manager import AlreadyInitialized, MigrationFailed, NotInitialized
from app.database.sqlcipher import InvalidPassword
from app.schemas.common import OkResponse
from app.schemas.misc import AuthStatus, ChangePasswordInput, PasswordInput, SessionOut, SetupInput
from app.services.settings import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])
log = logging.getLogger("kontakte_akte.auth")


def _load_runtime_settings(state: AppState) -> None:
    with state.db() as session:
        state.auto_lock_minutes = get_settings(session).auto_lock_minutes


@router.get("/status", response_model=AuthStatus)
def status(request: Request, state: AppState = Depends(get_state)) -> AuthStatus:
    authenticated = False
    if state.manager.is_unlocked():
        authenticated = state.sessions.check(session_token(request), state.idle_limit_seconds()) == "ok"
    return AuthStatus(
        initialized=state.manager.is_initialized(),
        unlocked=state.manager.is_unlocked(),
        authenticated=authenticated,
    )


@router.post("/setup", response_model=SessionOut)
def setup(data: SetupInput, state: AppState = Depends(get_state)) -> SessionOut:
    if data.password != data.password_confirm:
        raise api_error(422, "password_mismatch", "Die Passwörter stimmen nicht überein.")
    with state.lock:
        try:
            state.manager.setup(data.password)
        except AlreadyInitialized as exc:
            raise api_error(409, "already_initialized", "Kontakte-Akte ist bereits eingerichtet.") from exc
        except ValueError as exc:
            raise api_error(422, "invalid_password", str(exc)) from exc
        state.sessions.clear()
        _load_runtime_settings(state)
        log.info("Initial setup completed")
        return SessionOut(session_token=state.sessions.issue())


@router.post("/unlock", response_model=SessionOut)
def unlock(data: PasswordInput, state: AppState = Depends(get_state)) -> SessionOut:
    with state.lock:
        try:
            result = state.manager.unlock(data.password)
        except NotInitialized as exc:
            raise api_error(409, "not_initialized", "Kontakte-Akte ist noch nicht eingerichtet.") from exc
        except (InvalidPassword, ValueError) as exc:
            log.info("Unlock failed")
            raise api_error(401, "invalid_password", "Das Passwort ist nicht korrekt.") from exc
        except MigrationFailed as exc:
            hint = f" Sicherung: {exc.backup_file}" if exc.backup_file else ""
            raise api_error(500, "migration_failed", "Die Datenbank konnte nicht aktualisiert werden." + hint) from exc
        state.sessions.clear()
        _load_runtime_settings(state)
        log.info("Database unlocked")
        return SessionOut(
            session_token=state.sessions.issue(),
            migrated=result.migrated,
            pre_migration_backup=result.pre_migration_backup,
        )


@router.post("/lock", response_model=OkResponse)
def lock(state: AppState = Depends(get_state)) -> OkResponse:
    # Locking is always allowed (bridge token already verified by middleware).
    with state.lock:
        state.lock_all()
    log.info("Database locked")
    return OkResponse()


@router.post("/ping", response_model=OkResponse)
def ping(state: AppState = Depends(require_session)) -> OkResponse:
    return OkResponse()


@router.post("/change-password", response_model=OkResponse)
def change_password(data: ChangePasswordInput, state: AppState = Depends(require_session)) -> OkResponse:
    if data.new_password != data.new_password_confirm:
        raise api_error(422, "password_mismatch", "Die neuen Passwörter stimmen nicht überein.")
    with state.lock:
        try:
            state.manager.change_password(data.current_password, data.new_password)
        except InvalidPassword as exc:
            raise api_error(401, "invalid_password", "Das aktuelle Passwort ist nicht korrekt.") from exc
        except ValueError as exc:
            raise api_error(422, "invalid_password", str(exc)) from exc
    return OkResponse()
