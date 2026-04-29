"""PaymentRepository — data access layer for the payments table."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db.enums import PaymentStatus
from shared.db.models import Payment
from shared.repositories.base import AbstractRepository


class PaymentRepository(AbstractRepository[Payment]):
    """Repository for :class:`~shared.db.models.Payment` entities."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Payment)

    async def list_by_lease(
        self, lease_id: uuid.UUID, *, skip: int = 0, limit: int = 100
    ) -> list[Payment]:
        """Return all payments for a given lease, paginated."""
        result = await self._session.execute(
            select(Payment)
            .where(Payment.lease_id == lease_id)
            .order_by(Payment.due_date)
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_by_tenant(
        self, tenant_id: uuid.UUID, *, skip: int = 0, limit: int = 100
    ) -> list[Payment]:
        """Return all payments for a given tenant, paginated."""
        result = await self._session.execute(
            select(Payment)
            .where(Payment.tenant_id == tenant_id)
            .order_by(Payment.due_date)
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_by_status(
        self, status: PaymentStatus, *, skip: int = 0, limit: int = 100
    ) -> list[Payment]:
        """Return all payments with a given status, paginated."""
        result = await self._session.execute(
            select(Payment)
            .where(Payment.status == status)
            .order_by(Payment.due_date)
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())
