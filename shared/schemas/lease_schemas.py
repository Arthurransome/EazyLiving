"""Pydantic schemas for lease requests and responses."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, field_validator

from shared.db.enums import LeaseStatus


# ---------------------------------------------------------------------------
# Request
# ---------------------------------------------------------------------------

class LeaseCreate(BaseModel):
    unit_id: uuid.UUID
    tenant_id: uuid.UUID
    start_date: date
    end_date: date
    monthly_rent: Decimal
    security_deposit: Decimal | None = None

    @field_validator("end_date")
    @classmethod
    def end_after_start(cls, v: date, info) -> date:
        start = info.data.get("start_date")
        if start and v <= start:
            raise ValueError("end_date must be after start_date")
        return v

    @field_validator("monthly_rent")
    @classmethod
    def positive_rent(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("monthly_rent must be positive")
        return v


# ---------------------------------------------------------------------------
# Response
# ---------------------------------------------------------------------------

class LeaseResponse(BaseModel):
    lease_id: uuid.UUID
    unit_id: uuid.UUID
    tenant_id: uuid.UUID
    start_date: date
    end_date: date
    monthly_rent: Decimal
    security_deposit: Decimal | None
    status: LeaseStatus
    document_ref: str | None
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}
