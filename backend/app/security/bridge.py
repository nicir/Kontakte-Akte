"""Local-only request guard.

Every request must
1. carry a ``Host`` header of ``127.0.0.1`` or ``localhost`` (DNS-rebinding defence),
2. carry **no** ``Origin`` header – the only legitimate client is the Tauri
   process (Rust HTTP client), never a browser/webview context (CSRF defence),
3. present the bridge token from ``config/bridge.token`` in ``X-KA-Bridge``.
   The token file is created by the desktop app with mode 0600 inside the
   user's Application Support directory, so only processes of the same macOS
   user can read it. It is rotated on every app start.

Only ``/api/health`` is exempt from (3); it reveals no data.
"""

from __future__ import annotations

import hmac
import json
import threading
from pathlib import Path

from starlette.types import ASGIApp, Receive, Scope, Send

ALLOWED_HOSTS = {"127.0.0.1", "localhost"}
EXEMPT_PATHS = {"/api/health"}
MIN_TOKEN_LENGTH = 32


class BridgeToken:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.Lock()
        self._cache: tuple[int, int, str] | None = None

    def _current(self) -> str | None:
        try:
            stat = self.path.stat()
        except OSError:
            return None
        with self._lock:
            if self._cache and self._cache[0] == stat.st_mtime_ns and self._cache[1] == stat.st_size:
                return self._cache[2]
            try:
                token = self.path.read_text(encoding="utf-8").strip()
            except OSError:
                return None
            if len(token) < MIN_TOKEN_LENGTH:
                return None
            self._cache = (stat.st_mtime_ns, stat.st_size, token)
            return token

    def verify(self, presented: str | None) -> bool:
        if not presented:
            return False
        token = self._current()
        if token is None:
            return False
        return hmac.compare_digest(presented.encode("utf-8"), token.encode("utf-8"))


def _hostname(host: str) -> str:
    if host.startswith("["):
        return host.split("]")[0] + "]"
    return host.rsplit(":", 1)[0] if ":" in host else host


class LocalOnlyMiddleware:
    def __init__(self, app: ASGIApp, bridge: BridgeToken) -> None:
        self.app = app
        self.bridge = bridge

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
        if _hostname(headers.get("host", "")) not in ALLOWED_HOSTS:
            await _reject(send, 403, "forbidden_host")
            return
        if "origin" in headers:
            await _reject(send, 403, "forbidden_origin")
            return
        if scope.get("path") not in EXEMPT_PATHS and not self.bridge.verify(headers.get("x-ka-bridge")):
            await _reject(send, 401, "bridge_required")
            return

        async def send_with_headers(message: dict) -> None:  # type: ignore[type-arg]
            if message["type"] == "http.response.start":
                extra = [
                    (b"cache-control", b"no-store"),
                    (b"x-content-type-options", b"nosniff"),
                    (b"referrer-policy", b"no-referrer"),
                ]
                message["headers"] = list(message.get("headers", [])) + extra
            await send(message)

        await self.app(scope, receive, send_with_headers)


async def _reject(send: Send, status: int, code: str) -> None:
    body = json.dumps({"detail": {"code": code, "message": "Zugriff verweigert."}}).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
        }
    )
    await send({"type": "http.response.body", "body": body})
