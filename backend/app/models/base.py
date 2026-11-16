from __future__ import annotations

import uuid

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def new_uuid() -> str:
    return str(uuid.uuid4())


# Domain enumerations (stored as strings, guarded by CHECK constraints).
COUNTRY_KINDS = ("nationality", "residence", "activity", "expertise", "interest")

CLASSIFICATION_KINDS = (
    "profession",
    "specialization",
    "industry",
    "expertise",
    "responsibility",
    "topic",
    "interest",
    "shared_interest",
    "collaboration",
    "project",
    "tag",
    "language",
)

CHANNEL_KINDS = ("email", "phone", "whatsapp", "linkedin", "website", "other")

INTERACTION_KINDS = (
    "meeting",
    "phone",
    "email",
    "video",
    "conference",
    "conversation",
    "introduction",
    "message",
    "other",
)

REMINDER_STATUSES = ("open", "done")


def sql_in_list(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{value}'" for value in values)
