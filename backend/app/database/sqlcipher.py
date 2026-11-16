"""Low-level SQLCipher helpers.

The whole database file is encrypted by SQLCipher (AES-256 page encryption,
HMAC-SHA512 page authentication, PBKDF2-HMAC-SHA512 key derivation with
SQLCipher 4 defaults). We pass the master passphrase to ``PRAGMA key`` and let
SQLCipher derive the key; the per-database salt is stored in the first 16 bytes
of the file. There is intentionally **no** fallback to plain SQLite.
"""

from __future__ import annotations

import os
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from sqlcipher3 import dbapi2

PLAINTEXT_SQLITE_HEADER = b"SQLite format 3\x00"


class InvalidPassword(Exception):
    """Raised when a database cannot be opened with the given passphrase."""


class CorruptDatabase(Exception):
    """Raised when integrity checks fail."""


class EncryptionUnavailable(RuntimeError):
    """Raised if the SQLite driver is not SQLCipher (never fall back silently)."""


def normalize_password(password: str) -> str:
    """Unicode-normalize (NFC) so that visually identical input always yields the same key.

    The password is never truncated, trimmed or otherwise restricted.
    """
    return unicodedata.normalize("NFC", password)


def _key_literal(password: str) -> str:
    if "\x00" in password:
        # NUL cannot be represented in an SQL string literal. Practically never typed.
        raise ValueError("Das Passwort darf kein NUL-Zeichen enthalten.")
    return "'" + password.replace("'", "''") + "'"


def assert_sqlcipher_available() -> str:
    conn = dbapi2.connect(":memory:")
    try:
        row = conn.execute("PRAGMA cipher_version").fetchone()
    finally:
        conn.close()
    if not row or not row[0]:
        raise EncryptionUnavailable("SQLCipher ist nicht verfügbar – Start abgebrochen.")
    return str(row[0])


def configure_connection(conn: dbapi2.Connection) -> None:
    conn.execute("PRAGMA foreign_keys = ON")
    # DELETE journal mode: robust on Docker bind mounts (no shared-memory WAL index).
    # SQLCipher encrypts journal pages as well.
    conn.execute("PRAGMA journal_mode = DELETE")
    conn.execute("PRAGMA temp_store = MEMORY")
    conn.execute("PRAGMA secure_delete = ON")
    conn.execute("PRAGMA busy_timeout = 5000")


def open_encrypted(path: Path | str, password: str, *, create: bool = False) -> dbapi2.Connection:
    """Open (or create) an encrypted database. Raises InvalidPassword on a wrong key."""
    path = Path(path)
    if not create and not path.exists():
        raise FileNotFoundError(str(path))
    conn = dbapi2.connect(str(path), check_same_thread=False, isolation_level=None)
    try:
        conn.execute(f"PRAGMA key = {_key_literal(password)}")
        conn.execute("SELECT count(*) FROM sqlite_master").fetchone()
    except dbapi2.DatabaseError as exc:
        conn.close()
        raise InvalidPassword() from exc
    except Exception:
        conn.close()
        raise
    configure_connection(conn)
    return conn


def rekey(conn: dbapi2.Connection, new_password: str) -> None:
    conn.execute(f"PRAGMA rekey = {_key_literal(new_password)}")


def file_looks_encrypted(path: Path) -> bool:
    with open(path, "rb") as handle:
        header = handle.read(16)
    return len(header) == 16 and header != PLAINTEXT_SQLITE_HEADER


@dataclass(frozen=True)
class SnapshotInfo:
    contacts: int
    interactions: int
    reminders: int
    schema_revision: str | None
    size_bytes: int


def _count(conn: dbapi2.Connection, table: str) -> int:
    exists = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
    if not exists:
        return 0
    return int(conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0])  # noqa: S608 - fixed names


def inspect_database(path: Path, password: str) -> SnapshotInfo:
    """Open an encrypted database file and verify HMAC + structural integrity."""
    if not file_looks_encrypted(path):
        raise CorruptDatabase("Die Datei ist keine verschlüsselte Kontakte-Akte-Datenbank.")
    conn = open_encrypted(path, password)
    try:
        cipher_errors = conn.execute("PRAGMA cipher_integrity_check").fetchall()
        if cipher_errors:
            raise CorruptDatabase("Die Verschlüsselungs-Integritätsprüfung ist fehlgeschlagen.")
        result = conn.execute("PRAGMA integrity_check").fetchone()
        if not result or result[0] != "ok":
            raise CorruptDatabase("Die Datenbank-Integritätsprüfung ist fehlgeschlagen.")
        revision = None
        if conn.execute("SELECT 1 FROM sqlite_master WHERE name='alembic_version'").fetchone():
            row = conn.execute("SELECT version_num FROM alembic_version").fetchone()
            revision = row[0] if row else None
        return SnapshotInfo(
            contacts=_count(conn, "contacts"),
            interactions=_count(conn, "interactions"),
            reminders=_count(conn, "reminders"),
            schema_revision=revision,
            size_bytes=path.stat().st_size,
        )
    finally:
        conn.close()


def export_snapshot(source: dbapi2.Connection, dest: Path, dest_password: str) -> SnapshotInfo:
    """Write a consistent, encrypted copy of ``source`` to ``dest`` using sqlcipher_export.

    The copy is produced inside a single read transaction, verified, and only then
    atomically moved into place.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    partial = dest.with_name(dest.name + ".partial")
    if partial.exists():
        partial.unlink()
    source.execute("ATTACH DATABASE ? AS ka_export KEY ?", (str(partial), dest_password))
    try:
        source.execute("BEGIN")
        try:
            source.execute("SELECT sqlcipher_export('ka_export')").fetchall()
        finally:
            source.execute("COMMIT")
    finally:
        source.execute("DETACH DATABASE ka_export")
    try:
        info = inspect_database(partial, dest_password)
    except Exception:
        partial.unlink(missing_ok=True)
        raise
    os.replace(partial, dest)
    try:
        os.chmod(dest, 0o600)
    except OSError:
        pass
    return info
