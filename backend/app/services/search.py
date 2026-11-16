"""Deterministic local contact search: FTS5 full text + structured AND/OR filters.

Semantics (shown in the UI as well):
* Free text: every word must occur somewhere in the contact's dossier
  (substring match, case- and diacritic-insensitive).
* Filters on different fields are combined with AND.
* Several values within one field are combined with OR ("eines davon"),
  or with AND if the user switches that field to "alle".
* Classification filters match by substring on the normalised name or on an
  alias, e.g. "Steuerrecht" also finds "Indisches Steuerrecht".
"""

from __future__ import annotations

from sqlalchemy import ColumnElement, Select, and_, column, func, or_, select, table, text, union
from sqlalchemy.orm import Session

from app.models import (
    Classification,
    ClassificationAlias,
    Contact,
    ContactClassification,
    ContactCountry,
    ContactOrganization,
    Country,
    Interaction,
    InteractionParticipant,
    InteractionTopic,
    Organization,
    Reminder,
)
from app.schemas.common import CountryRef
from app.schemas.contacts import ContactQuery, ContactSearchResult, ContactSummary, FilterCondition
from app.services.contacts import group_classifications, thumbnails
from app.services.text import escape_like, fold, initials, search_terms

CLASSIFICATION_FIELDS = {
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
}
COUNTRY_FIELDS = {
    "nationality": "nationality",
    "residence": "residence",
    "activity": "activity",
    "expertise_country": "expertise",
    "interest_country": "interest",
}

contact_search = table("contact_search", column("contact_id"), column("body"))


def _like(value: str) -> str:
    return f"%{escape_like(fold(value))}%"


def matching_classification_ids(kind: str, value: str) -> Select[tuple[int]]:
    pattern = _like(value)
    alias_ids = select(ClassificationAlias.classification_id).where(
        ClassificationAlias.normalized_alias.like(pattern, escape="\\")
    )
    return select(Classification.id).where(
        Classification.kind == kind,
        or_(Classification.normalized_name.like(pattern, escape="\\"), Classification.id.in_(alias_ids)),
    )


def _value_subquery(field: str, value: str) -> Select[tuple[str]]:
    if field in COUNTRY_FIELDS:
        return select(ContactCountry.contact_id).where(
            ContactCountry.kind == COUNTRY_FIELDS[field], ContactCountry.country_code == value.upper()
        )
    if field in CLASSIFICATION_FIELDS:
        ids = matching_classification_ids(field, value)
        direct = select(ContactClassification.contact_id).where(ContactClassification.classification_id.in_(ids))
        if field == "topic":
            via_interactions = (
                select(InteractionParticipant.contact_id)
                .join(InteractionTopic, InteractionTopic.interaction_id == InteractionParticipant.interaction_id)
                .where(InteractionTopic.classification_id.in_(ids))
            )
            return select(union(direct, via_interactions).subquery().c[0])
        return direct
    if field == "organization":
        return (
            select(ContactOrganization.contact_id)
            .join(Organization, Organization.id == ContactOrganization.organization_id)
            .where(Organization.normalized_name.like(_like(value), escape="\\"))
        )
    if field == "relationship_category":
        try:
            category_id = int(value)
        except ValueError:
            return select(Contact.id).where(text("0"))
        return select(Contact.id).where(Contact.relationship_category_id == category_id)
    raise ValueError(f"unknown filter field {field}")


def _condition(condition: FilterCondition) -> ColumnElement[bool]:
    parts = [Contact.id.in_(_value_subquery(condition.field, value)) for value in condition.values]
    return and_(*parts) if condition.match == "all" else or_(*parts)


def _fts_quote(term: str) -> str:
    return '"' + term.replace('"', '""') + '"'


def _text_condition(query_text: str) -> ColumnElement[bool] | None:
    terms = search_terms(query_text)
    if not terms:
        return None
    long_terms = [t for t in terms if len(t) >= 3]
    short_terms = [t for t in terms if len(t) < 3]
    stmt = select(contact_search.c.contact_id)
    if long_terms:
        stmt = stmt.where(
            text("contact_search MATCH :fts_query").bindparams(
                fts_query=" AND ".join(_fts_quote(t) for t in long_terms)
            )
        )
    for term in short_terms:
        stmt = stmt.where(contact_search.c.body.like(f"%{escape_like(term)}%", escape="\\"))
    return Contact.id.in_(stmt)


def last_interaction_subquery():  # type: ignore[no-untyped-def]
    return (
        select(
            InteractionParticipant.contact_id.label("contact_id"),
            func.max(Interaction.occurred_on).label("last_date"),
        )
        .join(Interaction, Interaction.id == InteractionParticipant.interaction_id)
        .group_by(InteractionParticipant.contact_id)
        .subquery()
    )


def search_contacts(session: Session, query: ContactQuery) -> ContactSearchResult:
    last = last_interaction_subquery()
    conditions: list[ColumnElement[bool]] = []

    text_condition = _text_condition(query.text)
    if text_condition is not None:
        conditions.append(text_condition)
    conditions.extend(_condition(c) for c in query.filters)

    if query.first_met_from:
        conditions.append(Contact.first_met_date >= query.first_met_from)
    if query.first_met_to:
        conditions.append(Contact.first_met_date <= query.first_met_to)
    if query.last_interaction_from:
        conditions.append(last.c.last_date >= query.last_interaction_from)
    if query.last_interaction_to:
        conditions.append(last.c.last_date <= query.last_interaction_to)
    if query.has_open_reminder is not None:
        open_reminders = select(Reminder.contact_id).where(Reminder.status == "open", Reminder.contact_id.is_not(None))
        conditions.append(
            Contact.id.in_(open_reminders) if query.has_open_reminder else Contact.id.not_in(open_reminders)
        )

    base = select(Contact, last.c.last_date).outerjoin(last, last.c.contact_id == Contact.id).where(*conditions)

    total = session.scalar(select(func.count()).select_from(base.with_only_columns(Contact.id).subquery())) or 0

    order = {
        "name": [Contact.sort_name.asc()],
        "created": [Contact.created_at.desc()],
        "updated": [Contact.updated_at.desc()],
        "last_interaction": [last.c.last_date.desc().nulls_last()],
    }[query.sort]
    rows = session.execute(
        base.order_by(*order, Contact.sort_name, Contact.id).limit(query.limit).offset(query.offset)
    ).all()
    items = build_summaries(session, [(contact, last_date) for contact, last_date in rows])
    return ContactSearchResult(total=int(total), items=items)


def build_summaries(session: Session, rows: list[tuple[Contact, object]]) -> list[ContactSummary]:
    ids = [contact.id for contact, _ in rows]
    if not ids:
        return []
    classes = group_classifications(session, ids)
    thumbs = thumbnails(session, ids)
    residences: dict[str, CountryRef] = {}
    for cid, code, name in session.execute(
        select(ContactCountry.contact_id, Country.code, Country.name_de)
        .join(Country, Country.code == ContactCountry.country_code)
        .where(ContactCountry.contact_id.in_(ids), ContactCountry.kind == "residence")
    ):
        residences.setdefault(cid, CountryRef(code=code, name=name))
    companies: dict[str, str] = {
        cid: name
        for cid, name in session.execute(
            select(ContactOrganization.contact_id, Organization.name)
            .join(Organization, Organization.id == ContactOrganization.organization_id)
            .where(ContactOrganization.contact_id.in_(ids), ContactOrganization.role == "current")
        )
    }
    summaries = []
    for contact, last_date in rows:
        c = classes.get(contact.id, {})
        tags = [*c.get("specialization", []), *c.get("expertise", [])][:5]
        summaries.append(
            ContactSummary(
                id=contact.id,
                display_name=contact.display_name,
                initials=initials(contact.display_name),
                thumbnail=thumbs.get(contact.id),
                professions=list(c.get("profession", [])),
                job_title=contact.job_title,
                company=companies.get(contact.id),
                city=contact.city,
                residence=residences.get(contact.id),
                tags=tags,
                last_interaction_date=last_date,  # type: ignore[arg-type]
                created_at=contact.created_at,
                updated_at=contact.updated_at,
            )
        )
    return summaries
