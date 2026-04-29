"""Analytics API routes — read-only, ADMIN and MANAGER only."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from gateway.auth import require_role
from services.analytics_service.services.analytics_service import AnalyticsService
from shared.db.database import get_db
from shared.db.enums import UserRole
from shared.db.models import User
from shared.schemas.analytics_schemas import (
    DashboardOverview,
    LeaseStats,
    MaintenanceStats,
    OccupancyStats,
    RevenueStats,
)

router = APIRouter()

_staff = Depends(require_role(UserRole.ADMIN, UserRole.MANAGER, UserRole.OWNER))


def _svc(db: Annotated[AsyncSession, Depends(get_db)]) -> AnalyticsService:
    return AnalyticsService(db)


@router.get(
    "/analytics/overview",
    response_model=DashboardOverview,
    summary="Full dashboard overview (admin/manager)",
)
async def get_overview(
    svc: Annotated[AnalyticsService, Depends(_svc)],
    _: Annotated[User, _staff],
) -> DashboardOverview:
    return await svc.overview()


@router.get(
    "/analytics/occupancy",
    response_model=list[OccupancyStats],
    summary="Per-property occupancy stats (admin/manager)",
)
async def get_occupancy(
    svc: Annotated[AnalyticsService, Depends(_svc)],
    _: Annotated[User, _staff],
) -> list[OccupancyStats]:
    return await svc.occupancy()


@router.get(
    "/analytics/revenue",
    response_model=RevenueStats,
    summary="Portfolio-wide revenue stats (admin/manager)",
)
async def get_revenue(
    svc: Annotated[AnalyticsService, Depends(_svc)],
    _: Annotated[User, _staff],
) -> RevenueStats:
    return await svc.revenue()


@router.get(
    "/analytics/leases",
    response_model=LeaseStats,
    summary="Lease pipeline stats (admin/manager)",
)
async def get_leases(
    svc: Annotated[AnalyticsService, Depends(_svc)],
    _: Annotated[User, _staff],
) -> LeaseStats:
    return await svc.leases()


@router.get(
    "/analytics/maintenance",
    response_model=MaintenanceStats,
    summary="Maintenance workload stats (admin/manager)",
)
async def get_maintenance(
    svc: Annotated[AnalyticsService, Depends(_svc)],
    _: Annotated[User, _staff],
) -> MaintenanceStats:
    return await svc.maintenance()
