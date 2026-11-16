from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Setting
from app.schemas.misc import SettingsOut, SettingsUpdate

DEFAULTS: dict[str, Any] = {
    "auto_lock_minutes": 15,
    "notifications_enabled": True,
    "notification_show_details": True,
    "inactivity_days": 90,
}


def get_settings(session: Session) -> SettingsOut:
    values = dict(DEFAULTS)
    for row in session.scalars(select(Setting).where(Setting.key.in_(DEFAULTS.keys()))):
        try:
            values[row.key] = json.loads(row.value)
        except json.JSONDecodeError:
            continue
    return SettingsOut(**values)


def update_settings(session: Session, data: SettingsUpdate) -> SettingsOut:
    for key, value in data.model_dump(exclude_none=True).items():
        row = session.get(Setting, key)
        if row is None:
            session.add(Setting(key=key, value=json.dumps(value)))
        else:
            row.value = json.dumps(value)
    session.flush()
    return get_settings(session)
