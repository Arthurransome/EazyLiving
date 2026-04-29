"""Pydantic schemas for property and unit requests and responses."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, field_validator


# ---------------------------------------------------------------------------
# Property
# ---------------------------------------------------------------------------

class PropertyCreate(BaseModel):
    name: str
    address: str
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    units: list["UnitCreate"] = []

    @field_validator("name", "address")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("must not be blank")
        return v.strip()


class PropertyUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None


class AssignManagerRequest(BaseModel):
    manager_id: uuid.UUID | None


class PropertyResponse(BaseModel):
    property_id: uuid.UUID
    owner_id: uuid.UUID
    manager_id: uuid.UUID | None = None
    name: str
    address: str
    city: str | None
    state: str | None
    zip_code: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PropertyWithUnitsResponse(PropertyResponse):
    units: list["UnitResponse"] = []


# ---------------------------------------------------------------------------
# Unit
# ---------------------------------------------------------------------------

class UnitCreate(BaseModel):
    unit_number: str
    monthly_rent: Decimal
    bedrooms: int | None = None
    bathrooms: int | None = None
    square_feet: int | None = None

    @field_validator("unit_number")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("unit_number must not be blank")
        return v.strip()

    @field_validator("monthly_rent")
    @classmethod
    def positive_rent(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("monthly_rent must be positive")
        return v


class UnitUpdate(BaseModel):
    unit_number: str | None = None
    monthly_rent: Decimal | None = None
    bedrooms: int | None = None
    bathrooms: int | None = None
    square_feet: int | None = None
    is_available: bool | None = None


class UnitResponse(BaseModel):
    unit_id: uuid.UUID
    property_id: uuid.UUID
    unit_number: str
    bedrooms: int | None
    bathrooms: int | None
    square_feet: int | None
    monthly_rent: Decimal
    is_occupied: bool
    is_available: bool = True
    active_lease_id: uuid.UUID | None = None

    model_config = {"from_attributes": True}
