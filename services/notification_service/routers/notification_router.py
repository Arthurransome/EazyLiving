"""Notification API routes."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from gateway.auth import get_current_user
from services.notification_service.services.notification_service import NotificationService
from shared.db.database import get_db
from shared.db.models import User
from shared.schemas.notification_schemas import NotificationResponse

router = APIRouter()


def _svc(db: Annotated[AsyncSession, Depends(get_db)]) -> NotificationService:
    return NotificationService(db)


@router.get(
    "/notifications",
    response_model=list[NotificationResponse],
    summary="List the current user's notifications (newest first)",
)
async def list_notifications(
    skip: int = 0,
    limit: int = 100,
    svc: Annotated[NotificationService, Depends(_svc)] = None,
    current_user: Annotated[User, Depends(get_current_user)] = None,
) -> list[NotificationResponse]:
    return await svc.list_for_user(current_user, skip=skip, limit=limit)


@router.post(
    "/notifications/{notification_id}/read",
    response_model=NotificationResponse,
    summary="Mark a single notification as read",
)
async def mark_read(
    notification_id: uuid.UUID,
    svc: Annotated[NotificationService, Depends(_svc)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> NotificationResponse:
    return await svc.mark_read(notification_id, current_user)


@router.post(
    "/notifications/read-all",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Mark all of the current user's notifications as read",
)
async def mark_all_read(
    svc: Annotated[NotificationService, Depends(_svc)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    await svc.mark_all_read(current_user)


@router.delete(
    "/notifications/{notification_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a notification",
)
async def delete_notification(
    notification_id: uuid.UUID,
    svc: Annotated[NotificationService, Depends(_svc)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    await svc.delete(notification_id, current_user)
