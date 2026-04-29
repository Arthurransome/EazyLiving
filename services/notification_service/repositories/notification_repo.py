"""NotificationRepository — data access layer."""

from __future__ import annotations

import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db.models import Notification
from shared.repositories.base import AbstractRepository


class NotificationRepository(AbstractRepository[Notification]):
    """Repository for :class:`~shared.db.models.Notification` entities."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Notification)

    async def list_by_user(
        self, user_id: uuid.UUID, *, skip: int = 0, limit: int = 100
    ) -> list[Notification]:
        """Return all notifications for a user, newest first."""
        result = await self._session.execute(
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_unread_by_user(self, user_id: uuid.UUID) -> list[Notification]:
        """Return all unread notifications for a user."""
        result = await self._session.execute(
            select(Notification)
            .where(Notification.user_id == user_id, Notification.is_read.is_(False))
            .order_by(Notification.created_at.desc())
        )
        return list(result.scalars().all())

    async def mark_all_read(self, user_id: uuid.UUID) -> None:
        """Bulk-update all unread notifications for a user to is_read=True."""
        await self._session.execute(
            update(Notification)
            .where(Notification.user_id == user_id, Notification.is_read.is_(False))
            .values(is_read=True)
        )
        await self._session.flush()
