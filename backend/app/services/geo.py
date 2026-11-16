"""Geographic aggregation for the world map (one count per contact and country)."""

from __future__ import annotations

from collections import Counter

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Contact, ContactCountry, Country
from app.schemas.contacts import ContactQuery, FilterCondition
from app.schemas.misc import CountryCount, CountryDetail, CountryOut, MapOut, NameCount
from app.services.contacts import group_classifications
from app.services.errors import NotFound
from app.services.search import search_contacts

DIMENSION_TO_FILTER = {
    "residence": "residence",
    "nationality": "nationality",
    "activity": "activity",
    "expertise": "expertise_country",
    "interest": "interest_country",
}


def list_countries(session: Session) -> list[CountryOut]:
    return [
        CountryOut(code=c.code, numeric=c.numeric, name=c.name_de)
        for c in session.scalars(select(Country).order_by(Country.name_de))
    ]


def country_counts(session: Session, dimension: str) -> MapOut:
    rows = session.execute(
        select(Country.code, Country.numeric, Country.name_de, func.count(func.distinct(ContactCountry.contact_id)))
        .join(ContactCountry, ContactCountry.country_code == Country.code)
        .where(ContactCountry.kind == dimension)
        .group_by(Country.code)
        .order_by(func.count(func.distinct(ContactCountry.contact_id)).desc(), Country.name_de)
    ).all()
    with_country = session.scalar(
        select(func.count(func.distinct(ContactCountry.contact_id))).where(ContactCountry.kind == dimension)
    )
    countries = [CountryCount(code=code, numeric=numeric, name=name, count=int(n)) for code, numeric, name, n in rows]
    return MapOut(
        dimension=dimension,  # type: ignore[arg-type]
        countries=countries,
        max_count=max((c.count for c in countries), default=0),
        contacts_with_country=int(with_country or 0),
    )


def _top(counter: Counter[str], limit: int = 12) -> list[NameCount]:
    return [
        NameCount(name=name, count=n)
        for name, n in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0].casefold()))[:limit]
    ]


def country_detail(session: Session, dimension: str, code: str) -> CountryDetail:
    country = session.get(Country, code.upper())
    if country is None:
        raise NotFound("Land nicht gefunden.")
    result = search_contacts(
        session,
        ContactQuery(
            filters=[FilterCondition(field=DIMENSION_TO_FILTER[dimension], values=[country.code])],  # type: ignore[arg-type]
            sort="name",
            limit=5000,
        ),
    )
    ids = [item.id for item in result.items]
    classes = group_classifications(session, ids)
    professions: Counter[str] = Counter()
    expertise: Counter[str] = Counter()
    for cid in ids:
        professions.update(set(classes.get(cid, {}).get("profession", [])))
        expertise.update(
            set(classes.get(cid, {}).get("specialization", []) + classes.get(cid, {}).get("expertise", []))
        )
    companies: Counter[str] = Counter(item.company for item in result.items if item.company)
    return CountryDetail(
        code=country.code,
        name=country.name_de,
        dimension=dimension,  # type: ignore[arg-type]
        count=result.total,
        contacts=result.items,
        professions=_top(professions),
        companies=_top(companies),
        expertise=_top(expertise),
    )


_ = Contact
