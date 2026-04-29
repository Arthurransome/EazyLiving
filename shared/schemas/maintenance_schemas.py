"""Pydantic schemas for maintenance request resources."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator

from shared.db.enums import MaintenancePriority, MaintenanceStatus


class MaintenanceRequestCreate(BaseModel):
    unit_id: uuid.UUID
    title: str
    description: str | None = None
    priority: MaintenancePriority = MaintenancePriority.MEDIUM

    @field_validator("title")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("title must not be blank")
        return v.strip()


class AssignRequest(BaseModel):
    assigned_to: uuid.UUID


class MaintenanceRequestResponse(BaseModel):
    request_id: uuid.UUID
    unit_id: uuid.UUID
    tenant_id: uuid.UUID
    assigned_to: uuid.UUID | None
    title: str
    description: str | None
    priority: MaintenancePriority
    status: MaintenanceStatus
    escalated: bool
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}
