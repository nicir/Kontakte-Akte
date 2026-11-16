"""Reminders / follow-ups.

Time model
----------
* ``due_date`` is a calendar date. Date-only reminders are compared as dates
  against "today" in the viewer's timezone – they are never converted to an
  instant, so they cannot shift by a day.
* ``due_time`` (optional) is a wall-clock time interpreted in the reminder's
  IANA ``timezone``. The instant is computed with zoneinfo at evaluation time,
  so daylight-saving transitions are handled correctly.
* For notifications, date-only reminders fire at 09:00 local time.
"""

from __future__ import annotations

import calendar
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.types import utcnow
from app.models import Contact, Interaction, Reminder
from app.schemas.activity import (
    NotificationPlan,
    PostponeInput,
    ReminderGroups,
    ReminderInput,
    ReminderOut,
    ScheduledNotification,
)
from app.services.contacts import contact_refs
from app.services.errors import Invalid, NotFound
from app.services.text import clean, clean_multiline

DEFAULT_NOTIFY_TIME = time(9, 0)


def zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise Invalid("Unbekannte Zeitzone.") from exc


def due_instant(reminder: Reminder) -> datetime:
    local = datetime.combine(
        reminder.due_date, reminder.due_time or DEFAULT_NOTIFY_TIME, tzinfo=zone(reminder.timezone)
    )
    return local.astimezone(UTC)


def bucket_for(reminder: Reminder, now: datetime, today: date) -> str:
    if reminder.status == "done":
        return "done"
    if reminder.due_time is not None:
        if due_instant(reminder) <= now:
            return "overdue"
    elif reminder.due_date < today:
        return "overdue"
    if reminder.due_date <= today:
        return "today"
    if reminder.due_date <= today + timedelta(days=7):
        return "week"
    return "later"


def _validate_links(session: Session, contact_id: str | None, interaction_id: str | None) -> None:
    if contact_id and session.get(Contact, contact_id) is None:
        raise Invalid("Der Kontakt existiert nicht.")
    if interaction_id and session.get(Interaction, interaction_id) is None:
        raise Invalid("Die Interaktion existiert nicht.")


def create_reminder(session: Session, data: ReminderInput) -> Reminder:
    zone(data.timezone)
    _validate_links(session, data.contact_id, data.interaction_id)
    reminder = Reminder(
        contact_id=data.contact_id or None,
        interaction_id=data.interaction_id or None,
        title=clean(data.title),
        description=clean_multiline(data.description),
        due_date=data.due_date,
        due_time=data.due_time,
        timezone=data.timezone,
        status="open",
    )
    if not reminder.title:
        raise Invalid("Bitte gib einen Titel ein.")
    session.add(reminder)
    session.flush()
    return reminder


def _get(session: Session, reminder_id: str) -> Reminder:
    reminder = session.get(Reminder, reminder_id)
    if reminder is None:
        raise NotFound("Erinnerung nicht gefunden.")
    return reminder


def update_reminder(session: Session, reminder_id: str, data: ReminderInput) -> Reminder:
    reminder = _get(session, reminder_id)
    zone(data.timezone)
    _validate_links(session, data.contact_id, data.interaction_id)
    reminder.contact_id = data.contact_id or None
    reminder.interaction_id = data.interaction_id or None
    reminder.title = clean(data.title)
    reminder.description = clean_multiline(data.description)
    reminder.due_date = data.due_date
    reminder.due_time = data.due_time
    reminder.timezone = data.timezone
    if not reminder.title:
        raise Invalid("Bitte gib einen Titel ein.")
    session.flush()
    return reminder


def complete_reminder(session: Session, reminder_id: str) -> Reminder:
    reminder = _get(session, reminder_id)
    reminder.status = "done"
    reminder.completed_at = utcnow()
    session.flush()
    return reminder


def reopen_reminder(session: Session, reminder_id: str) -> Reminder:
    reminder = _get(session, reminder_id)
    reminder.status = "open"
    reminder.completed_at = None
    session.flush()
    return reminder


def add_months(day: date, months: int) -> date:
    month_index = day.month - 1 + months
    year = day.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def postpone_reminder(session: Session, reminder_id: str, data: PostponeInput) -> Reminder:
    reminder = _get(session, reminder_id)
    today = datetime.now(zone(data.timezone)).date()
    if data.due_date is not None:
        new_date = data.due_date
    else:
        base = max(reminder.due_date, today)
        if data.days:
            new_date = base + timedelta(days=data.days)
        elif data.months:
            new_date = add_months(base, data.months)
        else:
            raise Invalid("Bitte gib an, um wie lange verschoben werden soll.")
    reminder.due_date = new_date
    reminder.status = "open"
    reminder.completed_at = None
    session.flush()
    return reminder


def delete_reminder(session: Session, reminder_id: str) -> None:
    session.delete(_get(session, reminder_id))
    session.flush()


def to_out(session: Session, reminders: list[Reminder], tz_name: str) -> list[ReminderOut]:
    tz = zone(tz_name)
    now = datetime.now(UTC)
    today = now.astimezone(tz).date()
    refs = contact_refs(session, [r.contact_id for r in reminders if r.contact_id])
    interaction_ids = [r.interaction_id for r in reminders if r.interaction_id]
    titles = (
        dict(
            session.execute(select(Interaction.id, Interaction.title).where(Interaction.id.in_(interaction_ids))).all()
        )
        if interaction_ids
        else {}
    )
    return [
        ReminderOut(
            id=r.id,
            contact=refs.get(r.contact_id) if r.contact_id else None,
            interaction_id=r.interaction_id,
            interaction_title=titles.get(r.interaction_id) if r.interaction_id else None,
            title=r.title,
            description=r.description,
            due_date=r.due_date,
            due_time=r.due_time,
            timezone=r.timezone,
            due_at=due_instant(r),
            status=r.status,
            bucket=bucket_for(r, now, today),  # type: ignore[arg-type]
            completed_at=r.completed_at,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in reminders
    ]


def _sort_key(item: ReminderOut) -> tuple[date, time, datetime]:
    return (item.due_date, item.due_time or time(0, 0), item.created_at)


def grouped(session: Session, tz_name: str, contact_id: str | None = None, done_limit: int = 100) -> ReminderGroups:
    stmt = select(Reminder).where(Reminder.status == "open")
    if contact_id:
        stmt = stmt.where(Reminder.contact_id == contact_id)
    open_items = to_out(session, list(session.scalars(stmt)), tz_name)
    done_stmt = (
        select(Reminder).where(Reminder.status == "done").order_by(Reminder.completed_at.desc()).limit(done_limit)
    )
    if contact_id:
        done_stmt = done_stmt.where(Reminder.contact_id == contact_id)
    done_items = to_out(session, list(session.scalars(done_stmt)), tz_name)
    groups: dict[str, list[ReminderOut]] = {"overdue": [], "today": [], "week": [], "later": [], "done": done_items}
    for item in sorted(open_items, key=_sort_key):
        groups[item.bucket].append(item)
    return ReminderGroups(**groups)


def get_out(session: Session, reminder_id: str, tz_name: str) -> ReminderOut:
    return to_out(session, [_get(session, reminder_id)], tz_name)[0]


def notification_plan(session: Session, tz_name: str, horizon_days: int = 8) -> NotificationPlan:
    tz = zone(tz_name)
    now = datetime.now(UTC)
    today = now.astimezone(tz).date()
    reminders = list(
        session.scalars(
            select(Reminder).where(Reminder.status == "open", Reminder.due_date <= today + timedelta(days=horizon_days))
        )
    )
    refs = contact_refs(session, [r.contact_id for r in reminders if r.contact_id])
    overdue = today_count = 0
    upcoming: list[ScheduledNotification] = []
    for r in reminders:
        bucket = bucket_for(r, now, today)
        if bucket == "overdue":
            overdue += 1
            continue
        if bucket == "today":
            today_count += 1
        instant = due_instant(r)
        if instant > now:
            ref = refs.get(r.contact_id) if r.contact_id else None
            upcoming.append(
                ScheduledNotification(
                    id=r.id,
                    title=r.title,
                    contact_name=ref.display_name if ref else None,
                    due_at_ms=int(instant.timestamp() * 1000),
                )
            )
    upcoming.sort(key=lambda n: n.due_at_ms)
    return NotificationPlan(overdue_count=overdue, today_count=today_count, upcoming=upcoming)
