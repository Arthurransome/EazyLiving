"""PaymentService — business logic for rent payments."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from services.payment_service.repositories.payment_repo import PaymentRepository
from services.property_service.repositories.lease_repo import LeaseRepository
from shared.db.enums import PaymentStatus, UserRole
from shared.db.models import Payment, User
from shared.events import Event, EventBus
from shared.factories import PaymentFactory
from shared.schemas.payment_schemas import (
    MarkOverdueRequest,
    PaymentCreate,
    PaymentResponse,
)


class PaymentService:
    """CRUD and status transitions for payments.

    Only OWNER / MANAGER / ADMIN may create payment records and change status.
    TENANT may only view their own payments.
    """

    def __init__(self, db: AsyncSession, bus: EventBus) -> None:
        self._repo = PaymentRepository(db)
        self._lease_repo = LeaseRepository(db)
        self._bus = bus

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    async def create(self, data: PaymentCreate, requester: User) -> PaymentResponse:
        self._assert_staff(requester)

        lease = await self._lease_repo.get(data.lease_id)
        if lease is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found")

        payment = PaymentFactory.create(
            lease_id=data.lease_id,
            tenant_id=data.tenant_id,
            amount=data.amount,
            due_date=data.due_date,
            notes=data.notes,
        )
        payment = await self._repo.add(payment)

        await self._bus.publish(Event(
            name="payment.created",
            payload={
                "payment_id": str(payment.payment_id),
                "lease_id": str(payment.lease_id),
                "tenant_id": str(payment.tenant_id),
                "amount": str(payment.amount),
                "due_date": str(payment.due_date),
            },
        ))
        return PaymentResponse.model_validate(payment)

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def list_payments(
        self, requester: User, *, skip: int = 0, limit: int = 100
    ) -> list[PaymentResponse]:
        if requester.role == UserRole.TENANT:
            payments = await self._repo.list_by_tenant(requester.user_id, skip=skip, limit=limit)
        else:
            payments = await self._repo.list(skip=skip, limit=limit)
        return [PaymentResponse.model_validate(p) for p in payments]

    async def get(self, payment_id: uuid.UUID, requester: User) -> PaymentResponse:
        payment = await self._get_or_404(payment_id)
        if requester.role == UserRole.TENANT and payment.tenant_id != requester.user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        return PaymentResponse.model_validate(payment)

    # ------------------------------------------------------------------
    # Status transitions
    # ------------------------------------------------------------------

    async def mark_paid(self, payment_id: uuid.UUID, requester: User) -> PaymentResponse:
        self._assert_staff(requester)
        payment = await self._get_or_404(payment_id)
        if payment.status == PaymentStatus.PAID:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Payment is already marked paid"
            )
        payment.status = PaymentStatus.PAID
        payment.payment_date = datetime.now(timezone.utc)
        await self._repo._session.flush()
        await self._repo._session.refresh(payment)
        await self._bus.publish(Event(
            name="payment.paid",
            payload={"payment_id": str(payment_id), "tenant_id": str(payment.tenant_id)},
        ))
        return PaymentResponse.model_validate(payment)

    async def mark_partial(self, payment_id: uuid.UUID, requester: User) -> PaymentResponse:
        self._assert_staff(requester)
        payment = await self._get_or_404(payment_id)
        if payment.status == PaymentStatus.PAID:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Payment is already fully paid"
            )
        payment.status = PaymentStatus.PARTIAL
        payment.payment_date = datetime.now(timezone.utc)
        await self._repo._session.flush()
        await self._repo._session.refresh(payment)
        await self._bus.publish(Event(
            name="payment.partial",
            payload={"payment_id": str(payment_id), "tenant_id": str(payment.tenant_id)},
        ))
        return PaymentResponse.model_validate(payment)

    async def mark_overdue(
        self, payment_id: uuid.UUID, data: MarkOverdueRequest, requester: User
    ) -> PaymentResponse:
        self._assert_staff(requester)
        payment = await self._get_or_404(payment_id)
        if payment.status == PaymentStatus.PAID:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Cannot mark a paid payment as overdue"
            )
        payment.status = PaymentStatus.OVERDUE
        payment.late_fee = data.late_fee
        await self._repo._session.flush()
        await self._repo._session.refresh(payment)
        await self._bus.publish(Event(
            name="payment.overdue",
            payload={
                "payment_id": str(payment_id),
                "tenant_id": str(payment.tenant_id),
                "late_fee": str(data.late_fee),
            },
        ))
        return PaymentResponse.model_validate(payment)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _get_or_404(self, payment_id: uuid.UUID) -> Payment:
        payment = await self._repo.get(payment_id)
        if payment is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
        return payment

    @staticmethod
    def _assert_staff(requester: User) -> None:
        if requester.role == UserRole.TENANT:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tenants cannot perform this action",
            )
