"""Pydantic schemas for payment requests and responses."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, field_validator

from shared.db.enums import PaymentStatus


class PaymentCreate(BaseModel):
    lease_id: uuid.UUID
    tenant_id: uuid.UUID
    amount: Decimal
    due_date: date
    notes: str | None = None

    @field_validator("amount")
    @classmethod
    def positive_amount(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("amount must be positive")
        return v


class ProcessPaymentRequest(BaseModel):
    method: str  # "credit_card" | "bank_transfer" | "balance" — informational
    simulate_failure: bool = False


class MarkOverdueRequest(BaseModel):
    late_fee: Decimal = Decimal("0.00")

    @field_validator("late_fee")
    @classmethod
    def non_negative(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("late_fee must be non-negative")
        return v


class PaymentResponse(BaseModel):
    payment_id: uuid.UUID
    lease_id: uuid.UUID
    tenant_id: uuid.UUID
    amount: Decimal
    due_date: date
    payment_date: datetime | None
    status: PaymentStatus
    late_fee: Decimal
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
