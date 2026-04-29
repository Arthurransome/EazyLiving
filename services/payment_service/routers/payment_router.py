"""Payment API routes."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from gateway.auth import get_current_user, require_role
from services.payment_service.services.payment_service import PaymentService
from shared.db.database import get_db
from shared.db.enums import UserRole
from shared.db.models import User
from shared.events import bus
from shared.schemas.payment_schemas import (
    MarkOverdueRequest,
    PaymentCreate,
    PaymentResponse,
)

router = APIRouter()


def _svc(db: Annotated[AsyncSession, Depends(get_db)]) -> PaymentService:
    return PaymentService(db, bus)


@router.post(
    "/payments",
    response_model=PaymentResponse,
    status_code=201,
    summary="Create a payment record for a lease (owner/manager/admin)",
)
async def create_payment(
    data: PaymentCreate,
    svc: Annotated[PaymentService, Depends(_svc)],
    current_user: Annotated[
        User, Depends(require_role(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN))
    ],
) -> PaymentResponse:
    return await svc.create(data, current_user)


@router.get(
    "/payments",
    response_model=list[PaymentResponse],
    summary="List payments (tenants see own; staff see all)",
)
async def list_payments(
    skip: int = 0,
    limit: int = 100,
    svc: Annotated[PaymentService, Depends(_svc)] = None,
    current_user: Annotated[User, Depends(get_current_user)] = None,
) -> list[PaymentResponse]:
    return await svc.list_payments(current_user, skip=skip, limit=limit)


@router.get(
    "/payments/{payment_id}",
    response_model=PaymentResponse,
    summary="Get a payment by ID",
)
async def get_payment(
    payment_id: uuid.UUID,
    svc: Annotated[PaymentService, Depends(_svc)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PaymentResponse:
    return await svc.get(payment_id, current_user)


@router.post(
    "/payments/{payment_id}/pay",
    response_model=PaymentResponse,
    summary="Mark a payment as fully paid (owner/manager/admin)",
)
async def mark_paid(
    payment_id: uuid.UUID,
    svc: Annotated[PaymentService, Depends(_svc)],
    current_user: Annotated[
        User, Depends(require_role(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN))
    ],
) -> PaymentResponse:
    return await svc.mark_paid(payment_id, current_user)


@router.post(
    "/payments/{payment_id}/partial",
    response_model=PaymentResponse,
    summary="Mark a payment as partially paid (owner/manager/admin)",
)
async def mark_partial(
    payment_id: uuid.UUID,
    svc: Annotated[PaymentService, Depends(_svc)],
    current_user: Annotated[
        User, Depends(require_role(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN))
    ],
) -> PaymentResponse:
    return await svc.mark_partial(payment_id, current_user)


@router.post(
    "/payments/{payment_id}/overdue",
    response_model=PaymentResponse,
    summary="Mark a payment as overdue, optionally adding a late fee (owner/manager/admin)",
)
async def mark_overdue(
    payment_id: uuid.UUID,
    data: MarkOverdueRequest,
    svc: Annotated[PaymentService, Depends(_svc)],
    current_user: Annotated[
        User, Depends(require_role(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN))
    ],
) -> PaymentResponse:
    return await svc.mark_overdue(payment_id, data, current_user)
