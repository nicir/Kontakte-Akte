from __future__ import annotations

import shutil
import sqlite3
from pathlib import Path

import pytest
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext

from app.database.sqlcipher import PLAINTEXT_SQLITE_HEADER, InvalidPassword, open_encrypted
from app.models import Base
from tests.conftest import PASSWORD, Api, rahul


def test_backup_create_verify_and_encryption(api: Api) -> None:
    api.create_contact(**rahul())
    backup = api.post("/api/backups", expect=201)
    assert backup["kind"] == "manual" and backup["file_name"].endswith(".kabackup")
    path = api.root / "backups" / backup["file_name"]
    raw = path.read_bytes()
    assert raw[:16] != PLAINTEXT_SQLITE_HEADER and b"Rahul" not in raw
    with pytest.raises(sqlite3.DatabaseError):
        sqlite3.connect(path).execute("SELECT * FROM contacts").fetchall()
    with pytest.raises(InvalidPassword):
        open_encrypted(path, "falsch")
    verified = api.post("/api/backups/verify", {"location": "backups", "file_name": backup["file_name"]})
    assert verified["ok"] and verified["contacts"] == 1 and verified["compatible"]
    listed = api.get("/api/backups")
    assert [b["file_name"] for b in listed] == [backup["file_name"]]
    assert not list((api.root / "backups").glob("*.partial"))


def test_restore_replaces_data_and_keeps_safety_copy(api: Api) -> None:
    contact = api.create_contact(**rahul())
    api.post(
        "/api/interactions",
        {"occurred_on": "2026-03-15", "kind": "phone", "title": "Telefonat", "participant_ids": [contact["id"]]},
        expect=201,
    )
    backup = api.post("/api/backups", expect=201)
    api.delete(f"/api/contacts/{contact['id']}")
    api.create_contact(first_name="Nach der Sicherung")
    assert api.search()["total"] == 1

    result = api.post("/api/backups/restore", {"location": "backups", "file_name": backup["file_name"]})
    assert result["ok"] and result["contacts"] == 1
    assert [i["display_name"] for i in api.search()["items"]] == ["Rahul Sharma"]  # session still valid
    assert api.get("/api/interactions", contact_id=contact["id"])[0]["title"] == "Telefonat"
    assert api.search(text="Steuerrecht")["total"] == 1  # FTS index restored as well

    safety = result["safety_backup"]
    assert safety.startswith("pre-restore-")
    verified = api.post("/api/backups/verify", {"location": "backups", "file_name": safety})
    assert verified["contacts"] == 1  # "Nach der Sicherung"
    db = api.root / "data" / "kontakte-akte.db"
    assert db.read_bytes()[:16] != PLAINTEXT_SQLITE_HEADER


def test_restore_backup_with_other_password_is_rekeyed(api: Api, make_api, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    # Create a backup under an old password, then change the password.
    api.create_contact(first_name="Alt")
    backup = api.post("/api/backups", expect=201)
    api.post(
        "/api/auth/change-password",
        {"current_password": PASSWORD, "new_password": "neu 123", "new_password_confirm": "neu 123"},
    )
    api.post("/api/backups/verify", {"location": "backups", "file_name": backup["file_name"]}, expect=422)
    api.post("/api/backups/verify", {"location": "backups", "file_name": backup["file_name"], "password": PASSWORD})
    # Simulate import via the desktop bridge (file copied into backups/import).
    shutil.copy(api.root / "backups" / backup["file_name"], api.root / "backups" / "import" / "import-1.kabackup")
    api.post("/api/backups/restore", {"location": "import", "file_name": "import-1.kabackup", "password": PASSWORD})
    assert [i["display_name"] for i in api.search()["items"]] == ["Alt"]
    api.post("/api/auth/lock")
    fresh = make_api()
    fresh.post("/api/auth/unlock", {"password": PASSWORD}, expect=401)
    fresh.unlock("neu 123")  # active password stays the current one
    assert fresh.search()["total"] == 1


def test_restore_rejects_wrong_password_and_corrupt_files(api: Api) -> None:
    api.create_contact(first_name="Bleibt")
    backup = api.post("/api/backups", expect=201)
    r = api.post(
        "/api/backups/restore",
        {"location": "backups", "file_name": backup["file_name"], "password": "falsch"},
        expect=422,
    )
    assert "Passwort" in r["detail"]["message"]
    corrupt = api.root / "backups" / "import" / "kaputt.kabackup"
    corrupt.write_bytes(b"SQLite format 3\x00" + b"\x00" * 4000)
    api.post("/api/backups/restore", {"location": "import", "file_name": "kaputt.kabackup"}, expect=422)
    tampered = api.root / "backups" / "import" / "manipuliert.kabackup"
    data = bytearray((api.root / "backups" / backup["file_name"]).read_bytes())
    data[5000] ^= 0xFF
    tampered.write_bytes(bytes(data))
    api.post("/api/backups/verify", {"location": "import", "file_name": "manipuliert.kabackup"}, expect=422)
    assert [i["display_name"] for i in api.search()["items"]] == ["Bleibt"]


def test_backup_paths_cannot_escape(api: Api) -> None:
    for name in ("../data/kontakte-akte.db", "..%2Fx.kabackup", "/etc/passwd", "a/b.kabackup", "x.db"):
        api.post("/api/backups/verify", {"location": "backups", "file_name": name}, expect=422)
    api.post("/api/backups/verify", {"location": "elsewhere", "file_name": "a.kabackup"}, expect=422)
    api.post("/api/backups/verify", {"location": "backups", "file_name": "fehlt.kabackup"}, expect=404)


def test_delete_backup(api: Api) -> None:
    backup = api.post("/api/backups", expect=201)
    api.delete(f"/api/backups/backups/{backup['file_name']}")
    assert api.get("/api/backups") == []


def test_schema_matches_models(api: Api) -> None:
    manager = api.client.app.state.ka.manager  # type: ignore[attr-defined]
    with manager._engine.connect() as conn:  # noqa: SLF001
        context = MigrationContext.configure(
            conn, opts={"include_object": lambda o, n, t, r, c: not (t == "table" and n.startswith("contact_search"))}
        )
        diff = compare_metadata(context, Base.metadata)
    assert diff == []


def test_unlock_on_existing_database_runs_no_destructive_migration(api: Api, make_api) -> None:  # type: ignore[no-untyped-def]
    api.create_contact(**rahul())
    api.post("/api/auth/lock")
    fresh = make_api()
    result = fresh.post("/api/auth/unlock", {"password": PASSWORD})
    assert result["migrated"] is False and result["pre_migration_backup"] is None
    fresh.session = result["session_token"]
    assert fresh.search()["total"] == 1


def test_pending_migration_creates_verified_backup_first(api: Api, make_api) -> None:  # type: ignore[no-untyped-def]
    """Simulate an app update: the DB is at an older revision → backup before upgrading."""
    api.create_contact(**rahul())
    manager = api.client.app.state.ka.manager  # type: ignore[attr-defined]
    with manager.raw_connection() as conn:
        # Pretend the schema is one revision behind by temporarily registering a fake head.
        conn.execute("UPDATE alembic_version SET version_num = '0000_old'")
    api.post("/api/auth/lock")

    import app.database.migrate as migrate

    original_upgrade = migrate.upgrade_to_head
    calls: list[str] = []

    def fake_upgrade(connection) -> None:  # type: ignore[no-untyped-def]
        calls.append("upgrade")
        connection.exec_driver_sql("UPDATE alembic_version SET version_num = '0001'")

    migrate.upgrade_to_head = fake_upgrade
    try:
        fresh = make_api()
        result = fresh.post("/api/auth/unlock", {"password": PASSWORD})
    finally:
        migrate.upgrade_to_head = original_upgrade
    assert calls == ["upgrade"] and result["migrated"] is True
    backup_name = result["pre_migration_backup"]
    assert backup_name.startswith("pre-migration-0000_old-")
    fresh.session = result["session_token"]
    verified = fresh.post("/api/backups/verify", {"location": "backups", "file_name": backup_name})
    assert verified["contacts"] == 1
    assert fresh.search()["total"] == 1


def test_failed_migration_does_not_reset_data(api: Api, make_api) -> None:  # type: ignore[no-untyped-def]
    api.create_contact(**rahul())
    manager = api.client.app.state.ka.manager  # type: ignore[attr-defined]
    with manager.raw_connection() as conn:
        conn.execute("UPDATE alembic_version SET version_num = '0000_old'")
    api.post("/api/auth/lock")

    import app.database.migrate as migrate

    original_upgrade = migrate.upgrade_to_head

    def broken_upgrade(connection) -> None:  # type: ignore[no-untyped-def]
        raise RuntimeError("boom")

    migrate.upgrade_to_head = broken_upgrade
    try:
        fresh = make_api()
        r = fresh.post("/api/auth/unlock", {"password": PASSWORD}, expect=500)
    finally:
        migrate.upgrade_to_head = original_upgrade
    assert r["detail"]["code"] == "migration_failed"
    conn = open_encrypted(api.root / "data" / "kontakte-akte.db", PASSWORD)
    assert conn.execute("SELECT count(*) FROM contacts").fetchone()[0] == 1
    conn.close()
