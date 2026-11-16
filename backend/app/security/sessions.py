"""In-memory session tokens issued after a successful unlock.

Tokens are random 256-bit values; only their SHA-256 digests are kept. All
sessions are discarded on lock. The desktop shell keeps the token in Rust
memory; it is never exposed to the web frontend.
"""

from __future__ import annotations

import hashlib
import secrets
import threading
import time


class SessionStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sessions: dict[str, float] = {}

    @staticmethod
    def _digest(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def issue(self) -> str:
        token = secrets.token_urlsafe(32)
        with self._lock:
            self._sessions[self._digest(token)] = time.monotonic()
        return token

    def check(self, token: str | None, idle_limit_seconds: float | None) -> str:
        """Return 'ok', 'invalid' or 'idle'. Touches the session on success."""
        if not token:
            return "invalid"
        digest = self._digest(token)
        now = time.monotonic()
        with self._lock:
            last = self._sessions.get(digest)
            if last is None:
                return "invalid"
            if idle_limit_seconds is not None and now - last > idle_limit_seconds:
                return "idle"
            self._sessions[digest] = now
            return "ok"

    def revoke(self, token: str) -> None:
        with self._lock:
            self._sessions.pop(self._digest(token), None)

    def clear(self) -> None:
        with self._lock:
            self._sessions.clear()
