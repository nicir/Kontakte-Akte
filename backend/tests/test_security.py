from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

import pytest

from app.database.sqlcipher import PLAINTEXT_SQLITE_HEADER, InvalidPassword, open_encrypted
from tests.conftest import BASE_URL, PASSWORD, Api, bridge_token, rahul

MARKER = "UNVERWECHSELBARER-GEHEIMTEXT-4711"


def db_file(root: Path) -> Path:
    return root / "data" / "kontakte-akte.db"


def test_database_file_is_encrypted_on_disk(api: Api, data_root: Path) -> None:
    api.create_contact(first_name=MARKER, personal_notes=f"Notiz {MARKER}")
    api.post("/api/auth/lock")
    raw = db_file(data_root).read_bytes()
    assert raw[:16] != PLAINTEXT_SQLITE_HEADER
    assert MARKER.encode() not in raw
    assert b"contacts" not in raw  # not even table names are visible
    assert not list((data_root / "data").glob("*-wal"))


def test_plain_sqlite_cannot_read_database(api: Api, data_root: Path) -> None:
    api.create_contact(first_name="Rahul")
    api.post("/api/auth/lock")
    conn = sqlite3.connect(db_file(data_root))
    with pytest.raises(sqlite3.DatabaseError):
        conn.execute("SELECT * FROM contacts").fetchall()
    conn.close()


def test_wrong_password_is_rejected_and_correct_one_unlocks(api: Api, make_api) -> None:  # type: ignore[no-untyped-def]
    api.create_contact(first_name="Rahul")
    api.post("/api/auth/lock")
    fresh = make_api()
    response = fresh.post("/api/auth/unlock", {"password": "falsch"}, expect=401)
    assert response["detail"]["message"] == "Das Passwort ist nicht korrekt."
    with pytest.raises(InvalidPassword):
        open_encrypted(db_file(fresh.root), PASSWORD[:-1])  # no silent truncation/prefix match
    fresh.unlock()
    assert fresh.search()["total"] == 1


def test_locked_database_cannot_be_queried(api: Api) -> None:
    api.create_contact(first_name="Rahul")
    api.post("/api/auth/lock")
    assert api.post("/api/contacts/search", {}, expect=423)["detail"]["code"] == "locked"
    assert api.get("/api/dashboard", expect=423)["detail"]["code"] == "locked"
    status = api.get("/api/auth/status")
    assert status == {"initialized": True, "unlocked": False, "authenticated": False}


def test_requests_without_bridge_token_fail(api: Api) -> None:
    r = api.client.post("/api/contacts/search", json={}, headers={"Authorization": f"Bearer {api.session}"})
    assert r.status_code == 401
    r = api.client.post(
        "/api/contacts/search", json={}, headers={"Authorization": f"Bearer {api.session}", "X-KA-Bridge": "x" * 64}
    )
    assert r.status_code == 401


def test_requests_without_session_fail(api: Api) -> None:
    r = api.client.post("/api/contacts/search", json={}, headers={"X-KA-Bridge": bridge_token(api.root)})
    assert r.status_code == 401
    r = api.client.post(
        "/api/contacts/search",
        json={},
        headers={"X-KA-Bridge": bridge_token(api.root), "Authorization": "Bearer forged"},
    )
    assert r.status_code == 401


def test_browser_origins_and_foreign_hosts_are_rejected(api: Api) -> None:
    headers = api.headers()
    r = api.client.post("/api/contacts/search", json={}, headers={**headers, "Origin": "https://evil.example"})
    assert r.status_code == 403
    # DNS rebinding: attacker domain resolving to 127.0.0.1 still sends its own Host header.
    r = api.client.post("/api/contacts/search", json={}, headers={**headers, "Host": "evil.example:47811"})
    assert r.status_code == 403
    # Health is public but still protected against foreign hosts / origins.
    assert api.client.get("/api/health").json()["service"] == "kontakte-akte"
    assert api.client.get("/api/health", headers={"Origin": "http://evil.example"}).status_code == 403
    # No CORS headers are ever emitted.
    r = api.client.options(
        "/api/contacts/search", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "POST"}
    )
    assert "access-control-allow-origin" not in r.headers


def test_setup_cannot_be_repeated(api: Api) -> None:
    r = api.post("/api/auth/setup", {"password": "neu", "password_confirm": "neu"}, expect=409)
    assert r["detail"]["code"] == "already_initialized"


def test_setup_requires_bridge_token(make_api) -> None:  # type: ignore[no-untyped-def]
    fresh = make_api()
    r = fresh.client.post("/api/auth/setup", json={"password": "x", "password_confirm": "x"})
    assert r.status_code == 401
    assert not (fresh.root / "data" / "kontakte-akte.db").exists()


def test_password_without_composition_rules(make_api) -> None:  # type: ignore[no-untyped-def]
    fresh = make_api()
    long_unicode = "  ein sehr langer Satz mit Leerzeichen 🦊 ' \" ; -- DROP TABLE contacts; " * 20
    fresh.setup(long_unicode)
    fresh.create_contact(first_name="Ada")
    fresh.post("/api/auth/lock")
    fresh.post("/api/auth/unlock", {"password": long_unicode.strip()}, expect=401)  # no trimming
    fresh.unlock(long_unicode)
    assert fresh.search()["total"] == 1


def test_password_mismatch_on_setup(make_api) -> None:  # type: ignore[no-untyped-def]
    fresh = make_api()
    r = fresh.post("/api/auth/setup", {"password": "a", "password_confirm": "b"}, expect=422)
    assert r["detail"]["code"] == "password_mismatch"


def test_change_password(api: Api, make_api) -> None:  # type: ignore[no-untyped-def]
    api.create_contact(first_name="Rahul")
    api.post(
        "/api/auth/change-password",
        {"current_password": "falsch", "new_password": "neu", "new_password_confirm": "neu"},
        expect=401,
    )
    api.post(
        "/api/auth/change-password",
        {"current_password": PASSWORD, "new_password": "Neues Passwort 2", "new_password_confirm": "Neues Passwort 2"},
    )
    assert api.search()["total"] == 1  # still works after re-key
    api.post("/api/auth/lock")
    fresh = make_api()
    fresh.post("/api/auth/unlock", {"password": PASSWORD}, expect=401)
    fresh.unlock("Neues Passwort 2")
    assert fresh.search()["total"] == 1


def test_lock_invalidates_sessions(api: Api) -> None:
    old = api.session
    api.post("/api/auth/lock")
    api.unlock()
    assert api.session != old
    r = api.client.post(
        "/api/contacts/search",
        json={},
        headers={"X-KA-Bridge": bridge_token(api.root), "Authorization": f"Bearer {old}"},
    )
    assert r.status_code == 401


def test_server_side_idle_lock(api: Api, monkeypatch: pytest.MonkeyPatch) -> None:
    state = api.client.app.state.ka  # type: ignore[attr-defined]
    monkeypatch.setattr(state, "idle_limit_seconds", lambda: -1.0)
    r = api.post("/api/contacts/search", {}, expect=423)
    assert r["detail"]["code"] == "locked"
    assert not state.manager.is_unlocked()


def test_sensitive_values_are_not_logged(make_api, caplog: pytest.LogCaptureFixture) -> None:  # type: ignore[no-untyped-def]
    caplog.set_level(logging.DEBUG)
    fresh = make_api()
    fresh.setup()
    contact = fresh.create_contact(**rahul(), personal_notes=MARKER)
    fresh.post("/api/auth/lock")
    fresh.post("/api/auth/unlock", {"password": "falsches-passwort-xyz"}, expect=401)
    fresh.unlock()
    fresh.search(text="Rahul Steuerrecht")
    fresh.get(f"/api/contacts/{contact['id']}")
    text = caplog.text
    for secret in (
        PASSWORD,
        "falsches-passwort-xyz",
        MARKER,
        "Rahul",
        "Sharma",
        fresh.session or "",
        bridge_token(fresh.root),
    ):
        assert secret not in text


def test_api_docs_disabled_in_production(api: Api) -> None:
    assert api.client.get("/api/docs", headers=api.headers()).status_code == 404
    assert api.client.get("/api/openapi.json", headers=api.headers()).status_code == 404


def test_base_url_is_loopback() -> None:
    assert BASE_URL.startswith("http://127.0.0.1:")
