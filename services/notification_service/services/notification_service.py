"""NotificationService — business logic for user notifications."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from services.notification_service.repositories.notification_repo import (
    NotificationRepository,
)
from shared.db.models import User
from shared.schemas.notification_schemas import NotificationResponse


class NotificationService:
    """Read and mark-read operations for a user's own notifications.

    Notifications are never created through the API — they are generated
    automatically by event handlers subscribed to the domain event bus.
    """

    def __init__(self, db: AsyncSession) -> None:
        self._repo = NotificationRepository(db)

    async def list_for_user(
        self, requester: User, *, skip: int = 0, limit: int = 100
    ) -> list[NotificationResponse]:
        notifs = await self._repo.list_by_user(requester.user_id, skip=skip, limit=limit)
        return [NotificationResponse.model_validate(n) for n in notifs]

    async def mark_read(
        self, notification_id: uuid.UUID, requester: User
    ) -> NotificationResponse:
        notif = await self._repo.get(notification_id)
        if notif is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found"
            )
        if notif.user_id != requester.user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        notif.is_read = True
        await self._repo._session.flush()
        await self._repo._session.refresh(notif)
        return NotificationResponse.model_validate(notif)

    async def mark_all_read(self, requester: User) -> None:
        await self._repo.mark_all_read(requester.user_id)

    async def delete(self, notification_id: uuid.UUID, requester: User) -> None:
        notif = await self._repo.get(notification_id)
        if notif is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found"
            )
        if notif.user_id != requester.user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        await self._repo.delete(notif)
