"""Programmatic Alembic integration.

Migrations run on an already-keyed SQLCipher connection, right after unlock.
The schema is never reset automatically; failures propagate to the caller.
"""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy.engine import Connection

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"


def _config(connection: Connection | None = None) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(MIGRATIONS_DIR))
    if connection is not None:
        cfg.attributes["connection"] = connection
    return cfg


def head_revision() -> str:
    head = ScriptDirectory.from_config(_config()).get_current_head()
    assert head is not None
    return head


def known_revisions() -> set[str]:
    return {rev.revision for rev in ScriptDirectory.from_config(_config()).walk_revisions()}


def current_revision(connection: Connection) -> str | None:
    return MigrationContext.configure(connection).get_current_revision()


def upgrade_to_head(connection: Connection) -> None:
    command.upgrade(_config(connection), "head")
