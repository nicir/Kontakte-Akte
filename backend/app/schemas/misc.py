from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.activity import ReminderOut
from app.schemas.common import APIModel
from app.schemas.contacts import ContactSummary

MapDimension = Literal["residence", "nationality", "activity", "expertise", "interest"]
BackupLocation = Literal["backups", "import"]


class SettingsOut(BaseModel):
    auto_lock_minutes: int
    notifications_enabled: bool
    notification_show_details: bool
    inactivity_days: int


class SettingsUpdate(APIModel):
    auto_lock_minutes: int | None = Field(None, ge=0, le=480)
    notifications_enabled: bool | None = None
    notification_show_details: bool | None = None
    inactivity_days: int | None = Field(None, ge=7, le=3650)


class InactiveContact(BaseModel):
    contact: ContactSummary
    reference_date: date | None
    days: int | None


class DashboardOut(BaseModel):
    total_contacts: int
    countries_represented: int
    upcoming_reminders: int
    overdue_reminders: int
    inactivity_days: int
    recently_added: list[ContactSummary]
    recently_contacted: list[ContactSummary]
    upcoming_followups: list[ReminderOut]
    inactive_contacts: list[InactiveContact]
    inactive_total: int


class CountryCount(BaseModel):
    code: str
    numeric: str | None
    name: str
    count: int


class MapOut(BaseModel):
    dimension: MapDimension
    countries: list[CountryCount]
    max_count: int
    contacts_with_country: int


class NameCount(BaseModel):
    name: str
    count: int


class CountryDetail(BaseModel):
    code: str
    name: str
    dimension: MapDimension
    count: int
    contacts: list[ContactSummary]
    professions: list[NameCount]
    companies: list[NameCount]
    expertise: list[NameCount]


class CountryOut(BaseModel):
    code: str
    numeric: str | None
    name: str


class BackupFile(BaseModel):
    location: BackupLocation
    file_name: str
    kind: Literal["manual", "pre-migration", "pre-restore", "import", "other"]
    size_bytes: int
    modified_at: datetime


class BackupRef(APIModel):
    location: BackupLocation
    file_name: str = Field(..., max_length=200)
    password: str | None = Field(None, max_length=4096)


class BackupVerifyOut(BaseModel):
    ok: bool
    contacts: int
    interactions: int
    reminders: int
    schema_revision: str | None
    compatible: bool
    size_bytes: int


class RestoreOut(BaseModel):
    ok: bool
    safety_backup: str
    contacts: int


class ClassificationRename(APIModel):
    name: str = Field(..., min_length=1, max_length=200)


class ClassificationMerge(APIModel):
    target_id: int


class AliasInput(APIModel):
    alias: str = Field(..., min_length=1, max_length=200)


class CategoryInput(APIModel):
    name: str = Field(..., min_length=1, max_length=100)


class AuthStatus(BaseModel):
    initialized: bool
    unlocked: bool
    authenticated: bool


class PasswordInput(APIModel):
    # No composition rules and no truncation. Upper bound only guards against abuse.
    password: str = Field(..., min_length=1, max_length=4096)


class SetupInput(APIModel):
    password: str = Field(..., min_length=1, max_length=4096)
    password_confirm: str = Field(..., min_length=1, max_length=4096)


class ChangePasswordInput(APIModel):
    current_password: str = Field(..., min_length=1, max_length=4096)
    new_password: str = Field(..., min_length=1, max_length=4096)
    new_password_confirm: str = Field(..., min_length=1, max_length=4096)


class SessionOut(BaseModel):
    session_token: str
    migrated: bool = False
    pre_migration_backup: str | None = None
