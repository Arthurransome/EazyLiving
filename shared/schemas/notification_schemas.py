"""Pydantic schemas for notification resources."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class NotificationResponse(BaseModel):
    notification_id: uuid.UUID
    user_id: uuid.UUID
    event_type: str
    message: str
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}
