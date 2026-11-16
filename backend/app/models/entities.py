"""SQLAlchemy ORM models.

Design notes
------------
* Countries are a reference table keyed by ISO 3166-1 alpha-2 codes. All five
  geographic dimensions of a contact live in ``contact_countries`` with an
  explicit ``kind`` column, so the world map and filters share one query shape.
* All reusable free-text classifications (professions, specializations,
  industries, tags, topics …) live in one ``classifications`` table with a
  ``kind`` column and a unique ``(kind, normalized_name)`` index. This keeps
  autocomplete, de-duplication, aliases and merging in one code path.
* Deleting a contact only cascades to rows owned by that contact (join rows,
  channels, photo, links, reminders). Shared entities (organizations,
  classifications, countries, other contacts) are never deleted implicitly.
"""

from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.types import UTCDateTime, utcnow
from app.models.base import (
    CHANNEL_KINDS,
    CLASSIFICATION_KINDS,
    COUNTRY_KINDS,
    INTERACTION_KINDS,
    REMINDER_STATUSES,
    Base,
    new_uuid,
    sql_in_list,
)


class Country(Base):
    __tablename__ = "countries"

    code: Mapped[str] = mapped_column(String(2), primary_key=True)
    numeric: Mapped[str | None] = mapped_column(String(3))
    name_de: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str] = mapped_column(String(120))


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    normalized_name: Mapped[str] = mapped_column(String(200), unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class RelationshipCategory(Base):
    __tablename__ = "relationship_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    normalized_name: Mapped[str] = mapped_column(String(100), unique=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Classification(Base):
    __tablename__ = "classifications"
    __table_args__ = (
        UniqueConstraint("kind", "normalized_name"),
        CheckConstraint(f"kind IN ({sql_in_list(CLASSIFICATION_KINDS)})", name="kind"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(200))
    normalized_name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    aliases: Mapped[list[ClassificationAlias]] = relationship(
        back_populates="classification", cascade="all, delete-orphan", order_by="ClassificationAlias.alias"
    )


class ClassificationAlias(Base):
    __tablename__ = "classification_aliases"
    __table_args__ = (UniqueConstraint("classification_id", "normalized_alias"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    classification_id: Mapped[int] = mapped_column(ForeignKey("classifications.id", ondelete="CASCADE"), index=True)
    alias: Mapped[str] = mapped_column(String(200))
    normalized_alias: Mapped[str] = mapped_column(String(200), index=True)

    classification: Mapped[Classification] = relationship(back_populates="aliases")


class Contact(Base):
    __tablename__ = "contacts"
    __table_args__ = (
        CheckConstraint(
            "relationship_strength IS NULL OR relationship_strength BETWEEN 1 AND 5",
            name="strength_range",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    first_name: Mapped[str] = mapped_column(String(200), default="")
    last_name: Mapped[str] = mapped_column(String(200), default="")
    display_name: Mapped[str] = mapped_column(String(300))
    sort_name: Mapped[str] = mapped_column(String(400), index=True)
    city: Mapped[str | None] = mapped_column(String(200))
    job_title: Mapped[str | None] = mapped_column(String(200))
    personal_notes: Mapped[str | None] = mapped_column(Text)

    how_known: Mapped[str | None] = mapped_column(Text)
    first_met_place: Mapped[str | None] = mapped_column(String(300))
    first_met_date: Mapped[date | None] = mapped_column(Date, index=True)
    introduced_by_id: Mapped[str | None] = mapped_column(ForeignKey("contacts.id", ondelete="SET NULL"), index=True)
    introduced_by_text: Mapped[str | None] = mapped_column(String(300))
    relationship_category_id: Mapped[int | None] = mapped_column(
        ForeignKey("relationship_categories.id", ondelete="SET NULL"), index=True
    )
    relationship_strength: Mapped[int | None] = mapped_column(Integer)
    relationship_notes: Mapped[str | None] = mapped_column(Text)
    next_planned_interaction: Mapped[date | None] = mapped_column(Date)

    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow, index=True)

    channels: Mapped[list[ContactChannel]] = relationship(
        cascade="all, delete-orphan", order_by="ContactChannel.position", passive_deletes=True
    )
    countries: Mapped[list[ContactCountry]] = relationship(cascade="all, delete-orphan", passive_deletes=True)
    classification_links: Mapped[list[ContactClassification]] = relationship(
        cascade="all, delete-orphan", order_by="ContactClassification.position", passive_deletes=True
    )
    organization_links: Mapped[list[ContactOrganization]] = relationship(
        cascade="all, delete-orphan", order_by="ContactOrganization.position", passive_deletes=True
    )
    relationship_category: Mapped[RelationshipCategory | None] = relationship()
    introduced_by: Mapped[Contact | None] = relationship(remote_side="Contact.id")


class ContactCountry(Base):
    __tablename__ = "contact_countries"
    __table_args__ = (
        CheckConstraint(f"kind IN ({sql_in_list(COUNTRY_KINDS)})", name="kind"),
        Index("ix_contact_countries_kind_country", "kind", "country_code"),
    )

    contact_id: Mapped[str] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), primary_key=True)
    country_code: Mapped[str] = mapped_column(ForeignKey("countries.code"), primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), primary_key=True)


class ContactClassification(Base):
    __tablename__ = "contact_classifications"

    contact_id: Mapped[str] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), primary_key=True)
    classification_id: Mapped[int] = mapped_column(
        ForeignKey("classifications.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)

    classification: Mapped[Classification] = relationship(lazy="joined")


class ContactOrganization(Base):
    __tablename__ = "contact_organizations"
    __table_args__ = (CheckConstraint("role IN ('current', 'previous')", name="role"),)

    contact_id: Mapped[str] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    role: Mapped[str] = mapped_column(String(10), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, default=0)

    organization: Mapped[Organization] = relationship(lazy="joined")


class ContactChannel(Base):
    __tablename__ = "contact_channels"
    __table_args__ = (CheckConstraint(f"kind IN ({sql_in_list(CHANNEL_KINDS)})", name="kind"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contact_id: Mapped[str] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    label: Mapped[str | None] = mapped_column(String(60))
    value: Mapped[str] = mapped_column(String(500))
    position: Mapped[int] = mapped_column(Integer, default=0)


class ContactPhoto(Base):
    """Profile pictures are stored inside the encrypted database (no plaintext files)."""

    __tablename__ = "contact_photos"

    contact_id: Mapped[str] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), primary_key=True)
    mime_type: Mapped[str] = mapped_column(String(40))
    image: Mapped[bytes] = mapped_column(LargeBinary)
    thumbnail: Mapped[bytes] = mapped_column(LargeBinary)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)


class ContactLink(Base):
    __tablename__ = "contact_links"
    __table_args__ = (CheckConstraint("source_contact_id <> target_contact_id", name="no_self_link"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    source_contact_id: Mapped[str] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), index=True)
    target_contact_id: Mapped[str] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), index=True)
    relation_type: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Interaction(Base):
    __tablename__ = "interactions"
    __table_args__ = (CheckConstraint(f"kind IN ({sql_in_list(INTERACTION_KINDS)})", name="kind"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    occurred_on: Mapped[date] = mapped_column(Date, index=True)
    occurred_time: Mapped[time | None] = mapped_column(Time)
    kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    participants: Mapped[list[InteractionParticipant]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True
    )
    topics: Mapped[list[InteractionTopic]] = relationship(cascade="all, delete-orphan", passive_deletes=True)


class InteractionParticipant(Base):
    __tablename__ = "interaction_participants"

    interaction_id: Mapped[str] = mapped_column(ForeignKey("interactions.id", ondelete="CASCADE"), primary_key=True)
    contact_id: Mapped[str] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), primary_key=True, index=True)


class InteractionTopic(Base):
    __tablename__ = "interaction_topics"

    interaction_id: Mapped[str] = mapped_column(ForeignKey("interactions.id", ondelete="CASCADE"), primary_key=True)
    classification_id: Mapped[int] = mapped_column(
        ForeignKey("classifications.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)

    classification: Mapped[Classification] = relationship(lazy="joined")


class Reminder(Base):
    __tablename__ = "reminders"
    __table_args__ = (
        CheckConstraint(f"status IN ({sql_in_list(REMINDER_STATUSES)})", name="status"),
        Index("ix_reminders_status_due", "status", "due_date"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    contact_id: Mapped[str | None] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), index=True)
    interaction_id: Mapped[str | None] = mapped_column(ForeignKey("interactions.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text)
    due_date: Mapped[date] = mapped_column(Date)
    # Wall-clock time in ``timezone``. Stored as local time + IANA zone so that
    # daylight-saving transitions never shift the intended time.
    due_time: Mapped[time | None] = mapped_column(Time)
    timezone: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(10), default="open")
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
