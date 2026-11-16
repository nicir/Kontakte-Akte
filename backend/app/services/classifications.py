"""Reusable classification values, aliases, organizations and relationship categories."""

from __future__ import annotations

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.models import (
    Classification,
    ClassificationAlias,
    Contact,
    ContactClassification,
    ContactOrganization,
    InteractionTopic,
    Organization,
    RelationshipCategory,
)
from app.models.base import CLASSIFICATION_KINDS
from app.services.errors import Conflict, Invalid, NotFound
from app.services.search_index import contacts_using_classifications, reindex_contacts
from app.services.text import clean, escape_like, fold

MAX_NAME_LENGTH = 200


def _validate_kind(kind: str) -> None:
    if kind not in CLASSIFICATION_KINDS:
        raise Invalid(f"Unbekannte Kategorie: {kind}")


def _valid_name(name: str) -> str:
    value = clean(name)
    if not value:
        raise Invalid("Der Name darf nicht leer sein.")
    if len(value) > MAX_NAME_LENGTH:
        raise Invalid(f"Der Name darf höchstens {MAX_NAME_LENGTH} Zeichen lang sein.")
    return value


def find_classification(session: Session, kind: str, name: str) -> Classification | None:
    """Exact (normalised) match on the name or on a manually defined alias."""
    key = fold(name)
    found = session.scalar(
        select(Classification).where(Classification.kind == kind, Classification.normalized_name == key)
    )
    if found is not None:
        return found
    return session.scalar(
        select(Classification)
        .join(ClassificationAlias, ClassificationAlias.classification_id == Classification.id)
        .where(Classification.kind == kind, ClassificationAlias.normalized_alias == key)
        .limit(1)
    )


def resolve_classification(session: Session, kind: str, name: str) -> Classification:
    _validate_kind(kind)
    value = _valid_name(name)
    existing = find_classification(session, kind, value)
    if existing is not None:
        return existing
    created = Classification(kind=kind, name=value, normalized_name=fold(value))
    session.add(created)
    session.flush()
    return created


def suggest(session: Session, kind: str, query: str, limit: int = 15) -> list[dict[str, object]]:
    _validate_kind(kind)
    usage = (
        select(ContactClassification.classification_id, func.count().label("n"))
        .group_by(ContactClassification.classification_id)
        .subquery()
    )
    stmt = (
        select(Classification, func.coalesce(usage.c.n, 0))
        .outerjoin(usage, usage.c.classification_id == Classification.id)
        .where(Classification.kind == kind)
    )
    key = fold(query)
    if key:
        pattern = f"%{escape_like(key)}%"
        alias_match = select(ClassificationAlias.classification_id).where(
            ClassificationAlias.normalized_alias.like(pattern, escape="\\")
        )
        stmt = stmt.where(
            Classification.normalized_name.like(pattern, escape="\\") | Classification.id.in_(alias_match)
        )
    rows = session.execute(stmt.order_by(func.coalesce(usage.c.n, 0).desc(), Classification.normalized_name)).all()
    results = []
    for classification, count in rows:
        starts = classification.normalized_name.startswith(key) if key else False
        results.append({"id": classification.id, "name": classification.name, "usage": int(count), "_starts": starts})
    results.sort(key=lambda r: (not r["_starts"], -int(r["usage"]), str(r["name"]).casefold()))  # type: ignore[call-overload]
    for r in results:
        r.pop("_starts")
    return results[:limit]


def manage_list(session: Session, kind: str) -> list[dict[str, object]]:
    _validate_kind(kind)
    usage = (
        select(ContactClassification.classification_id, func.count().label("n"))
        .group_by(ContactClassification.classification_id)
        .subquery()
    )
    topic_usage = (
        select(InteractionTopic.classification_id, func.count().label("n"))
        .group_by(InteractionTopic.classification_id)
        .subquery()
    )
    rows = session.execute(
        select(Classification, func.coalesce(usage.c.n, 0), func.coalesce(topic_usage.c.n, 0))
        .outerjoin(usage, usage.c.classification_id == Classification.id)
        .outerjoin(topic_usage, topic_usage.c.classification_id == Classification.id)
        .where(Classification.kind == kind)
        .order_by(Classification.normalized_name)
    ).all()
    return [
        {
            "id": c.id,
            "kind": c.kind,
            "name": c.name,
            "contact_count": int(n),
            "interaction_count": int(t),
            "aliases": [{"id": a.id, "alias": a.alias} for a in c.aliases],
        }
        for c, n, t in rows
    ]


def _get(session: Session, classification_id: int) -> Classification:
    found = session.get(Classification, classification_id)
    if found is None:
        raise NotFound("Eintrag nicht gefunden.")
    return found


def rename(session: Session, classification_id: int, new_name: str) -> Classification:
    item = _get(session, classification_id)
    value = _valid_name(new_name)
    key = fold(value)
    clash = session.scalar(
        select(Classification).where(
            Classification.kind == item.kind,
            Classification.normalized_name == key,
            Classification.id != item.id,
        )
    )
    if clash is not None:
        raise Conflict(f"„{clash.name}“ existiert bereits. Verwende „Zusammenführen“, um beide Einträge zu vereinen.")
    item.name = value
    item.normalized_name = key
    session.execute(
        delete(ClassificationAlias).where(
            ClassificationAlias.classification_id == item.id, ClassificationAlias.normalized_alias == key
        )
    )
    reindex_contacts(session, contacts_using_classifications(session, [item.id]))
    return item


def merge(session: Session, source_id: int, target_id: int) -> Classification:
    """Merge source into target (explicit user action). Source name becomes an alias."""
    if source_id == target_id:
        raise Invalid("Ein Eintrag kann nicht mit sich selbst zusammengeführt werden.")
    source = _get(session, source_id)
    target = _get(session, target_id)
    if source.kind != target.kind:
        raise Invalid("Nur Einträge derselben Kategorie können zusammengeführt werden.")
    affected = contacts_using_classifications(session, [source.id, target.id])

    existing_contacts = set(
        session.scalars(
            select(ContactClassification.contact_id).where(ContactClassification.classification_id == target.id)
        )
    )
    for link in session.scalars(
        select(ContactClassification).where(ContactClassification.classification_id == source.id)
    ).all():
        if link.contact_id in existing_contacts:
            session.delete(link)
        else:
            link.classification_id = target.id
    existing_interactions = set(
        session.scalars(select(InteractionTopic.interaction_id).where(InteractionTopic.classification_id == target.id))
    )
    for topic in session.scalars(select(InteractionTopic).where(InteractionTopic.classification_id == source.id)).all():
        if topic.interaction_id in existing_interactions:
            session.delete(topic)
        else:
            topic.classification_id = target.id
    session.flush()

    alias_keys = {a.normalized_alias for a in target.aliases} | {target.normalized_name}
    for name in [source.name, *[a.alias for a in source.aliases]]:
        key = fold(name)
        if key not in alias_keys:
            target.aliases.append(ClassificationAlias(alias=name, normalized_alias=key))
            alias_keys.add(key)
    session.delete(source)
    session.flush()
    reindex_contacts(session, affected)
    return target


def add_alias(session: Session, classification_id: int, alias: str) -> ClassificationAlias:
    item = _get(session, classification_id)
    value = _valid_name(alias)
    key = fold(value)
    if key == item.normalized_name or any(a.normalized_alias == key for a in item.aliases):
        raise Conflict("Dieses Synonym ist bereits vorhanden.")
    other = find_classification(session, item.kind, value)
    if other is not None and other.id != item.id:
        raise Conflict(f"„{value}“ ist bereits ein eigener Eintrag. Verwende „Zusammenführen“.")
    created = ClassificationAlias(alias=value, normalized_alias=key)
    item.aliases.append(created)
    session.flush()
    reindex_contacts(session, contacts_using_classifications(session, [item.id]))
    return created


def remove_alias(session: Session, alias_id: int) -> None:
    alias = session.get(ClassificationAlias, alias_id)
    if alias is None:
        raise NotFound("Synonym nicht gefunden.")
    classification_id = alias.classification_id
    session.delete(alias)
    session.flush()
    reindex_contacts(session, contacts_using_classifications(session, [classification_id]))


def delete_classification(session: Session, classification_id: int) -> None:
    item = _get(session, classification_id)
    affected = contacts_using_classifications(session, [item.id])
    session.delete(item)
    session.flush()
    reindex_contacts(session, affected)


# ---------------------------------------------------------------- organizations
def resolve_organization(session: Session, name: str) -> Organization:
    value = _valid_name(name)
    key = fold(value)
    found = session.scalar(select(Organization).where(Organization.normalized_name == key))
    if found is not None:
        return found
    created = Organization(name=value, normalized_name=key)
    session.add(created)
    session.flush()
    return created


def suggest_organizations(session: Session, query: str, limit: int = 15) -> list[dict[str, object]]:
    usage = (
        select(ContactOrganization.organization_id, func.count().label("n"))
        .group_by(ContactOrganization.organization_id)
        .subquery()
    )
    stmt = select(Organization, func.coalesce(usage.c.n, 0)).outerjoin(
        usage, usage.c.organization_id == Organization.id
    )
    key = fold(query)
    if key:
        stmt = stmt.where(Organization.normalized_name.like(f"%{escape_like(key)}%", escape="\\"))
    rows = session.execute(stmt.order_by(func.coalesce(usage.c.n, 0).desc(), Organization.normalized_name).limit(limit))
    return [{"id": o.id, "name": o.name, "usage": int(n)} for o, n in rows]


# ------------------------------------------------------- relationship categories
def list_categories(session: Session) -> list[dict[str, object]]:
    usage = (
        select(Contact.relationship_category_id, func.count().label("n"))
        .group_by(Contact.relationship_category_id)
        .subquery()
    )
    rows = session.execute(
        select(RelationshipCategory, func.coalesce(usage.c.n, 0))
        .outerjoin(usage, usage.c.relationship_category_id == RelationshipCategory.id)
        .order_by(RelationshipCategory.position, RelationshipCategory.normalized_name)
    )
    return [{"id": c.id, "name": c.name, "contact_count": int(n)} for c, n in rows]


def create_category(session: Session, name: str) -> RelationshipCategory:
    value = _valid_name(name)
    key = fold(value)
    if session.scalar(select(RelationshipCategory).where(RelationshipCategory.normalized_name == key)):
        raise Conflict("Diese Beziehungskategorie existiert bereits.")
    position = (session.scalar(select(func.max(RelationshipCategory.position))) or 0) + 1
    category = RelationshipCategory(name=value, normalized_name=key, position=position)
    session.add(category)
    session.flush()
    return category


def rename_category(session: Session, category_id: int, name: str) -> RelationshipCategory:
    category = session.get(RelationshipCategory, category_id)
    if category is None:
        raise NotFound("Beziehungskategorie nicht gefunden.")
    value = _valid_name(name)
    key = fold(value)
    clash = session.scalar(
        select(RelationshipCategory).where(
            RelationshipCategory.normalized_name == key, RelationshipCategory.id != category_id
        )
    )
    if clash is not None:
        raise Conflict("Diese Beziehungskategorie existiert bereits.")
    category.name = value
    category.normalized_name = key
    affected = session.scalars(select(Contact.id).where(Contact.relationship_category_id == category_id)).all()
    reindex_contacts(session, affected)
    return category


def delete_category(session: Session, category_id: int) -> None:
    category = session.get(RelationshipCategory, category_id)
    if category is None:
        raise NotFound("Beziehungskategorie nicht gefunden.")
    affected = session.scalars(select(Contact.id).where(Contact.relationship_category_id == category_id)).all()
    session.execute(
        update(Contact).where(Contact.relationship_category_id == category_id).values(relationship_category_id=None)
    )
    session.delete(category)
    session.flush()
    reindex_contacts(session, affected)
