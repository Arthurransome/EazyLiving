"""LeaseRequestRepository — data access layer."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db.enums import LeaseRequestStatus
from shared.db.models import LeaseRequest, Property, Unit
from shared.repositories.base import AbstractRepository


class LeaseRequestRepository(AbstractRepository[LeaseRequest]):

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, LeaseRequest)

    async def list_by_tenant(
        self, tenant_id: uuid.UUID, *, skip: int = 0, limit: int = 100
    ) -> list[LeaseRequest]:
        result = await self._session.execute(
            select(LeaseRequest)
            .where(LeaseRequest.tenant_id == tenant_id)
            .order_by(LeaseRequest.created_at.desc())
            .offset(skip).limit(limit)
        )
        return list(result.scalars().all())

    async def list_pending_for_manager(
        self, manager_id: uuid.UUID, *, skip: int = 0, limit: int = 100
    ) -> list[LeaseRequest]:
        """Return PENDING requests for units in properties managed by *manager_id*."""
        result = await self._session.execute(
            select(LeaseRequest)
            .join(Unit, LeaseRequest.unit_id == Unit.unit_id)
            .join(Property, Unit.property_id == Property.property_id)
            .where(
                Property.manager_id == manager_id,
                LeaseRequest.status == LeaseRequestStatus.PENDING,
            )
            .order_by(LeaseRequest.created_at.asc())
            .offset(skip).limit(limit)
        )
        return list(result.scalars().all())

    async def list_all_for_manager(
        self, manager_id: uuid.UUID, *, skip: int = 0, limit: int = 100
    ) -> list[LeaseRequest]:
        """Return all requests (any status) for units in properties managed by *manager_id*."""
        result = await self._session.execute(
            select(LeaseRequest)
            .join(Unit, LeaseRequest.unit_id == Unit.unit_id)
            .join(Property, Unit.property_id == Property.property_id)
            .where(Property.manager_id == manager_id)
            .order_by(LeaseRequest.created_at.desc())
            .offset(skip).limit(limit)
        )
        return list(result.scalars().all())

    async def get_pending_for_unit(self, unit_id: uuid.UUID) -> list[LeaseRequest]:
        """Return all PENDING requests for a given unit."""
        result = await self._session.execute(
            select(LeaseRequest)
            .where(
                LeaseRequest.unit_id == unit_id,
                LeaseRequest.status == LeaseRequestStatus.PENDING,
            )
        )
        return list(result.scalars().all())

    async def has_pending(self, tenant_id: uuid.UUID, unit_id: uuid.UUID) -> bool:
        """True if the tenant already has a PENDING request for this unit."""
        result = await self._session.execute(
            select(LeaseRequest).where(
                LeaseRequest.tenant_id == tenant_id,
                LeaseRequest.unit_id == unit_id,
                LeaseRequest.status == LeaseRequestStatus.PENDING,
            )
        )
        return result.scalars().first() is not None
