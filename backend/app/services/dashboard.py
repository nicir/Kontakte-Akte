"""Dashboard figures – plain deterministic queries, no predictions."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import Date, String, cast, func, select
from sqlalchemy.orm import Session

from app.models import Contact, ContactCountry
from app.schemas.misc import DashboardOut, InactiveContact
from app.services import reminders as reminder_service
from app.services.search import build_summaries, last_interaction_subquery
from app.services.settings import get_settings


def dashboard(session: Session, tz_name: str) -> DashboardOut:
    tz = reminder_service.zone(tz_name)
    today = datetime.now(UTC).astimezone(tz).date()
    settings = get_settings(session)

    total = session.scalar(select(func.count()).select_from(Contact)) or 0
    countries = session.scalar(select(func.count(func.distinct(ContactCountry.country_code)))) or 0
    groups = reminder_service.grouped(session, tz_name, done_limit=0)
    upcoming = [*groups.today, *groups.week, *groups.later]

    last = last_interaction_subquery()
    recent_rows = session.execute(
        select(Contact, last.c.last_date)
        .outerjoin(last, last.c.contact_id == Contact.id)
        .order_by(Contact.created_at.desc())
        .limit(6)
    ).all()
    contacted_rows = session.execute(
        select(Contact, last.c.last_date)
        .join(last, last.c.contact_id == Contact.id)
        .order_by(last.c.last_date.desc(), Contact.sort_name)
        .limit(6)
    ).all()

    # Reference date: last interaction, else first meeting, else creation date.
    reference = func.coalesce(
        cast(last.c.last_date, String), cast(Contact.first_met_date, String), func.date(Contact.created_at)
    )
    cutoff = (today - timedelta(days=settings.inactivity_days)).isoformat()
    inactive_base = (
        select(Contact, last.c.last_date, reference.label("reference"))
        .outerjoin(last, last.c.contact_id == Contact.id)
        .where(reference < cutoff)
    )
    inactive_total = (
        session.scalar(select(func.count()).select_from(inactive_base.with_only_columns(Contact.id).subquery())) or 0
    )
    inactive_rows = session.execute(inactive_base.order_by(reference.asc(), Contact.sort_name).limit(8)).all()
    inactive_summaries = build_summaries(session, [(c, d) for c, d, _ in inactive_rows])
    inactive = []
    for summary, (_, _, ref) in zip(inactive_summaries, inactive_rows, strict=True):
        ref_date = date.fromisoformat(str(ref)[:10]) if ref else None
        inactive.append(
            InactiveContact(
                contact=summary,
                reference_date=ref_date,
                days=(today - ref_date).days if ref_date else None,
            )
        )

    return DashboardOut(
        total_contacts=int(total),
        countries_represented=int(countries),
        upcoming_reminders=len(upcoming),
        overdue_reminders=len(groups.overdue),
        inactivity_days=settings.inactivity_days,
        recently_added=build_summaries(session, [(c, d) for c, d in recent_rows]),
        recently_contacted=build_summaries(session, [(c, d) for c, d in contacted_rows]),
        upcoming_followups=[*groups.overdue, *upcoming][:6],
        inactive_contacts=inactive,
        inactive_total=int(inactive_total),
    )


_ = Date  # imported for type clarity in casts above
