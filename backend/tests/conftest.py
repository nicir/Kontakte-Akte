from __future__ import annotations

import secrets
import socket
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import AppConfig
from app.main import create_app

PASSWORD = "Mein geheimes Passwort – mit Leerzeichen, 'Quotes' & Ümläuten 🔐"
BASE_URL = "http://127.0.0.1:47811"


@pytest.fixture(autouse=True)
def no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """Every test runs without network access: only loopback/unix sockets are allowed."""
    original = socket.socket.connect

    def guarded(self: socket.socket, address: Any) -> Any:
        if isinstance(address, tuple) and address[0] not in ("127.0.0.1", "::1", "localhost"):
            raise OSError(f"Network access blocked in tests: {address!r}")
        return original(self, address)

    monkeypatch.setattr(socket.socket, "connect", guarded)


@pytest.fixture
def data_root(tmp_path: Path) -> Path:
    root = tmp_path / "Kontakte-Akte"
    (root / "config").mkdir(parents=True)
    (root / "config" / "bridge.token").write_text(secrets.token_hex(32))
    return root


def bridge_token(root: Path) -> str:
    return (root / "config" / "bridge.token").read_text().strip()


class Api:
    """Thin wrapper that behaves like the Tauri bridge (bridge token + session token)."""

    def __init__(self, client: TestClient, root: Path) -> None:
        self.client = client
        self.root = root
        self.session: str | None = None

    def headers(self) -> dict[str, str]:
        headers = {"X-KA-Bridge": bridge_token(self.root)}
        if self.session:
            headers["Authorization"] = f"Bearer {self.session}"
        return headers

    def request(self, method: str, path: str, json: Any = None, expect: int | None = 200, **params: Any) -> Any:
        response = self.client.request(method, path, json=json, headers=self.headers(), params=params or None)
        if expect is not None:
            assert response.status_code == expect, f"{method} {path}: {response.status_code} {response.text}"
        return response.json() if response.content else None

    def get(self, path: str, expect: int | None = 200, **params: Any) -> Any:
        return self.request("GET", path, expect=expect, **params)

    def post(self, path: str, json: Any = None, expect: int | None = 200, **params: Any) -> Any:
        return self.request("POST", path, json=json, expect=expect, **params)

    def put(self, path: str, json: Any = None, expect: int | None = 200, **params: Any) -> Any:
        return self.request("PUT", path, json=json, expect=expect, **params)

    def delete(self, path: str, expect: int | None = 200) -> Any:
        return self.request("DELETE", path, expect=expect)

    def setup(self, password: str = PASSWORD) -> None:
        result = self.post("/api/auth/setup", {"password": password, "password_confirm": password})
        self.session = result["session_token"]

    def unlock(self, password: str = PASSWORD) -> None:
        result = self.post("/api/auth/unlock", {"password": password})
        self.session = result["session_token"]

    def create_contact(self, **fields: Any) -> dict[str, Any]:
        return self.post("/api/contacts", fields, expect=201)

    def search(self, **query: Any) -> dict[str, Any]:
        return self.post("/api/contacts/search", query)


@pytest.fixture
def make_api(data_root: Path) -> Iterator[Callable[[], Api]]:
    """Factory: each call simulates a fresh backend process on the same data directory."""
    clients: list[TestClient] = []

    def factory() -> Api:
        app = create_app(AppConfig(data_root=data_root))
        client = TestClient(app, base_url=BASE_URL)
        clients.append(client)
        return Api(client, data_root)

    yield factory
    for client in clients:
        client.close()


@pytest.fixture
def api(make_api: Callable[[], Api]) -> Api:
    instance = make_api()
    instance.setup()
    return instance


def rahul() -> dict[str, Any]:
    return {
        "first_name": "Rahul",
        "last_name": "Sharma",
        "city": "Singapur",
        "job_title": "Partner",
        "current_organization": "Sharma & Partners LLP",
        "countries": {
            "nationality": ["IN"],
            "residence": ["SG"],
            "activity": ["IN", "SG", "AE"],
            "expertise": ["IN"],
            "interest": ["DE", "FR"],
        },
        "classifications": {
            "profession": ["Rechtsanwalt"],
            "specialization": ["Indisches Steuerrecht", "Internationales Steuerrecht"],
            "industry": ["Rechtsberatung", "Finanzdienstleistungen"],
            "topic": ["Grenzüberschreitende Investitionen"],
            "collaboration": ["Investitionsprojekt Indien–Europa"],
        },
        "first_met_place": "Konferenz in Singapur",
        "first_met_date": "2026-03-01",
        "how_known": "Auf einer Steuerkonferenz kennengelernt",
        "channels": [
            {"kind": "email", "label": "Arbeit", "value": "rahul@example.com"},
            {"kind": "phone", "label": "Mobil", "value": "+65 1234 5678"},
        ],
    }
