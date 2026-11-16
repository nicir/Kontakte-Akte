from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from app.api.deps import AppState, require_session
from app.schemas.common import OkResponse
from app.schemas.contacts import ClassificationKind
from app.schemas.misc import AliasInput, CategoryInput, ClassificationMerge, ClassificationRename
from app.services import classifications as service

router = APIRouter(prefix="/api", tags=["classifications"])


@router.get("/classifications/suggest")
def suggest(
    kind: ClassificationKind,
    q: str = Query("", max_length=200),
    limit: int = Query(15, ge=1, le=100),
    state: AppState = Depends(require_session),
) -> list[dict[str, Any]]:
    with state.db() as session:
        return service.suggest(session, kind, q, limit)


@router.get("/classifications")
def manage_list(kind: ClassificationKind, state: AppState = Depends(require_session)) -> list[dict[str, Any]]:
    with state.db() as session:
        return service.manage_list(session, kind)


@router.patch("/classifications/{classification_id}", response_model=OkResponse)
def rename(
    classification_id: int, data: ClassificationRename, state: AppState = Depends(require_session)
) -> OkResponse:
    with state.db() as session:
        service.rename(session, classification_id, data.name)
    return OkResponse()


@router.post("/classifications/{classification_id}/merge", response_model=OkResponse)
def merge(classification_id: int, data: ClassificationMerge, state: AppState = Depends(require_session)) -> OkResponse:
    with state.db() as session:
        service.merge(session, classification_id, data.target_id)
    return OkResponse()


@router.post("/classifications/{classification_id}/aliases", response_model=OkResponse)
def add_alias(classification_id: int, data: AliasInput, state: AppState = Depends(require_session)) -> OkResponse:
    with state.db() as session:
        service.add_alias(session, classification_id, data.alias)
    return OkResponse()


@router.delete("/classification-aliases/{alias_id}", response_model=OkResponse)
def remove_alias(alias_id: int, state: AppState = Depends(require_session)) -> OkResponse:
    with state.db() as session:
        service.remove_alias(session, alias_id)
    return OkResponse()


@router.delete("/classifications/{classification_id}", response_model=OkResponse)
def delete(classification_id: int, state: AppState = Depends(require_session)) -> OkResponse:
    with state.db() as session:
        service.delete_classification(session, classification_id)
    return OkResponse()


@router.get("/organizations/suggest")
def organizations(
    q: str = Query("", max_length=200),
    limit: int = Query(15, ge=1, le=100),
    state: AppState = Depends(require_session),
) -> list[dict[str, Any]]:
    with state.db() as session:
        return service.suggest_organizations(session, q, limit)


@router.get("/relationship-categories")
def categories(state: AppState = Depends(require_session)) -> list[dict[str, Any]]:
    with state.db() as session:
        return service.list_categories(session)


@router.post("/relationship-categories", status_code=201)
def create_category(data: CategoryInput, state: AppState = Depends(require_session)) -> dict[str, Any]:
    with state.db() as session:
        category = service.create_category(session, data.name)
        return {"id": category.id, "name": category.name, "contact_count": 0}


@router.patch("/relationship-categories/{category_id}", response_model=OkResponse)
def rename_category(category_id: int, data: CategoryInput, state: AppState = Depends(require_session)) -> OkResponse:
    with state.db() as session:
        service.rename_category(session, category_id, data.name)
    return OkResponse()


@router.delete("/relationship-categories/{category_id}", response_model=OkResponse)
def delete_category(category_id: int, state: AppState = Depends(require_session)) -> OkResponse:
    with state.db() as session:
        service.delete_category(session, category_id)
    return OkResponse()
