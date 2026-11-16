"""Maintains the FTS5 search document per contact (inside the encrypted DB)."""

from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import or_, select, text
from sqlalchemy.orm import Session

from app.models import (
    Classification,
    ClassificationAlias,
    Contact,
    ContactClassification,
    ContactCountry,
    ContactLink,
    Country,
    Interaction,
    InteractionParticipant,
    InteractionTopic,
)
from app.services.text import search_document


def _contact_document(session: Session, contact: Contact) -> str:
    parts: list[str | None] = [
        contact.display_name,
        contact.first_name,
        contact.last_name,
        contact.city,
        contact.job_title,
        contact.personal_notes,
        contact.how_known,
        contact.first_met_place,
        contact.introduced_by_text,
        contact.relationship_notes,
    ]
    if contact.introduced_by is not None:
        parts.append(contact.introduced_by.display_name)
    if contact.relationship_category is not None:
        parts.append(contact.relationship_category.name)
    parts.extend(link.organization.name for link in contact.organization_links)
    parts.extend(channel.value for channel in contact.channels)

    classification_ids = [link.classification_id for link in contact.classification_links]
    parts.extend(link.classification.name for link in contact.classification_links)
    if classification_ids:
        parts.extend(
            session.scalars(
                select(ClassificationAlias.alias).where(ClassificationAlias.classification_id.in_(classification_ids))
            )
        )

    country_rows = session.execute(
        select(Country.name_de, Country.name_en)
        .join(ContactCountry, ContactCountry.country_code == Country.code)
        .where(ContactCountry.contact_id == contact.id)
        .distinct()
    )
    for name_de, name_en in country_rows:
        parts.extend([name_de, name_en])

    interaction_rows = session.execute(
        select(Interaction.id, Interaction.title, Interaction.description, Interaction.location)
        .join(InteractionParticipant, InteractionParticipant.interaction_id == Interaction.id)
        .where(InteractionParticipant.contact_id == contact.id)
    ).all()
    interaction_ids = [row.id for row in interaction_rows]
    for row in interaction_rows:
        parts.extend([row.title, row.description, row.location])
    if interaction_ids:
        parts.extend(
            session.scalars(
                select(Classification.name)
                .join(InteractionTopic, InteractionTopic.classification_id == Classification.id)
                .where(InteractionTopic.interaction_id.in_(interaction_ids))
                .distinct()
            )
        )

    link_rows = session.execute(
        select(ContactLink.relation_type, ContactLink.description).where(
            or_(ContactLink.source_contact_id == contact.id, ContactLink.target_contact_id == contact.id)
        )
    )
    for relation_type, description in link_rows:
        parts.extend([relation_type, description])

    return search_document(*parts)


def reindex_contacts(session: Session, contact_ids: Iterable[str]) -> None:
    ids = sorted(set(contact_ids))
    if not ids:
        return
    session.flush()
    for contact_id in ids:
        session.execute(text("DELETE FROM contact_search WHERE contact_id = :id"), {"id": contact_id})
        contact = session.get(Contact, contact_id)
        if contact is None:
            continue
        session.execute(
            text("INSERT INTO contact_search (contact_id, body) VALUES (:id, :body)"),
            {"id": contact_id, "body": _contact_document(session, contact)},
        )


def contacts_using_classifications(session: Session, classification_ids: Iterable[int]) -> set[str]:
    ids = list(classification_ids)
    if not ids:
        return set()
    direct = session.scalars(
        select(ContactClassification.contact_id).where(ContactClassification.classification_id.in_(ids))
    )
    via_interactions = session.scalars(
        select(InteractionParticipant.contact_id)
        .join(InteractionTopic, InteractionTopic.interaction_id == InteractionParticipant.interaction_id)
        .where(InteractionTopic.classification_id.in_(ids))
    )
    return set(direct) | set(via_interactions)


def reindex_all(session: Session) -> int:
    ids = list(session.scalars(select(Contact.id)))
    session.execute(text("DELETE FROM contact_search"))
    reindex_contacts(session, ids)
    return len(ids)
