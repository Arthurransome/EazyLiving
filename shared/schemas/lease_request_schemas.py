"""Pydantic schemas for lease requests."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, field_validator


class LeaseRequestCreate(BaseModel):
    unit_id: uuid.UUID
    desired_move_in: date
    desired_move_out: date
    message: str | None = None

    @field_validator("desired_move_out")
    @classmethod
    def move_out_after_move_in(cls, v: date, info) -> date:
        move_in = info.data.get("desired_move_in")
        if move_in and v <= move_in:
            raise ValueError("desired_move_out must be after desired_move_in")
        return v


class LeaseRequestResponse(BaseModel):
    request_id: uuid.UUID
    tenant_id: uuid.UUID
    unit_id: uuid.UUID
    message: str | None
    desired_move_in: date
    desired_move_out: date
    status: str
    reviewed_by: uuid.UUID | None
    reviewed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
