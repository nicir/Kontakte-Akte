"""Alembic environment.

At runtime the application passes an already-keyed SQLCipher connection via
``config.attributes["connection"]``. The URL branch exists only for developers
running ``alembic revision --autogenerate`` against a throwaway database.
"""

from __future__ import annotations

from alembic import context
from sqlalchemy import create_engine

from app.models import Base

target_metadata = Base.metadata

# Objects managed outside the ORM metadata (FTS5 virtual table + shadow tables).
EXCLUDED_TABLE_PREFIXES = ("contact_search",)


def include_object(obj, name, type_, reflected, compare_to):  # type: ignore[no-untyped-def]
    if type_ == "table" and name and name.startswith(EXCLUDED_TABLE_PREFIXES):
        return False
    return True


def run() -> None:
    connection = context.config.attributes.get("connection")
    if connection is not None:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()
        return

    url = context.config.get_main_option("sqlalchemy.url")
    engine = create_engine(url)
    with engine.connect() as conn:
        context.configure(
            connection=conn,
            target_metadata=target_metadata,
            render_as_batch=True,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


run()
