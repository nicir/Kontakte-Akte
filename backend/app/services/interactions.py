"""Manually documented interactions (meetings, calls, …) with multiple participants."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Contact, Interaction, InteractionParticipant, InteractionTopic, Reminder
from app.schemas.activity import InteractionInput, InteractionOut, ReminderBrief, ReminderInput
from app.services.classifications import resolve_classification
from app.services.contacts import contact_refs
from app.services.errors import Invalid, NotFound
from app.services.reminders import create_reminder
from app.services.search_index import reindex_contacts
from app.services.text import clean, clean_multiline, clean_optional, fold


def _get(session: Session, interaction_id: str) -> Interaction:
    interaction = session.get(Interaction, interaction_id)
    if interaction is None:
        raise NotFound("Interaktion nicht gefunden.")
    return interaction


def _participant_ids(interaction: Interaction) -> set[str]:
    return {p.contact_id for p in interaction.participants}


def _apply(session: Session, interaction: Interaction, data: InteractionInput) -> None:
    participant_ids = list(dict.fromkeys(data.participant_ids))
    found = set(session.scalars(select(Contact.id).where(Contact.id.in_(participant_ids))))
    if missing := [pid for pid in participant_ids if pid not in found]:
        raise Invalid(f"Unbekannte Kontakte: {len(missing)}")
    title = clean(data.title)
    if not title:
        raise Invalid("Bitte gib einen Titel ein.")
    interaction.occurred_on = data.occurred_on
    interaction.occurred_time = data.occurred_time
    interaction.kind = data.kind
    interaction.title = title
    interaction.description = clean_multiline(data.description)
    interaction.location = clean_optional(data.location)

    interaction.participants.clear()
    interaction.topics.clear()
    session.flush()
    for pid in participant_ids:
        interaction.participants.append(InteractionParticipant(contact_id=pid))
    seen: set[int] = set()
    for position, name in enumerate(data.topics):
        if not fold(name):
            continue
        topic = resolve_classification(session, "topic", name)
        if topic.id in seen:
            continue
        seen.add(topic.id)
        interaction.topics.append(InteractionTopic(classification_id=topic.id, position=position))


def create_interaction(session: Session, data: InteractionInput) -> Interaction:
    interaction = Interaction(occurred_on=data.occurred_on, kind=data.kind, title=data.title)
    session.add(interaction)
    _apply(session, interaction, data)
    session.flush()
    if data.follow_up is not None:
        contact_id = data.follow_up.contact_id or data.participant_ids[0]
        if contact_id not in data.participant_ids:
            raise Invalid("Die Erinnerung muss einem Teilnehmer zugeordnet sein.")
        create_reminder(
            session,
            ReminderInput(
                contact_id=contact_id,
                interaction_id=interaction.id,
                title=data.follow_up.title,
                description=data.follow_up.description,
                due_date=data.follow_up.due_date,
                due_time=data.follow_up.due_time,
                timezone=data.follow_up.timezone,
            ),
        )
    reindex_contacts(session, _participant_ids(interaction))
    return interaction


def update_interaction(session: Session, interaction_id: str, data: InteractionInput) -> Interaction:
    interaction = _get(session, interaction_id)
    before = _participant_ids(interaction)
    _apply(session, interaction, data)
    session.flush()
    if data.follow_up is not None:
        contact_id = data.follow_up.contact_id or data.participant_ids[0]
        create_reminder(
            session,
            ReminderInput(
                contact_id=contact_id,
                interaction_id=interaction.id,
                title=data.follow_up.title,
                description=data.follow_up.description,
                due_date=data.follow_up.due_date,
                due_time=data.follow_up.due_time,
                timezone=data.follow_up.timezone,
            ),
        )
    reindex_contacts(session, before | _participant_ids(interaction))
    return interaction


def delete_interaction(session: Session, interaction_id: str) -> None:
    interaction = _get(session, interaction_id)
    participants = _participant_ids(interaction)
    session.delete(interaction)
    session.flush()
    reindex_contacts(session, participants)


def to_out(session: Session, interactions: list[Interaction]) -> list[InteractionOut]:
    ids = [i.id for i in interactions]
    all_participants = {p.contact_id for i in interactions for p in i.participants}
    refs = contact_refs(session, list(all_participants))
    reminders: dict[str, list[ReminderBrief]] = defaultdict(list)
    if ids:
        for r in session.scalars(select(Reminder).where(Reminder.interaction_id.in_(ids)).order_by(Reminder.due_date)):
            reminders[r.interaction_id or ""].append(
                ReminderBrief(id=r.id, title=r.title, due_date=r.due_date, status=r.status)
            )
    result = []
    for i in interactions:
        participants = sorted(
            (refs[p.contact_id] for p in i.participants if p.contact_id in refs),
            key=lambda r: r.display_name.casefold(),
        )
        topics = [t.classification.name for t in sorted(i.topics, key=lambda t: t.position)]
        result.append(
            InteractionOut(
                id=i.id,
                occurred_on=i.occurred_on,
                occurred_time=i.occurred_time,
                kind=i.kind,
                title=i.title,
                description=i.description,
                location=i.location,
                participants=participants,
                topics=topics,
                reminders=reminders.get(i.id, []),
                created_at=i.created_at,
                updated_at=i.updated_at,
            )
        )
    return result


def list_interactions(session: Session, contact_id: str | None = None, limit: int = 500) -> list[InteractionOut]:
    stmt = select(Interaction)
    if contact_id:
        stmt = stmt.join(InteractionParticipant, InteractionParticipant.interaction_id == Interaction.id).where(
            InteractionParticipant.contact_id == contact_id
        )
    stmt = stmt.order_by(
        Interaction.occurred_on.desc(), Interaction.occurred_time.desc().nulls_last(), Interaction.created_at.desc()
    ).limit(limit)
    return to_out(session, list(session.scalars(stmt).unique()))


def get_out(session: Session, interaction_id: str) -> InteractionOut:
    return to_out(session, [_get(session, interaction_id)])[0]
