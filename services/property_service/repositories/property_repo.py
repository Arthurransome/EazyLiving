"""PropertyRepository and UnitRepository — data access layer."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from shared.db.enums import LeaseStatus
from shared.db.models import Lease, Property, Unit
from shared.repositories.base import AbstractRepository


class PropertyRepository(AbstractRepository[Property]):
    """Repository for :class:`~shared.db.models.Property` entities."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Property)

    async def list_by_owner(
        self, owner_id: uuid.UUID, *, skip: int = 0, limit: int = 100
    ) -> list[Property]:
        """Return all properties owned by *owner_id*, paginated."""
        result = await self._session.execute(
            select(Property)
            .where(Property.owner_id == owner_id)
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_by_tenant(self, tenant_id: uuid.UUID) -> list[Property]:
        """Return distinct properties where *tenant_id* holds an active lease."""
        result = await self._session.execute(
            select(Property)
            .join(Unit, Unit.property_id == Property.property_id)
            .join(Lease, Lease.unit_id == Unit.unit_id)
            .where(Lease.tenant_id == tenant_id, Lease.status == LeaseStatus.ACTIVE)
            .distinct()
        )
        return list(result.scalars().all())

    async def list_leases_by_property(self, property_id: uuid.UUID) -> list[Lease]:
        """Return all leases for every unit in *property_id* (single JOIN query)."""
        result = await self._session.execute(
            select(Lease)
            .join(Unit, Lease.unit_id == Unit.unit_id)
            .where(Unit.property_id == property_id)
            .order_by(Lease.created_at.desc())
        )
        return list(result.scalars().all())


class UnitRepository(AbstractRepository[Unit]):
    """Repository for :class:`~shared.db.models.Unit` entities."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Unit)

    async def list_by_property(
        self, property_id: uuid.UUID, *, skip: int = 0, limit: int = 100
    ) -> list[Unit]:
        """Return all units belonging to *property_id*, with leases pre-loaded."""
        result = await self._session.execute(
            select(Unit)
            .where(Unit.property_id == property_id)
            .options(selectinload(Unit.leases))
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_available_units(self, property_id: uuid.UUID) -> list[Unit]:
        """Return unoccupied units in *property_id*."""
        result = await self._session.execute(
            select(Unit).where(
                Unit.property_id == property_id,
                Unit.is_occupied == False,  # noqa: E712 (SQLAlchemy needs ==)
            )
        )
        return list(result.scalars().all())
