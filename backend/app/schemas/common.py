from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

ShortText = Annotated[str, StringConstraints(max_length=300)]
NameText = Annotated[str, StringConstraints(max_length=200)]
LongText = Annotated[str, StringConstraints(max_length=50_000)]
CountryCode = Annotated[str, StringConstraints(pattern=r"^[A-Z]{2}$")]


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")


class ContactRef(BaseModel):
    id: str
    display_name: str
    initials: str
    has_photo: bool = False


class CountryRef(BaseModel):
    code: str
    name: str


class NamedRef(BaseModel):
    id: int
    name: str


class OkResponse(BaseModel):
    ok: bool = True


class Page(BaseModel):
    limit: int = Field(200, ge=1, le=2000)
    offset: int = Field(0, ge=0)
