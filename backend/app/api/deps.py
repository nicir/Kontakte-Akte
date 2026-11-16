from __future__ import annotations

import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import AppConfig
from app.database.manager import DatabaseManager
from app.security.bridge import BridgeToken
from app.security.sessions import SessionStore

# Grace period on top of the client-side auto-lock so the UI timer stays authoritative.
SERVER_IDLE_GRACE_SECONDS = 120


@dataclass
class AppState:
    config: AppConfig
    manager: DatabaseManager
    bridge: BridgeToken
    sessions: SessionStore = field(default_factory=SessionStore)
    auto_lock_minutes: int = 15
    lock: threading.Lock = field(default_factory=threading.Lock)

    @contextmanager
    def db(self) -> Iterator[Session]:
        with self.manager.session() as session:
            yield session

    def idle_limit_seconds(self) -> float | None:
        if self.auto_lock_minutes <= 0:
            return None
        return self.auto_lock_minutes * 60 + SERVER_IDLE_GRACE_SECONDS

    def lock_all(self) -> None:
        self.sessions.clear()
        self.manager.lock()


def api_error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def get_state(request: Request) -> AppState:
    return request.app.state.ka  # type: ignore[no-any-return]


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip() or None
    return None


def require_session(request: Request, state: AppState = Depends(get_state)) -> AppState:
    if not state.manager.is_unlocked():
        raise api_error(423, "locked", "Kontakte-Akte ist gesperrt.")
    result = state.sessions.check(_bearer(request), state.idle_limit_seconds())
    if result == "idle":
        state.lock_all()
        raise api_error(423, "locked", "Kontakte-Akte wurde wegen Inaktivität gesperrt.")
    if result != "ok":
        raise api_error(401, "unauthorized", "Nicht angemeldet.")
    return state


def session_token(request: Request) -> str | None:
    return _bearer(request)
