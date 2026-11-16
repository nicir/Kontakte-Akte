"""Lifecycle of the encrypted database: setup, unlock, lock, re-key, sessions.

While locked there is no engine and no key in memory, so no query can be
executed. While unlocked the passphrase is held in process memory because
SQLCipher needs it for every new pooled connection. On lock the engine is
disposed (closing all connections) and the reference is dropped. Python cannot
guarantee that the string is wiped from memory; we do not claim otherwise.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import QueuePool
from sqlcipher3 import dbapi2

from app.config import AppConfig
from app.database import migrate
from app.database.sqlcipher import (
    InvalidPassword,
    SnapshotInfo,
    export_snapshot,
    file_looks_encrypted,
    normalize_password,
    open_encrypted,
    rekey,
)

log = logging.getLogger("kontakte_akte.database")


class DatabaseLocked(Exception):
    pass


class AlreadyInitialized(Exception):
    pass


class NotInitialized(Exception):
    pass


class MigrationFailed(Exception):
    def __init__(self, backup_file: str | None) -> None:
        super().__init__("migration failed")
        self.backup_file = backup_file


@dataclass(frozen=True)
class UnlockResult:
    migrated: bool
    pre_migration_backup: str | None


def timestamp_slug() -> str:
    return datetime.now(UTC).strftime("%Y%m%d-%H%M%S")


class DatabaseManager:
    def __init__(self, config: AppConfig) -> None:
        self.config = config
        self._lock = threading.RLock()
        self._engine: Engine | None = None
        self._sessionmaker: sessionmaker[Session] | None = None
        self._key: str | None = None
        self._failed_attempts = 0

    # ------------------------------------------------------------------ state
    @property
    def db_path(self) -> Path:
        return self.config.db_path

    def is_initialized(self) -> bool:
        return self.db_path.exists() and self.db_path.stat().st_size > 0

    def is_unlocked(self) -> bool:
        return self._engine is not None

    # ------------------------------------------------------------- lifecycle
    def setup(self, password: str) -> None:
        password = normalize_password(password)
        with self._lock:
            if self.is_initialized():
                raise AlreadyInitialized()
            self.config.ensure_directories()
            conn = open_encrypted(self.db_path, password, create=True)
            conn.close()
            try:
                self.db_path.chmod(0o600)
            except OSError:
                pass
            self._activate(password)
            assert file_looks_encrypted(self.db_path), "database header is plaintext"
            log.info("Encrypted database initialised")

    def unlock(self, password: str) -> UnlockResult:
        password = normalize_password(password)
        with self._lock:
            if not self.is_initialized():
                raise NotInitialized()
            try:
                conn = open_encrypted(self.db_path, password)
            except InvalidPassword:
                self._failed_attempts += 1
                # Progressive delay against local brute force (on top of the KDF cost).
                time.sleep(min(0.25 * self._failed_attempts, 3.0))
                raise
            conn.close()
            self._failed_attempts = 0
            return self._activate(password)

    def lock(self) -> None:
        with self._lock:
            if self._engine is not None:
                self._engine.dispose()
            self._engine = None
            self._sessionmaker = None
            self._key = None

    def change_password(self, current: str, new: str) -> None:
        current = normalize_password(current)
        new = normalize_password(new)
        with self._lock:
            if not self.is_unlocked() or self._key is None:
                raise DatabaseLocked()
            if current != self._key:
                time.sleep(0.5)
                raise InvalidPassword()
            assert self._engine is not None
            self._engine.dispose()
            conn = open_encrypted(self.db_path, current)
            try:
                rekey(conn, new)
            finally:
                conn.close()
            # Verify the new key before switching over.
            open_encrypted(self.db_path, new).close()
            self._create_engine(new)
            log.info("Master password changed (database re-keyed)")

    # -------------------------------------------------------------- sessions
    @contextmanager
    def session(self) -> Iterator[Session]:
        factory = self._sessionmaker
        if factory is None:
            raise DatabaseLocked()
        session = factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    @contextmanager
    def raw_connection(self) -> Iterator[dbapi2.Connection]:
        """A dedicated keyed DB-API connection (used for snapshots)."""
        key = self._key
        if key is None:
            raise DatabaseLocked()
        conn = open_encrypted(self.db_path, key)
        try:
            yield conn
        finally:
            conn.close()

    def verify_password(self, password: str) -> bool:
        return self._key is not None and normalize_password(password) == self._key

    @property
    def current_key(self) -> str:
        if self._key is None:
            raise DatabaseLocked()
        return self._key

    def snapshot_to(self, dest: Path, password: str | None = None) -> SnapshotInfo:
        with self.raw_connection() as conn:
            return export_snapshot(conn, dest, normalize_password(password) if password else self.current_key)

    # ------------------------------------------------------------- internals
    def _create_engine(self, password: str) -> None:
        path = self.db_path

        def creator() -> dbapi2.Connection:
            return open_encrypted(path, password)

        engine = create_engine(
            "sqlite://",
            creator=creator,
            module=dbapi2,
            poolclass=QueuePool,
            pool_size=4,
            max_overflow=4,
        )

        # Let SQLAlchemy control transactions explicitly (pysqlite legacy mode is
        # disabled by isolation_level=None in open_encrypted).
        @event.listens_for(engine, "begin")
        def _do_begin(conn) -> None:  # type: ignore[no-untyped-def]
            conn.exec_driver_sql("BEGIN")

        self._engine = engine
        self._sessionmaker = sessionmaker(bind=engine, expire_on_commit=False)
        self._key = password

    def _activate(self, password: str) -> UnlockResult:
        self._create_engine(password)
        assert self._engine is not None
        backup_file: str | None = None
        migrated = False
        try:
            with self._engine.connect() as connection:
                current = migrate.current_revision(connection)
            head = migrate.head_revision()
            if current != head:
                if current is not None:
                    # Existing data + pending migration → verified backup first.
                    name = f"pre-migration-{current}-{timestamp_slug()}.kabackup"
                    self.snapshot_to(self.config.backups_dir / name)
                    backup_file = name
                    log.info("Created pre-migration backup %s", name)
                with self._engine.begin() as connection:
                    migrate.upgrade_to_head(connection)
                migrated = True
        except Exception as exc:
            log.error("Database migration failed: %s", type(exc).__name__)
            self.lock()
            raise MigrationFailed(backup_file) from exc
        return UnlockResult(migrated=migrated, pre_migration_backup=backup_file)
