from __future__ import annotations

import base64

from fastapi import APIRouter, Depends

from app.api.deps import AppState, require_session
from app.schemas.common import OkResponse
from app.schemas.contacts import (
    ContactDetail,
    ContactInput,
    ContactQuery,
    ContactSearchResult,
    LinkInput,
    LinkUpdate,
    NotesInput,
    PhotoInput,
    PhotoOut,
)
from app.services import contacts as service
from app.services.search import search_contacts

router = APIRouter(prefix="/api", tags=["contacts"])


@router.post("/contacts/search", response_model=ContactSearchResult)
def search(query: ContactQuery, state: AppState = Depends(require_session)) -> ContactSearchResult:
    with state.db() as session:
        return search_contacts(session, query)


@router.post("/contacts", response_model=ContactDetail, status_code=201)
def create(data: ContactInput, state: AppState = Depends(require_session)) -> ContactDetail:
    with state.db() as session:
        contact = service.create_contact(session, data)
        return service.contact_detail(session, contact.id)


@router.get("/contacts/{contact_id}", response_model=ContactDetail)
def detail(contact_id: str, state: AppState = Depends(require_session)) -> ContactDetail:
    with state.db() as session:
        return service.contact_detail(session, contact_id)


@router.put("/contacts/{contact_id}", response_model=ContactDetail)
def update(contact_id: str, data: ContactInput, state: AppState = Depends(require_session)) -> ContactDetail:
    with state.db() as session:
        service.update_contact(session, contact_id, data)
        return service.contact_detail(session, contact_id)


@router.put("/contacts/{contact_id}/notes", response_model=ContactDetail)
def update_notes(contact_id: str, data: NotesInput, state: AppState = Depends(require_session)) -> ContactDetail:
    with state.db() as session:
        service.update_notes(session, contact_id, data.personal_notes)
        return service.contact_detail(session, contact_id)


@router.delete("/contacts/{contact_id}", response_model=OkResponse)
def delete(contact_id: str, state: AppState = Depends(require_session)) -> OkResponse:
    with state.db() as session:
        service.delete_contact(session, contact_id)
    return OkResponse()


@router.get("/contacts/{contact_id}/photo", response_model=PhotoOut)
def get_photo(contact_id: str, state: AppState = Depends(require_session)) -> PhotoOut:
    with state.db() as session:
        photo = service.get_photo(session, contact_id)
        return PhotoOut(mime_type=photo.mime_type, image_base64=base64.b64encode(photo.image).decode())


@router.put("/contacts/{contact_id}/photo", response_model=OkResponse)
def put_photo(contact_id: str, data: PhotoInput, state: AppState = Depends(require_session)) -> OkResponse:
    with state.db() as session:
        service.set_photo(session, contact_id, data)
    return OkResponse()


@router.delete("/contacts/{contact_id}/photo", response_model=OkResponse)
def delete_photo(contact_id: str, state: AppState = Depends(require_session)) -> OkResponse:
    with state.db() as session:
        service.delete_photo(session, contact_id)
    return OkResponse()


@router.post("/contacts/{contact_id}/links", response_model=ContactDetail, status_code=201)
def create_link(contact_id: str, data: LinkInput, state: AppState = Depends(require_session)) -> ContactDetail:
    with state.db() as session:
        service.create_link(session, contact_id, data)
        return service.contact_detail(session, contact_id)


@router.put("/links/{link_id}", response_model=OkResponse)
def update_link(link_id: str, data: LinkUpdate, state: AppState = Depends(require_session)) -> OkResponse:
    with state.db() as session:
        service.update_link(session, link_id, data)
    return OkResponse()


@router.delete("/links/{link_id}", response_model=OkResponse)
def delete_link(link_id: str, state: AppState = Depends(require_session)) -> OkResponse:
    with state.db() as session:
        service.delete_link(session, link_id)
    return OkResponse()


@router.get("/link-types", response_model=list[str])
def link_types(state: AppState = Depends(require_session)) -> list[str]:
    with state.db() as session:
        return service.link_relation_suggestions(session)
