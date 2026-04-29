"""LeaseRequestService — tenant lease-request workflow."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from services.property_service.repositories.lease_request_repo import LeaseRequestRepository
from services.property_service.repositories.lease_repo import LeaseRepository
from services.property_service.repositories.property_repo import PropertyRepository, UnitRepository
from shared.db.enums import LeaseRequestStatus, LeaseStatus, UserRole
from shared.db.models import LeaseRequest, User
from shared.events import Event, EventBus
from shared.factories import LeaseFactory, LeaseRequestFactory
from shared.schemas.lease_request_schemas import LeaseRequestCreate, LeaseRequestResponse


class LeaseRequestService:
    """Handles the tenant → manager lease approval workflow.

    Flow::

        Tenant submits request (PENDING)
          └─ Manager approves → Lease created + ACTIVE, unit occupied
          └─ Manager rejects  → request REJECTED, tenant notified
    """

    def __init__(self, db: AsyncSession, bus: EventBus) -> None:
        self._repo = LeaseRequestRepository(db)
        self._unit_repo = UnitRepository(db)
        self._prop_repo = PropertyRepository(db)
        self._lease_repo = LeaseRepository(db)
        self._bus = bus

    # ------------------------------------------------------------------
    # Create (tenant only)
    # ------------------------------------------------------------------

    async def create(self, data: LeaseRequestCreate, requester: User) -> LeaseRequestResponse:
        if requester.role != UserRole.TENANT:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only tenants can submit lease requests",
            )

        unit = await self._unit_repo.get(data.unit_id)
        if unit is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")

        if unit.is_occupied or not unit.is_available:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Unit is not available",
            )

        if await self._repo.has_pending(requester.user_id, data.unit_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You already have a pending request for this unit",
            )

        lr = LeaseRequestFactory.create(
            tenant_id=requester.user_id,
            unit_id=data.unit_id,
            desired_move_in=data.desired_move_in,
            desired_move_out=data.desired_move_out,
            message=data.message,
        )
        lr = await self._repo.add(lr)

        prop = await self._prop_repo.get(unit.property_id)
        await self._bus.publish(Event(
            name="lease_request.created",
            payload={
                "request_id": str(lr.request_id),
                "tenant_id": str(lr.tenant_id),
                "unit_id": str(lr.unit_id),
                "property_id": str(unit.property_id),
                "manager_id": str(prop.manager_id) if prop and prop.manager_id else None,
                "unit_number": unit.unit_number,
            },
        ))
        return LeaseRequestResponse.model_validate(lr)

    # ------------------------------------------------------------------
    # List
    # ------------------------------------------------------------------

    async def list_requests(
        self, requester: User, *, skip: int = 0, limit: int = 100, pending_only: bool = False
    ) -> list[LeaseRequestResponse]:
        if requester.role == UserRole.TENANT:
            reqs = await self._repo.list_by_tenant(requester.user_id, skip=skip, limit=limit)
        elif requester.role == UserRole.MANAGER:
            if pending_only:
                reqs = await self._repo.list_pending_for_manager(requester.user_id, skip=skip, limit=limit)
            else:
                reqs = await self._repo.list_all_for_manager(requester.user_id, skip=skip, limit=limit)
        else:
            reqs = await self._repo.list(skip=skip, limit=limit)
        return [LeaseRequestResponse.model_validate(r) for r in reqs]

    # ------------------------------------------------------------------
    # Approve
    # ------------------------------------------------------------------

    async def approve(self, request_id: uuid.UUID, requester: User) -> LeaseRequestResponse:
        self._assert_staff(requester)
        lr = await self._get_or_404(request_id)
        await self._assert_manager_scope(lr, requester)

        if lr.status != LeaseRequestStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot approve a request in '{lr.status}' status",
            )

        unit = await self._unit_repo.get(lr.unit_id)
        if unit is None or unit.is_occupied or not unit.is_available:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Unit is no longer available",
            )

        # Create and immediately activate the lease
        lease = LeaseFactory.create(
            unit_id=lr.unit_id,
            tenant_id=lr.tenant_id,
            start_date=lr.desired_move_in,
            end_date=lr.desired_move_out,
            monthly_rent=unit.monthly_rent,
        )
        lease.status = LeaseStatus.ACTIVE
        lease = await self._lease_repo.add(lease)

        # Mark unit occupied and unavailable
        unit.is_occupied = True
        await self._unit_repo._session.flush()

        # Reject all other pending requests for this unit
        others = await self._repo.get_pending_for_unit(lr.unit_id)
        now = datetime.now(timezone.utc)
        for other in others:
            if other.request_id != lr.request_id:
                other.status = LeaseRequestStatus.REJECTED
                other.reviewed_by = requester.user_id
                other.reviewed_at = now

        # Approve this request
        lr.status = LeaseRequestStatus.APPROVED
        lr.reviewed_by = requester.user_id
        lr.reviewed_at = now
        await self._repo._session.flush()
        await self._repo._session.refresh(lr)

        await self._bus.publish(Event(
            name="lease_request.approved",
            payload={
                "request_id": str(lr.request_id),
                "tenant_id": str(lr.tenant_id),
                "unit_id": str(lr.unit_id),
                "lease_id": str(lease.lease_id),
            },
        ))
        return LeaseRequestResponse.model_validate(lr)

    # ------------------------------------------------------------------
    # Reject
    # ------------------------------------------------------------------

    async def reject(self, request_id: uuid.UUID, requester: User) -> LeaseRequestResponse:
        self._assert_staff(requester)
        lr = await self._get_or_404(request_id)
        await self._assert_manager_scope(lr, requester)

        if lr.status != LeaseRequestStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot reject a request in '{lr.status}' status",
            )

        lr.status = LeaseRequestStatus.REJECTED
        lr.reviewed_by = requester.user_id
        lr.reviewed_at = datetime.now(timezone.utc)
        await self._repo._session.flush()
        await self._repo._session.refresh(lr)

        await self._bus.publish(Event(
            name="lease_request.rejected",
            payload={
                "request_id": str(lr.request_id),
                "tenant_id": str(lr.tenant_id),
                "unit_id": str(lr.unit_id),
            },
        ))
        return LeaseRequestResponse.model_validate(lr)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _get_or_404(self, request_id: uuid.UUID) -> LeaseRequest:
        lr = await self._repo.get(request_id)
        if lr is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease request not found")
        return lr

    async def _assert_manager_scope(self, lr: LeaseRequest, requester: User) -> None:
        if requester.role != UserRole.MANAGER:
            return
        unit = await self._unit_repo.get(lr.unit_id)
        if unit is None:
            return
        prop = await self._prop_repo.get(unit.property_id)
        if prop is None or prop.manager_id != requester.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Managers can only review requests for their assigned property",
            )

    @staticmethod
    def _assert_staff(requester: User) -> None:
        if requester.role not in {UserRole.MANAGER, UserRole.ADMIN, UserRole.OWNER}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Requires manager, owner, or admin role",
            )
