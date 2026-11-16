from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import (
    APIModel,
    ContactRef,
    CountryCode,
    CountryRef,
    LongText,
    NamedRef,
    NameText,
    ShortText,
)
from app.services.text import clean

ChannelKind = Literal["email", "phone", "whatsapp", "linkedin", "website", "other"]
CountryKind = Literal["nationality", "residence", "activity", "expertise", "interest"]
ClassificationKind = Literal[
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
]


class ChannelInput(APIModel):
    kind: ChannelKind
    label: str | None = Field(None, max_length=60)
    value: str = Field(..., min_length=1, max_length=500)


class CountriesInput(APIModel):
    nationality: list[CountryCode] = []
    residence: list[CountryCode] = Field([], max_length=3)
    activity: list[CountryCode] = []
    expertise: list[CountryCode] = []
    interest: list[CountryCode] = []


class ClassificationsInput(APIModel):
    profession: list[NameText] = []
    specialization: list[NameText] = []
    industry: list[NameText] = []
    expertise: list[NameText] = []
    responsibility: list[NameText] = []
    topic: list[NameText] = []
    interest: list[NameText] = []
    shared_interest: list[NameText] = []
    collaboration: list[NameText] = []
    project: list[NameText] = []
    tag: list[NameText] = []
    language: list[NameText] = []


class ContactInput(APIModel):
    first_name: NameText = ""
    last_name: NameText = ""
    display_name: ShortText = ""
    city: NameText | None = None
    job_title: NameText | None = None
    personal_notes: LongText | None = None

    how_known: LongText | None = None
    first_met_place: ShortText | None = None
    first_met_date: date | None = None
    introduced_by_id: str | None = None
    introduced_by_text: ShortText | None = None
    relationship_category_id: int | None = None
    relationship_strength: int | None = Field(None, ge=1, le=5)
    relationship_notes: LongText | None = None
    next_planned_interaction: date | None = None

    current_organization: NameText | None = None
    previous_organizations: list[NameText] = []
    countries: CountriesInput = CountriesInput()
    classifications: ClassificationsInput = ClassificationsInput()
    channels: list[ChannelInput] = Field([], max_length=50)

    @model_validator(mode="after")
    def _require_name(self) -> ContactInput:
        if not (clean(self.first_name) or clean(self.last_name) or clean(self.display_name)):
            raise ValueError("Bitte gib mindestens einen Namen ein.")
        return self


class NotesInput(APIModel):
    personal_notes: LongText | None = None


class PhotoInput(APIModel):
    mime_type: Literal["image/jpeg", "image/png", "image/webp"]
    image_base64: str = Field(..., max_length=8_000_000)
    thumbnail_base64: str = Field(..., max_length=1_000_000)


class PhotoOut(BaseModel):
    mime_type: str
    image_base64: str


class ChannelOut(BaseModel):
    id: int
    kind: str
    label: str | None
    value: str


class LinkOut(BaseModel):
    id: str
    direction: Literal["outgoing", "incoming"]
    other: ContactRef
    relation_type: str
    description: str | None
    created_at: datetime


class ContactDetail(BaseModel):
    id: str
    first_name: str
    last_name: str
    display_name: str
    initials: str
    city: str | None
    job_title: str | None
    personal_notes: str | None
    how_known: str | None
    first_met_place: str | None
    first_met_date: date | None
    introduced_by: ContactRef | None
    introduced_by_text: str | None
    relationship_category: NamedRef | None
    relationship_strength: int | None
    relationship_notes: str | None
    next_planned_interaction: date | None
    current_organization: str | None
    previous_organizations: list[str]
    countries: dict[str, list[CountryRef]]
    classifications: dict[str, list[str]]
    channels: list[ChannelOut]
    has_photo: bool
    photo_version: str | None
    last_interaction_date: date | None
    links: list[LinkOut]
    created_at: datetime
    updated_at: datetime


class ContactSummary(BaseModel):
    id: str
    display_name: str
    initials: str
    thumbnail: str | None
    professions: list[str]
    job_title: str | None
    company: str | None
    city: str | None
    residence: CountryRef | None
    tags: list[str]
    last_interaction_date: date | None
    created_at: datetime
    updated_at: datetime


FilterField = Literal[
    "nationality",
    "residence",
    "activity",
    "expertise_country",
    "interest_country",
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
    "organization",
    "relationship_category",
]


class FilterCondition(APIModel):
    field: FilterField
    values: list[str] = Field(..., min_length=1, max_length=50)
    match: Literal["any", "all"] = "any"

    @field_validator("values")
    @classmethod
    def _strip(cls, values: list[str]) -> list[str]:
        cleaned = [clean(v) for v in values]
        result = [v for v in cleaned if v]
        if not result:
            raise ValueError("Filterwert fehlt.")
        return result


class ContactQuery(APIModel):
    text: str = Field("", max_length=300)
    filters: list[FilterCondition] = Field([], max_length=30)
    first_met_from: date | None = None
    first_met_to: date | None = None
    last_interaction_from: date | None = None
    last_interaction_to: date | None = None
    has_open_reminder: bool | None = None
    sort: Literal["name", "created", "updated", "last_interaction"] = "name"
    limit: int = Field(500, ge=1, le=5000)
    offset: int = Field(0, ge=0)


class ContactSearchResult(BaseModel):
    total: int
    items: list[ContactSummary]


class LinkInput(APIModel):
    target_contact_id: str
    relation_type: ShortText = Field(..., min_length=1)
    description: LongText | None = None


class LinkUpdate(APIModel):
    relation_type: ShortText = Field(..., min_length=1)
    description: LongText | None = None
