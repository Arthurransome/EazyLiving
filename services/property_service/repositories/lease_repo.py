"""LeaseRepository — data access layer for the leases table."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db.enums import LeaseStatus
from shared.db.models import Lease, Property, Unit
from shared.repositories.base import AbstractRepository


class LeaseRepository(AbstractRepository[Lease]):
    """Repository for :class:`~shared.db.models.Lease` entities."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Lease)

    async def list_by_tenant(
        self, tenant_id: uuid.UUID, *, skip: int = 0, limit: int = 100
    ) -> list[Lease]:
        """Return all leases for a given tenant, paginated."""
        result = await self._session.execute(
            select(Lease)
            .where(Lease.tenant_id == tenant_id)
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_by_unit(
        self, unit_id: uuid.UUID, *, skip: int = 0, limit: int = 100
    ) -> list[Lease]:
        """Return all leases for a given unit, paginated."""
        result = await self._session.execute(
            select(Lease)
            .where(Lease.unit_id == unit_id)
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_by_manager(
        self, manager_id: uuid.UUID, *, skip: int = 0, limit: int = 100
    ) -> list[Lease]:
        """Return leases for units in properties managed by *manager_id*."""
        result = await self._session.execute(
            select(Lease)
            .join(Unit, Lease.unit_id == Unit.unit_id)
            .join(Property, Unit.property_id == Property.property_id)
            .where(Property.manager_id == manager_id)
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_active_lease(self, unit_id: uuid.UUID) -> Lease | None:
        """Return the currently active lease for *unit_id*, or ``None``."""
        result = await self._session.execute(
            select(Lease).where(
                Lease.unit_id == unit_id,
                Lease.status == LeaseStatus.ACTIVE,
            )
        )
        return result.scalars().first()
