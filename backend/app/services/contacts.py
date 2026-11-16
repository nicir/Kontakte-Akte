"""Contact CRUD, photos and contact-to-contact links."""

from __future__ import annotations

import base64
import binascii
from collections import defaultdict
from datetime import date

from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.orm import Session

from app.models import (
    Classification,
    Contact,
    ContactChannel,
    ContactClassification,
    ContactCountry,
    ContactLink,
    ContactOrganization,
    ContactPhoto,
    Country,
    Interaction,
    InteractionParticipant,
    RelationshipCategory,
)
from app.models.base import CLASSIFICATION_KINDS, COUNTRY_KINDS
from app.schemas.common import ContactRef, CountryRef, NamedRef
from app.schemas.contacts import (
    ChannelOut,
    ContactDetail,
    ContactInput,
    LinkInput,
    LinkOut,
    LinkUpdate,
    PhotoInput,
)
from app.services.classifications import resolve_classification, resolve_organization
from app.services.errors import Invalid, NotFound
from app.services.search_index import reindex_contacts
from app.services.text import clean, clean_multiline, clean_optional, fold, initials

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_THUMB_BYTES = 512 * 1024
IMAGE_SIGNATURES = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
}


def get_contact(session: Session, contact_id: str) -> Contact:
    contact = session.get(Contact, contact_id)
    if contact is None:
        raise NotFound("Kontakt nicht gefunden.")
    return contact


def contact_ref(contact: Contact, has_photo: bool = False) -> ContactRef:
    return ContactRef(
        id=contact.id, display_name=contact.display_name, initials=initials(contact.display_name), has_photo=has_photo
    )


def _display_name(data: ContactInput) -> str:
    explicit = clean(data.display_name)
    if explicit:
        return explicit
    return clean(f"{clean(data.first_name)} {clean(data.last_name)}")


def _sort_name(contact: Contact) -> str:
    key = f"{contact.last_name} {contact.first_name}".strip() or contact.display_name
    return fold(key)


def _unique_by_fold(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result = []
    for value in values:
        cleaned = clean(value)
        key = fold(cleaned)
        if cleaned and key not in seen:
            seen.add(key)
            result.append(cleaned)
    return result


def _apply(session: Session, contact: Contact, data: ContactInput) -> None:
    contact.first_name = clean(data.first_name)
    contact.last_name = clean(data.last_name)
    contact.display_name = _display_name(data)
    contact.sort_name = _sort_name(contact)
    contact.city = clean_optional(data.city)
    contact.job_title = clean_optional(data.job_title)
    contact.personal_notes = clean_multiline(data.personal_notes)
    contact.how_known = clean_multiline(data.how_known)
    contact.first_met_place = clean_optional(data.first_met_place)
    contact.first_met_date = data.first_met_date
    contact.introduced_by_text = clean_optional(data.introduced_by_text)
    contact.relationship_strength = data.relationship_strength
    contact.relationship_notes = clean_multiline(data.relationship_notes)
    contact.next_planned_interaction = data.next_planned_interaction

    if data.introduced_by_id:
        if data.introduced_by_id == contact.id:
            raise Invalid("Ein Kontakt kann sich nicht selbst vorgestellt haben.")
        if session.get(Contact, data.introduced_by_id) is None:
            raise Invalid("Der vorstellende Kontakt existiert nicht.")
    contact.introduced_by_id = data.introduced_by_id or None

    if (
        data.relationship_category_id is not None
        and session.get(RelationshipCategory, data.relationship_category_id) is None
    ):
        raise Invalid("Die Beziehungskategorie existiert nicht.")
    contact.relationship_category_id = data.relationship_category_id

    # Organizations
    contact.organization_links.clear()
    session.flush()
    current_key = None
    if data.current_organization and clean(data.current_organization):
        org = resolve_organization(session, data.current_organization)
        contact.organization_links.append(ContactOrganization(organization_id=org.id, role="current", position=0))
        current_key = org.id
    for position, name in enumerate(_unique_by_fold(data.previous_organizations)):
        org = resolve_organization(session, name)
        if org.id == current_key:
            continue
        contact.organization_links.append(
            ContactOrganization(organization_id=org.id, role="previous", position=position)
        )

    # Countries (validated against the reference table)
    requested: list[tuple[str, str]] = []
    for kind in COUNTRY_KINDS:
        for code in dict.fromkeys(getattr(data.countries, kind)):
            requested.append((kind, code))
    codes = {code for _, code in requested}
    if codes:
        known = set(session.scalars(select(Country.code).where(Country.code.in_(codes))))
        unknown = codes - known
        if unknown:
            raise Invalid(f"Unbekannter Ländercode: {', '.join(sorted(unknown))}")
    contact.countries.clear()
    session.flush()
    for kind, code in requested:
        contact.countries.append(ContactCountry(country_code=code, kind=kind))

    # Classifications (deduplicated through normalisation + aliases)
    contact.classification_links.clear()
    session.flush()
    seen_ids: set[int] = set()
    position = 0
    for kind in CLASSIFICATION_KINDS:
        for name in _unique_by_fold(getattr(data.classifications, kind)):
            item = resolve_classification(session, kind, name)
            if item.id in seen_ids:
                continue
            seen_ids.add(item.id)
            contact.classification_links.append(ContactClassification(classification_id=item.id, position=position))
            position += 1

    # Channels
    contact.channels.clear()
    session.flush()
    for index, channel in enumerate(data.channels):
        value = clean(channel.value)
        if not value:
            continue
        contact.channels.append(
            ContactChannel(kind=channel.kind, label=clean_optional(channel.label), value=value, position=index)
        )


def create_contact(session: Session, data: ContactInput) -> Contact:
    contact = Contact(display_name="", sort_name="")
    session.add(contact)
    session.flush()
    _apply(session, contact, data)
    session.flush()
    reindex_contacts(session, [contact.id])
    return contact


def update_contact(session: Session, contact_id: str, data: ContactInput) -> Contact:
    contact = get_contact(session, contact_id)
    _apply(session, contact, data)
    session.flush()
    # Contacts that reference this one by name in their search document.
    dependants = set(session.scalars(select(Contact.id).where(Contact.introduced_by_id == contact_id)))
    reindex_contacts(session, {contact.id} | dependants)
    return contact


def update_notes(session: Session, contact_id: str, notes: str | None) -> Contact:
    contact = get_contact(session, contact_id)
    contact.personal_notes = clean_multiline(notes)
    session.flush()
    reindex_contacts(session, [contact.id])
    return contact


def delete_contact(session: Session, contact_id: str) -> None:
    """Delete a contact and everything that belongs exclusively to it.

    Interactions in which this contact was the *only* participant are removed;
    shared interactions remain for the other participants. Organizations,
    classifications and other contacts are never deleted.
    """
    contact = get_contact(session, contact_id)
    interaction_ids = list(
        session.scalars(
            select(InteractionParticipant.interaction_id).where(InteractionParticipant.contact_id == contact_id)
        )
    )
    other_participants: set[str] = set()
    exclusive: list[str] = []
    for interaction_id in interaction_ids:
        others = set(
            session.scalars(
                select(InteractionParticipant.contact_id).where(
                    InteractionParticipant.interaction_id == interaction_id,
                    InteractionParticipant.contact_id != contact_id,
                )
            )
        )
        if others:
            other_participants |= others
        else:
            exclusive.append(interaction_id)
    linked = set(
        session.scalars(select(ContactLink.target_contact_id).where(ContactLink.source_contact_id == contact_id))
    ) | set(session.scalars(select(ContactLink.source_contact_id).where(ContactLink.target_contact_id == contact_id)))
    introduced = set(session.scalars(select(Contact.id).where(Contact.introduced_by_id == contact_id)))

    if exclusive:
        session.execute(delete(Interaction).where(Interaction.id.in_(exclusive)))
    session.delete(contact)
    session.flush()
    session.execute(text("DELETE FROM contact_search WHERE contact_id = :id"), {"id": contact_id})
    reindex_contacts(session, (other_participants | linked | introduced) - {contact_id})


# -------------------------------------------------------------------- photos
def _decode(data: str, limit: int, mime: str) -> bytes:
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise Invalid("Ungültige Bilddaten.") from exc
    if not raw or len(raw) > limit:
        raise Invalid("Das Bild ist zu groß.")
    if not raw.startswith(IMAGE_SIGNATURES[mime]):
        raise Invalid("Das Bildformat wird nicht unterstützt.")
    if mime == "image/webp" and raw[8:12] != b"WEBP":
        raise Invalid("Das Bildformat wird nicht unterstützt.")
    return raw


def set_photo(session: Session, contact_id: str, data: PhotoInput) -> None:
    get_contact(session, contact_id)
    image = _decode(data.image_base64, MAX_IMAGE_BYTES, data.mime_type)
    thumb = _decode(data.thumbnail_base64, MAX_THUMB_BYTES, data.mime_type)
    photo = session.get(ContactPhoto, contact_id)
    if photo is None:
        session.add(ContactPhoto(contact_id=contact_id, mime_type=data.mime_type, image=image, thumbnail=thumb))
    else:
        photo.mime_type = data.mime_type
        photo.image = image
        photo.thumbnail = thumb
    session.flush()


def get_photo(session: Session, contact_id: str) -> ContactPhoto:
    photo = session.get(ContactPhoto, contact_id)
    if photo is None:
        raise NotFound("Kein Profilbild vorhanden.")
    return photo


def delete_photo(session: Session, contact_id: str) -> None:
    session.execute(delete(ContactPhoto).where(ContactPhoto.contact_id == contact_id))


def thumbnails(session: Session, contact_ids: list[str]) -> dict[str, str]:
    if not contact_ids:
        return {}
    rows = session.execute(
        select(ContactPhoto.contact_id, ContactPhoto.mime_type, ContactPhoto.thumbnail).where(
            ContactPhoto.contact_id.in_(contact_ids)
        )
    )
    return {cid: f"data:{mime};base64,{base64.b64encode(thumb).decode()}" for cid, mime, thumb in rows}


def photo_flags(session: Session, contact_ids: list[str]) -> set[str]:
    if not contact_ids:
        return set()
    return set(session.scalars(select(ContactPhoto.contact_id).where(ContactPhoto.contact_id.in_(contact_ids))))


# --------------------------------------------------------------------- links
def create_link(session: Session, source_id: str, data: LinkInput) -> ContactLink:
    get_contact(session, source_id)
    get_contact(session, data.target_contact_id)
    if source_id == data.target_contact_id:
        raise Invalid("Ein Kontakt kann nicht mit sich selbst verknüpft werden.")
    link = ContactLink(
        source_contact_id=source_id,
        target_contact_id=data.target_contact_id,
        relation_type=clean(data.relation_type),
        description=clean_multiline(data.description),
    )
    session.add(link)
    session.flush()
    reindex_contacts(session, [source_id, data.target_contact_id])
    return link


def update_link(session: Session, link_id: str, data: LinkUpdate) -> ContactLink:
    link = session.get(ContactLink, link_id)
    if link is None:
        raise NotFound("Verknüpfung nicht gefunden.")
    link.relation_type = clean(data.relation_type)
    link.description = clean_multiline(data.description)
    session.flush()
    reindex_contacts(session, [link.source_contact_id, link.target_contact_id])
    return link


def delete_link(session: Session, link_id: str) -> None:
    link = session.get(ContactLink, link_id)
    if link is None:
        raise NotFound("Verknüpfung nicht gefunden.")
    ids = [link.source_contact_id, link.target_contact_id]
    session.delete(link)
    session.flush()
    reindex_contacts(session, ids)


def link_relation_suggestions(session: Session) -> list[str]:
    defaults = [
        "hat mich vorgestellt",
        "arbeitet mit",
        "Geschäftspartner/in",
        "Projektpartner/in",
        "Kolleg/in",
        "Vorgesetzte/r",
        "Freund/in",
        "Familie",
    ]
    used = session.scalars(
        select(ContactLink.relation_type).group_by(ContactLink.relation_type).order_by(func.count().desc()).limit(30)
    ).all()
    return _unique_by_fold([*used, *defaults])


# -------------------------------------------------------------------- detail
def last_interaction_dates(session: Session, contact_ids: list[str] | None = None) -> dict[str, date]:
    stmt = (
        select(InteractionParticipant.contact_id, func.max(Interaction.occurred_on))
        .join(Interaction, Interaction.id == InteractionParticipant.interaction_id)
        .group_by(InteractionParticipant.contact_id)
    )
    if contact_ids is not None:
        stmt = stmt.where(InteractionParticipant.contact_id.in_(contact_ids))
    return {cid: d for cid, d in session.execute(stmt)}


def contact_detail(session: Session, contact_id: str) -> ContactDetail:
    contact = get_contact(session, contact_id)

    countries: dict[str, list[CountryRef]] = {kind: [] for kind in COUNTRY_KINDS}
    for kind, code, name in session.execute(
        select(ContactCountry.kind, Country.code, Country.name_de)
        .join(Country, Country.code == ContactCountry.country_code)
        .where(ContactCountry.contact_id == contact_id)
        .order_by(Country.name_de)
    ):
        countries[kind].append(CountryRef(code=code, name=name))

    classifications: dict[str, list[str]] = {kind: [] for kind in CLASSIFICATION_KINDS}
    for link in contact.classification_links:
        classifications[link.classification.kind].append(link.classification.name)

    current = next((lk.organization.name for lk in contact.organization_links if lk.role == "current"), None)
    previous = [lk.organization.name for lk in contact.organization_links if lk.role == "previous"]

    link_rows = session.scalars(
        select(ContactLink)
        .where(or_(ContactLink.source_contact_id == contact_id, ContactLink.target_contact_id == contact_id))
        .order_by(ContactLink.created_at)
    ).all()
    other_ids = [
        lk.target_contact_id if lk.source_contact_id == contact_id else lk.source_contact_id for lk in link_rows
    ]
    others = {c.id: c for c in session.scalars(select(Contact).where(Contact.id.in_(other_ids)))} if other_ids else {}
    with_photo = photo_flags(session, [*other_ids, contact_id])
    links = []
    for link, other_id in zip(link_rows, other_ids, strict=True):
        other = others.get(other_id)
        if other is None:
            continue
        links.append(
            LinkOut(
                id=link.id,
                direction="outgoing" if link.source_contact_id == contact_id else "incoming",
                other=contact_ref(other, other_id in with_photo),
                relation_type=link.relation_type,
                description=link.description,
                created_at=link.created_at,
            )
        )

    photo_updated = session.scalar(select(ContactPhoto.updated_at).where(ContactPhoto.contact_id == contact_id))
    return ContactDetail(
        id=contact.id,
        first_name=contact.first_name,
        last_name=contact.last_name,
        display_name=contact.display_name,
        initials=initials(contact.display_name),
        city=contact.city,
        job_title=contact.job_title,
        personal_notes=contact.personal_notes,
        how_known=contact.how_known,
        first_met_place=contact.first_met_place,
        first_met_date=contact.first_met_date,
        introduced_by=contact_ref(contact.introduced_by) if contact.introduced_by else None,
        introduced_by_text=contact.introduced_by_text,
        relationship_category=NamedRef(id=contact.relationship_category.id, name=contact.relationship_category.name)
        if contact.relationship_category
        else None,
        relationship_strength=contact.relationship_strength,
        relationship_notes=contact.relationship_notes,
        next_planned_interaction=contact.next_planned_interaction,
        current_organization=current,
        previous_organizations=previous,
        countries={k: v for k, v in countries.items()},
        classifications=classifications,
        channels=[ChannelOut(id=c.id, kind=c.kind, label=c.label, value=c.value) for c in contact.channels],
        has_photo=contact_id in with_photo,
        photo_version=photo_updated.isoformat() if photo_updated else None,
        last_interaction_date=last_interaction_dates(session, [contact_id]).get(contact_id),
        links=links,
        created_at=contact.created_at,
        updated_at=contact.updated_at,
    )


def contact_refs(session: Session, contact_ids: list[str]) -> dict[str, ContactRef]:
    if not contact_ids:
        return {}
    with_photo = photo_flags(session, contact_ids)
    return {
        c.id: contact_ref(c, c.id in with_photo)
        for c in session.scalars(select(Contact).where(Contact.id.in_(contact_ids)))
    }


def group_classifications(session: Session, contact_ids: list[str]) -> dict[str, dict[str, list[str]]]:
    """contact_id → kind → [names] in display order (batched, no N+1)."""
    result: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
    if not contact_ids:
        return result
    rows = session.execute(
        select(ContactClassification.contact_id, Classification.kind, Classification.name)
        .join(Classification, Classification.id == ContactClassification.classification_id)
        .where(ContactClassification.contact_id.in_(contact_ids))
        .order_by(ContactClassification.position)
    )
    for cid, kind, name in rows:
        result[cid][kind].append(name)
    return result
