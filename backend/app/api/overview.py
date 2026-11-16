from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.api.deps import AppState, require_session
from app.schemas.common import OkResponse
from app.schemas.misc import (
    BackupFile,
    BackupRef,
    BackupVerifyOut,
    CountryDetail,
    CountryOut,
    DashboardOut,
    MapDimension,
    MapOut,
    RestoreOut,
    SettingsOut,
    SettingsUpdate,
)
from app.services import backup as backup_service
from app.services import geo
from app.services.dashboard import dashboard
from app.services.settings import get_settings, update_settings

router = APIRouter(prefix="/api", tags=["overview"])


@router.get("/dashboard", response_model=DashboardOut)
def get_dashboard(tz: str = Query("UTC", max_length=64), state: AppState = Depends(require_session)) -> DashboardOut:
    with state.db() as session:
        return dashboard(session, tz)


@router.get("/countries", response_model=list[CountryOut])
def countries(state: AppState = Depends(require_session)) -> list[CountryOut]:
    with state.db() as session:
        return geo.list_countries(session)


@router.get("/map", response_model=MapOut)
def world_map(dimension: MapDimension = "residence", state: AppState = Depends(require_session)) -> MapOut:
    with state.db() as session:
        return geo.country_counts(session, dimension)


@router.get("/map/{code}", response_model=CountryDetail)
def map_country(
    code: str, dimension: MapDimension = "residence", state: AppState = Depends(require_session)
) -> CountryDetail:
    with state.db() as session:
        return geo.country_detail(session, dimension, code)


@router.get("/settings", response_model=SettingsOut)
def read_settings(state: AppState = Depends(require_session)) -> SettingsOut:
    with state.db() as session:
        return get_settings(session)


@router.put("/settings", response_model=SettingsOut)
def write_settings(data: SettingsUpdate, state: AppState = Depends(require_session)) -> SettingsOut:
    with state.db() as session:
        result = update_settings(session, data)
    state.auto_lock_minutes = result.auto_lock_minutes
    return result


@router.get("/backups", response_model=list[BackupFile])
def list_backups(state: AppState = Depends(require_session)) -> list[BackupFile]:
    return backup_service.list_backups(state.manager)


@router.post("/backups", response_model=BackupFile, status_code=201)
def create_backup(state: AppState = Depends(require_session)) -> BackupFile:
    return backup_service.create_backup(state.manager)


@router.post("/backups/verify", response_model=BackupVerifyOut)
def verify_backup(data: BackupRef, state: AppState = Depends(require_session)) -> BackupVerifyOut:
    return backup_service.verify_backup(state.manager, data.location, data.file_name, data.password)


@router.post("/backups/restore", response_model=RestoreOut)
def restore_backup(data: BackupRef, state: AppState = Depends(require_session)) -> RestoreOut:
    with state.lock:
        return backup_service.restore_backup(state.manager, data.location, data.file_name, data.password)


@router.delete("/backups/{location}/{file_name}", response_model=OkResponse)
def delete_backup(
    location: Literal["backups", "import"], file_name: str, state: AppState = Depends(require_session)
) -> OkResponse:
    backup_service.delete_backup(state.manager, location, file_name)
    return OkResponse()
