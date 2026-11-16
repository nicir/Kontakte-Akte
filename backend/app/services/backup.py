"""Encrypted backups and safe restore.

Backups are complete SQLCipher databases produced with ``sqlcipher_export``
inside a read transaction (consistent snapshot), verified (HMAC + integrity
check) and then atomically renamed. Profile pictures live inside the database
and are therefore always part of a backup.
"""

from __future__ import annotations

import logging
import os
import re
import shutil
from datetime import UTC, datetime
from pathlib import Path

from app.database import migrate
from app.database.manager import DatabaseManager, timestamp_slug
from app.database.sqlcipher import (
    CorruptDatabase,
    InvalidPassword,
    inspect_database,
    normalize_password,
    open_encrypted,
    rekey,
)
from app.schemas.misc import BackupFile, BackupVerifyOut, RestoreOut
from app.services.errors import Invalid, NotFound

log = logging.getLogger("kontakte_akte.backup")

FILE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.kabackup$")
SUFFIX = ".kabackup"


def _directory(manager: DatabaseManager, location: str) -> Path:
    if location == "backups":
        return manager.config.backups_dir
    if location == "import":
        return manager.config.import_dir
    raise Invalid("Unbekannter Speicherort.")


def resolve(manager: DatabaseManager, location: str, file_name: str) -> Path:
    if not FILE_NAME.fullmatch(file_name):
        raise Invalid("Ungültiger Dateiname.")
    directory = _directory(manager, location).resolve()
    path = (directory / file_name).resolve()
    if path.parent != directory:
        raise Invalid("Ungültiger Dateiname.")
    if not path.is_file():
        raise NotFound("Sicherung nicht gefunden.")
    return path


def _kind(location: str, name: str) -> str:
    if location == "import":
        return "import"
    for prefix in ("pre-migration", "pre-restore"):
        if name.startswith(prefix):
            return prefix
    if name.startswith("kontakte-akte-"):
        return "manual"
    return "other"


def list_backups(manager: DatabaseManager) -> list[BackupFile]:
    items: list[BackupFile] = []
    for location in ("backups", "import"):
        directory = _directory(manager, location)
        if not directory.exists():
            continue
        for path in directory.iterdir():
            if path.is_file() and FILE_NAME.fullmatch(path.name):
                stat = path.stat()
                items.append(
                    BackupFile(
                        location=location,  # type: ignore[arg-type]
                        file_name=path.name,
                        kind=_kind(location, path.name),  # type: ignore[arg-type]
                        size_bytes=stat.st_size,
                        modified_at=datetime.fromtimestamp(stat.st_mtime, UTC),
                    )
                )
    items.sort(key=lambda b: b.modified_at, reverse=True)
    return items


def create_backup(manager: DatabaseManager) -> BackupFile:
    name = f"kontakte-akte-{timestamp_slug()}{SUFFIX}"
    path = manager.config.backups_dir / name
    manager.snapshot_to(path)
    log.info("Backup created")
    stat = path.stat()
    return BackupFile(
        location="backups",
        file_name=name,
        kind="manual",
        size_bytes=stat.st_size,
        modified_at=datetime.fromtimestamp(stat.st_mtime, UTC),
    )


def _inspect(path: Path, password: str) -> BackupVerifyOut:
    try:
        info = inspect_database(path, password)
    except InvalidPassword as exc:
        raise Invalid("Die Sicherung konnte mit diesem Passwort nicht geöffnet werden.") from exc
    except CorruptDatabase as exc:
        raise Invalid(str(exc)) from exc
    compatible = info.schema_revision is None or info.schema_revision in migrate.known_revisions()
    return BackupVerifyOut(
        ok=True,
        contacts=info.contacts,
        interactions=info.interactions,
        reminders=info.reminders,
        schema_revision=info.schema_revision,
        compatible=compatible,
        size_bytes=info.size_bytes,
    )


def verify_backup(manager: DatabaseManager, location: str, file_name: str, password: str | None) -> BackupVerifyOut:
    path = resolve(manager, location, file_name)
    key = normalize_password(password) if password else manager.current_key
    return _inspect(path, key)


def delete_backup(manager: DatabaseManager, location: str, file_name: str) -> None:
    resolve(manager, location, file_name).unlink()


def restore_backup(manager: DatabaseManager, location: str, file_name: str, password: str | None) -> RestoreOut:
    """Replace the active database with a verified backup.

    1. verify the backup (with its own password)
    2. create a verified safety backup of the current database
    3. stage a copy, re-key it to the current master password, verify again
    4. close all connections, atomically swap files, re-open (+ migrations)
    5. on any failure after the swap, put the safety backup back in place
    """
    source = resolve(manager, location, file_name)
    current_key = manager.current_key
    backup_key = normalize_password(password) if password else current_key
    verified = _inspect(source, backup_key)
    if not verified.compatible:
        raise Invalid("Diese Sicherung stammt von einer neueren Version von Kontakte-Akte.")

    safety_name = f"pre-restore-{timestamp_slug()}{SUFFIX}"
    safety_path = manager.config.backups_dir / safety_name
    manager.snapshot_to(safety_path)

    staging = manager.config.data_dir / "restore-staging.db"
    staging.unlink(missing_ok=True)
    try:
        shutil.copyfile(source, staging)
        if backup_key != current_key:
            conn = open_encrypted(staging, backup_key)
            try:
                rekey(conn, current_key)
            finally:
                conn.close()
        inspect_database(staging, current_key)
    except Exception:
        staging.unlink(missing_ok=True)
        raise

    manager.lock()
    os.replace(staging, manager.db_path)
    try:
        manager.unlock(current_key)
    except Exception as exc:
        log.error("Restore activation failed, rolling back: %s", type(exc).__name__)
        rollback = manager.config.data_dir / "rollback-staging.db"
        shutil.copyfile(safety_path, rollback)
        os.replace(rollback, manager.db_path)
        manager.unlock(current_key)
        raise Invalid("Die Wiederherstellung ist fehlgeschlagen. Der vorherige Stand wurde wiederhergestellt.") from exc
    log.info("Backup restored")
    return RestoreOut(ok=True, safety_backup=safety_name, contacts=verified.contacts)
