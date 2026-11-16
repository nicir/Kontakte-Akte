from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.deps import AppState, require_session
from app.schemas.activity import (
    InteractionInput,
    InteractionOut,
    NotificationPlan,
    PostponeInput,
    ReminderGroups,
    ReminderInput,
    ReminderOut,
)
from app.schemas.common import OkResponse
from app.services import interactions as interaction_service
from app.services import reminders as reminder_service

router = APIRouter(prefix="/api", tags=["activity"])

TZ = Query("UTC", min_length=1, max_length=64)


@router.get("/interactions", response_model=list[InteractionOut])
def list_interactions(
    contact_id: str | None = None, limit: int = Query(500, ge=1, le=5000), state: AppState = Depends(require_session)
) -> list[InteractionOut]:
    with state.db() as session:
        return interaction_service.list_interactions(session, contact_id, limit)


@router.post("/interactions", response_model=InteractionOut, status_code=201)
def create_interaction(data: InteractionInput, state: AppState = Depends(require_session)) -> InteractionOut:
    with state.db() as session:
        interaction = interaction_service.create_interaction(session, data)
        return interaction_service.get_out(session, interaction.id)


@router.put("/interactions/{interaction_id}", response_model=InteractionOut)
def update_interaction(
    interaction_id: str, data: InteractionInput, state: AppState = Depends(require_session)
) -> InteractionOut:
    with state.db() as session:
        interaction_service.update_interaction(session, interaction_id, data)
        return interaction_service.get_out(session, interaction_id)


@router.delete("/interactions/{interaction_id}", response_model=OkResponse)
def delete_interaction(interaction_id: str, state: AppState = Depends(require_session)) -> OkResponse:
    with state.db() as session:
        interaction_service.delete_interaction(session, interaction_id)
    return OkResponse()


@router.get("/reminders", response_model=ReminderGroups)
def reminders(
    tz: str = TZ, contact_id: str | None = None, state: AppState = Depends(require_session)
) -> ReminderGroups:
    with state.db() as session:
        return reminder_service.grouped(session, tz, contact_id)


@router.get("/reminders/notification-plan", response_model=NotificationPlan)
def notification_plan(tz: str = TZ, state: AppState = Depends(require_session)) -> NotificationPlan:
    with state.db() as session:
        return reminder_service.notification_plan(session, tz)


@router.post("/reminders", response_model=ReminderOut, status_code=201)
def create_reminder(data: ReminderInput, tz: str = TZ, state: AppState = Depends(require_session)) -> ReminderOut:
    with state.db() as session:
        reminder = reminder_service.create_reminder(session, data)
        return reminder_service.get_out(session, reminder.id, tz)


@router.put("/reminders/{reminder_id}", response_model=ReminderOut)
def update_reminder(
    reminder_id: str, data: ReminderInput, tz: str = TZ, state: AppState = Depends(require_session)
) -> ReminderOut:
    with state.db() as session:
        reminder_service.update_reminder(session, reminder_id, data)
        return reminder_service.get_out(session, reminder_id, tz)


@router.post("/reminders/{reminder_id}/complete", response_model=ReminderOut)
def complete(reminder_id: str, tz: str = TZ, state: AppState = Depends(require_session)) -> ReminderOut:
    with state.db() as session:
        reminder_service.complete_reminder(session, reminder_id)
        return reminder_service.get_out(session, reminder_id, tz)


@router.post("/reminders/{reminder_id}/reopen", response_model=ReminderOut)
def reopen(reminder_id: str, tz: str = TZ, state: AppState = Depends(require_session)) -> ReminderOut:
    with state.db() as session:
        reminder_service.reopen_reminder(session, reminder_id)
        return reminder_service.get_out(session, reminder_id, tz)


@router.post("/reminders/{reminder_id}/postpone", response_model=ReminderOut)
def postpone(reminder_id: str, data: PostponeInput, state: AppState = Depends(require_session)) -> ReminderOut:
    with state.db() as session:
        reminder_service.postpone_reminder(session, reminder_id, data)
        return reminder_service.get_out(session, reminder_id, data.timezone)


@router.delete("/reminders/{reminder_id}", response_model=OkResponse)
def delete_reminder(reminder_id: str, state: AppState = Depends(require_session)) -> OkResponse:
    with state.db() as session:
        reminder_service.delete_reminder(session, reminder_id)
    return OkResponse()
