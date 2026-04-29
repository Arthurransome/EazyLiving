"""Pydantic schemas for the analytics service."""

from __future__ import annotations

import uuid
from decimal import Decimal

from pydantic import BaseModel


class OccupancyStats(BaseModel):
    property_id: uuid.UUID
    property_name: str
    total_units: int
    occupied_units: int
    vacant_units: int
    occupancy_rate: float  # occupied / total, or 0.0 if no units

    model_config = {"from_attributes": True}


class RevenueStats(BaseModel):
    total_billed: Decimal
    total_collected: Decimal
    total_overdue: Decimal
    total_late_fees: Decimal
    count_pending: int
    count_paid: int
    count_overdue: int
    count_partial: int


class LeaseStats(BaseModel):
    total: int
    active: int
    draft: int
    expiring_soon: int  # ACTIVE leases ending within 30 days
    terminated: int
    expired: int


class MaintenanceStats(BaseModel):
    total: int
    open: int  # SUBMITTED + ASSIGNED + IN_PROGRESS
    completed: int
    closed: int
    cancelled: int
    escalated: int
    by_status: dict[str, int]
    by_priority: dict[str, int]


class DashboardOverview(BaseModel):
    total_properties: int
    total_units: int
    overall_occupancy_rate: float
    occupancy_by_property: list[OccupancyStats]
    revenue: RevenueStats
    leases: LeaseStats
    maintenance: MaintenanceStats
