from __future__ import annotations

from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import APIModel, ContactRef, LongText, NameText, ShortText

InteractionKind = Literal[
    "meeting", "phone", "email", "video", "conference", "conversation", "introduction", "message", "other"
]
ReminderBucket = Literal["overdue", "today", "week", "later", "done"]


class FollowUpInput(APIModel):
    title: ShortText = Field(..., min_length=1)
    description: LongText | None = None
    due_date: date
    due_time: time | None = None
    timezone: str = Field(..., min_length=1, max_length=64)
    contact_id: str | None = None


class InteractionInput(APIModel):
    occurred_on: date
    occurred_time: time | None = None
    kind: InteractionKind
    title: ShortText = Field(..., min_length=1)
    description: LongText | None = None
    location: ShortText | None = None
    participant_ids: list[str] = Field(..., min_length=1, max_length=100)
    topics: list[NameText] = Field([], max_length=50)
    follow_up: FollowUpInput | None = None


class ReminderBrief(BaseModel):
    id: str
    title: str
    due_date: date
    status: str


class InteractionOut(BaseModel):
    id: str
    occurred_on: date
    occurred_time: time | None
    kind: str
    title: str
    description: str | None
    location: str | None
    participants: list[ContactRef]
    topics: list[str]
    reminders: list[ReminderBrief]
    created_at: datetime
    updated_at: datetime


class ReminderInput(APIModel):
    contact_id: str | None = None
    interaction_id: str | None = None
    title: ShortText = Field(..., min_length=1)
    description: LongText | None = None
    due_date: date
    due_time: time | None = None
    timezone: str = Field(..., min_length=1, max_length=64)


class PostponeInput(APIModel):
    days: int | None = Field(None, ge=1, le=3650)
    months: int | None = Field(None, ge=1, le=120)
    due_date: date | None = None
    timezone: str = Field(..., min_length=1, max_length=64)


class ReminderOut(BaseModel):
    id: str
    contact: ContactRef | None
    interaction_id: str | None
    interaction_title: str | None
    title: str
    description: str | None
    due_date: date
    due_time: time | None
    timezone: str
    due_at: datetime
    status: str
    bucket: ReminderBucket
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ReminderGroups(BaseModel):
    overdue: list[ReminderOut]
    today: list[ReminderOut]
    week: list[ReminderOut]
    later: list[ReminderOut]
    done: list[ReminderOut]


class ScheduledNotification(BaseModel):
    id: str
    title: str
    contact_name: str | None
    due_at_ms: int


class NotificationPlan(BaseModel):
    overdue_count: int
    today_count: int
    upcoming: list[ScheduledNotification]
