"""MaintenanceRequestRepository — data access layer."""

from __future__ import annotations

import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db.enums import MaintenanceStatus
from shared.db.models import MaintenanceRequest, Property, Unit
from shared.repositories.base import AbstractRepository


class MaintenanceRequestRepository(AbstractRepository[MaintenanceRequest]):
    """Repository for :class:`~shared.db.models.MaintenanceRequest` entities."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, MaintenanceRequest)

    async def list_by_tenant(
        self, tenant_id: uuid.UUID, *, skip: int = 0, limit: int = 100
    ) -> list[MaintenanceRequest]:
        result = await self._session.execute(
            select(MaintenanceRequest)
            .where(MaintenanceRequest.tenant_id == tenant_id)
            .order_by(MaintenanceRequest.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_by_unit(
        self, unit_id: uuid.UUID, *, skip: int = 0, limit: int = 100
    ) -> list[MaintenanceRequest]:
        result = await self._session.execute(
            select(MaintenanceRequest)
            .where(MaintenanceRequest.unit_id == unit_id)
            .order_by(MaintenanceRequest.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_by_assigned_to(
        self, user_id: uuid.UUID, *, skip: int = 0, limit: int = 100
    ) -> list[MaintenanceRequest]:
        result = await self._session.execute(
            select(MaintenanceRequest)
            .where(MaintenanceRequest.assigned_to == user_id)
            .order_by(MaintenanceRequest.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_by_manager(
        self, manager_id: uuid.UUID, *, skip: int = 0, limit: int = 100
    ) -> list[MaintenanceRequest]:
        """Return maintenance requests for units in properties managed by *manager_id*."""
        result = await self._session.execute(
            select(MaintenanceRequest)
            .join(Unit, MaintenanceRequest.unit_id == Unit.unit_id)
            .join(Property, Unit.property_id == Property.property_id)
            .where(Property.manager_id == manager_id)
            .order_by(MaintenanceRequest.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_by_status(
        self, status: MaintenanceStatus, *, skip: int = 0, limit: int = 100
    ) -> list[MaintenanceRequest]:
        result = await self._session.execute(
            select(MaintenanceRequest)
            .where(MaintenanceRequest.status == status)
            .order_by(MaintenanceRequest.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())
