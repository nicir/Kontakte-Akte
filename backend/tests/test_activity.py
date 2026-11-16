from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.models import Reminder
from app.services.reminders import add_months, bucket_for, due_instant
from tests.conftest import Api, rahul

TZ = "Europe/Berlin"


@pytest.fixture
def people(api: Api) -> dict[str, str]:
    return {
        "rahul": api.create_contact(**rahul())["id"],
        "maria": api.create_contact(first_name="Maria", last_name="Rossi")["id"],
    }


def interaction(people: dict[str, str], **extra: object) -> dict[str, object]:
    data: dict[str, object] = {
        "occurred_on": "2026-03-15",
        "kind": "phone",
        "title": "Telefonat",
        "description": "Mögliche Investitionskooperation zwischen europäischen Investoren und indischen Unternehmen.",
        "participant_ids": [people["rahul"]],
    }
    data.update(extra)
    return data


def test_scenario_c_interaction_in_timeline(api: Api, people: dict[str, str]) -> None:
    created = api.post("/api/interactions", interaction(people), expect=201)
    api.post(
        "/api/interactions",
        interaction(people, occurred_on="2026-05-02", kind="meeting", title="Treffen"),
        expect=201,
    )
    api.post(
        "/api/interactions",
        interaction(people, occurred_on="2026-01-10", kind="email", title="Erste Mail"),
        expect=201,
    )
    timeline = api.get("/api/interactions", contact_id=people["rahul"])
    assert [i["title"] for i in timeline] == ["Treffen", "Telefonat", "Erste Mail"]  # newest first
    assert created["kind"] == "phone" and created["occurred_on"] == "2026-03-15"
    assert api.get(f"/api/contacts/{people['rahul']}")["last_interaction_date"] == "2026-05-02"


def test_multi_participant_interaction_on_both_profiles(api: Api, people: dict[str, str]) -> None:
    created = api.post(
        "/api/interactions",
        interaction(
            people,
            kind="meeting",
            title="Treffen in Singapur",
            participant_ids=[people["rahul"], people["maria"]],
            topics=["Markteintritt Indien", "markteintritt indien"],
            location="Singapur",
        ),
        expect=201,
    )
    assert created["topics"] == ["Markteintritt Indien"]
    assert sorted(p["display_name"] for p in created["participants"]) == ["Maria Rossi", "Rahul Sharma"]
    for pid in people.values():
        assert [i["id"] for i in api.get("/api/interactions", contact_id=pid)] == [created["id"]]


def test_edit_and_delete_interaction(api: Api, people: dict[str, str]) -> None:
    created = api.post("/api/interactions", interaction(people), expect=201)
    updated = api.put(
        f"/api/interactions/{created['id']}",
        interaction(
            people, title="Videocall", kind="video", participant_ids=[people["maria"]], occurred_time="14:30:00"
        ),
    )
    assert updated["title"] == "Videocall" and updated["occurred_time"] == "14:30:00"
    assert api.get("/api/interactions", contact_id=people["rahul"]) == []
    assert len(api.get("/api/interactions", contact_id=people["maria"])) == 1
    assert api.search(text="videocall")["items"][0]["display_name"] == "Maria Rossi"
    api.delete(f"/api/interactions/{created['id']}")
    assert api.get("/api/interactions") == []
    assert api.search(text="videocall")["total"] == 0


def test_interaction_with_follow_up_reminder(api: Api, people: dict[str, str]) -> None:
    created = api.post(
        "/api/interactions",
        interaction(people, follow_up={"title": "Nachfassen", "due_date": "2030-06-15", "timezone": TZ}),
        expect=201,
    )
    assert created["reminders"][0]["title"] == "Nachfassen"
    groups = api.get("/api/reminders", tz=TZ, contact_id=people["rahul"])
    assert groups["later"][0]["interaction_title"] == "Telefonat"


def test_invalid_interaction_rejected(api: Api, people: dict[str, str]) -> None:
    api.post("/api/interactions", interaction(people, participant_ids=[]), expect=422)
    api.post("/api/interactions", interaction(people, participant_ids=["unknown"]), expect=422)
    api.post("/api/interactions", interaction(people, kind="sales_call"), expect=422)


def reminder(contact_id: str, due: date, **extra: object) -> dict[str, object]:
    return {
        "contact_id": contact_id,
        "title": "Nachfassen Investitionsprojekt",
        "due_date": due.isoformat(),
        "timezone": TZ,
        **extra,
    }


def today_berlin() -> date:
    return datetime.now(ZoneInfo(TZ)).date()


def test_scenario_d_reminder_lifecycle(api: Api, people: dict[str, str], make_api) -> None:  # type: ignore[no-untyped-def]
    today = today_berlin()
    r = api.post("/api/reminders", reminder(people["rahul"], today + timedelta(days=60)), tz=TZ, expect=201)
    assert r["bucket"] == "later" and r["contact"]["display_name"] == "Rahul Sharma"
    assert api.get("/api/reminders", tz=TZ, contact_id=people["rahul"])["later"][0]["id"] == r["id"]
    dash = api.get("/api/dashboard", tz=TZ)
    assert dash["upcoming_reminders"] == 1 and dash["upcoming_followups"][0]["id"] == r["id"]

    edited = api.put(
        f"/api/reminders/{r['id']}", reminder(people["rahul"], today + timedelta(days=3), title="Anrufen"), tz=TZ
    )
    assert edited["bucket"] == "week" and edited["title"] == "Anrufen"

    overdue = api.put(f"/api/reminders/{r['id']}", reminder(people["rahul"], today - timedelta(days=1)), tz=TZ)
    assert overdue["bucket"] == "overdue"
    assert api.get("/api/dashboard", tz=TZ)["overdue_reminders"] == 1

    due_today = api.put(f"/api/reminders/{r['id']}", reminder(people["rahul"], today), tz=TZ)
    assert due_today["bucket"] == "today"

    postponed = api.post(f"/api/reminders/{r['id']}/postpone", {"days": 7, "timezone": TZ})
    assert postponed["due_date"] == (today + timedelta(days=7)).isoformat()

    done = api.post(f"/api/reminders/{r['id']}/complete", tz=TZ)
    assert done["status"] == "done" and done["bucket"] == "done" and done["completed_at"]
    assert api.get("/api/reminders", tz=TZ)["done"][0]["id"] == r["id"]

    reopened = api.post(f"/api/reminders/{r['id']}/reopen", tz=TZ)
    assert reopened["status"] == "open" and reopened["completed_at"] is None

    restarted = make_api()
    restarted.unlock()
    assert restarted.get("/api/reminders", tz=TZ)["week"][0]["id"] == r["id"]

    api.delete(f"/api/reminders/{r['id']}")
    assert all(not v for v in api.get("/api/reminders", tz=TZ).values())


def test_postpone_overdue_counts_from_today(api: Api, people: dict[str, str]) -> None:
    today = today_berlin()
    r = api.post("/api/reminders", reminder(people["rahul"], today - timedelta(days=30)), tz=TZ, expect=201)
    postponed = api.post(f"/api/reminders/{r['id']}/postpone", {"months": 1, "timezone": TZ})
    assert postponed["due_date"] == add_months(today, 1).isoformat()
    fixed = api.post(f"/api/reminders/{r['id']}/postpone", {"due_date": "2031-02-03", "timezone": TZ})
    assert fixed["due_date"] == "2031-02-03"


def test_invalid_timezone_rejected(api: Api, people: dict[str, str]) -> None:
    api.post("/api/reminders", reminder(people["rahul"], today_berlin(), timezone="Mars/Olympus"), expect=422)


def test_notification_plan(api: Api, people: dict[str, str]) -> None:
    today = today_berlin()
    api.post("/api/reminders", reminder(people["rahul"], today - timedelta(days=2)), expect=201)
    soon = api.post(
        "/api/reminders", reminder(people["maria"], today + timedelta(days=2), due_time="10:15:00"), expect=201
    )
    api.post("/api/reminders", reminder(people["maria"], today + timedelta(days=100)), expect=201)
    plan = api.get("/api/reminders/notification-plan", tz=TZ)
    assert plan["overdue_count"] == 1
    assert [n["id"] for n in plan["upcoming"]] == [soon["id"]]
    expected = datetime.combine(today + timedelta(days=2), time(10, 15), tzinfo=ZoneInfo(TZ))
    assert plan["upcoming"][0]["due_at_ms"] == int(expected.timestamp() * 1000)
    assert plan["upcoming"][0]["contact_name"] == "Maria Rossi"


def test_dst_and_date_only_semantics() -> None:
    # 29 March 2026: Europe/Berlin switches from CET (+1) to CEST (+2).
    before = Reminder(due_date=date(2026, 3, 28), due_time=time(9, 0), timezone=TZ, status="open")
    after = Reminder(due_date=date(2026, 3, 30), due_time=time(9, 0), timezone=TZ, status="open")
    assert due_instant(before) == datetime(2026, 3, 28, 8, 0, tzinfo=UTC)
    assert due_instant(after) == datetime(2026, 3, 30, 7, 0, tzinfo=UTC)  # still 09:00 local

    # A date-only reminder is "today" on its calendar date regardless of UTC offset.
    date_only = Reminder(due_date=date(2026, 6, 15), due_time=None, timezone="Pacific/Kiritimati", status="open")
    late_evening_utc = datetime(2026, 6, 15, 23, 30, tzinfo=UTC)
    assert bucket_for(date_only, late_evening_utc, date(2026, 6, 15)) == "today"
    assert bucket_for(date_only, late_evening_utc, date(2026, 6, 16)) == "overdue"
    assert bucket_for(date_only, late_evening_utc, date(2026, 6, 14)) == "week"

    timed = Reminder(due_date=date(2026, 6, 15), due_time=time(18, 0), timezone=TZ, status="open")
    assert bucket_for(timed, datetime(2026, 6, 15, 15, 59, tzinfo=UTC), date(2026, 6, 15)) == "today"
    assert bucket_for(timed, datetime(2026, 6, 15, 16, 0, tzinfo=UTC), date(2026, 6, 15)) == "overdue"


def test_add_months_clamps_day() -> None:
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert add_months(date(2026, 11, 30), 3) == date(2027, 2, 28)
