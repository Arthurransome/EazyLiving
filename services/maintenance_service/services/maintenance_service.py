"""MaintenanceService — business logic for maintenance requests."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from services.maintenance_service.repositories.maintenance_repo import (
    MaintenanceRequestRepository,
)
from services.property_service.repositories.property_repo import UnitRepository
from shared.db.enums import MaintenanceStatus, UserRole
from shared.db.models import MaintenanceRequest, User
from shared.events import Event, EventBus
from shared.factories import MaintenanceRequestFactory
from shared.schemas.maintenance_schemas import (
    AssignRequest,
    MaintenanceRequestCreate,
    MaintenanceRequestResponse,
)


class MaintenanceService:
    """Lifecycle management for maintenance requests.

    Status machine::

        SUBMITTED → ASSIGNED → IN_PROGRESS → COMPLETED → CLOSED
        Any non-terminal state → CANCELLED (by manager/admin, or tenant for own SUBMITTED)

    Escalation sets a flag without changing status.
    """

    def __init__(self, db: AsyncSession, bus: EventBus) -> None:
        self._repo = MaintenanceRequestRepository(db)
        self._unit_repo = UnitRepository(db)
        self._bus = bus

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    async def create(
        self, data: MaintenanceRequestCreate, requester: User
    ) -> MaintenanceRequestResponse:
        unit = await self._unit_repo.get(data.unit_id)
        if unit is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")

        req = MaintenanceRequestFactory.create(
            unit_id=data.unit_id,
            tenant_id=requester.user_id,
            title=data.title,
            description=data.description,
            priority=data.priority,
        )
        req = await self._repo.add(req)

        await self._bus.publish(Event(
            name="maintenance.created",
            payload={
                "request_id": str(req.request_id),
                "unit_id": str(req.unit_id),
                "tenant_id": str(req.tenant_id),
                "title": req.title,
            },
        ))
        return MaintenanceRequestResponse.model_validate(req)

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def list_requests(
        self, requester: User, *, skip: int = 0, limit: int = 100
    ) -> list[MaintenanceRequestResponse]:
        if requester.role == UserRole.TENANT:
            reqs = await self._repo.list_by_tenant(requester.user_id, skip=skip, limit=limit)
        elif requester.role == UserRole.MANAGER:
            reqs = await self._repo.list_by_manager(requester.user_id, skip=skip, limit=limit)
        else:
            reqs = await self._repo.list(skip=skip, limit=limit)
        return [MaintenanceRequestResponse.model_validate(r) for r in reqs]

    async def get(
        self, request_id: uuid.UUID, requester: User
    ) -> MaintenanceRequestResponse:
        req = await self._get_or_404(request_id)
        if requester.role == UserRole.TENANT and req.tenant_id != requester.user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        return MaintenanceRequestResponse.model_validate(req)

    # ------------------------------------------------------------------
    # Status transitions
    # ------------------------------------------------------------------

    async def assign(
        self, request_id: uuid.UUID, data: AssignRequest, requester: User
    ) -> MaintenanceRequestResponse:
        self._assert_manager_or_admin(requester)
        req = await self._get_or_404(request_id)
        self._assert_not_terminal(req)

        req.assigned_to = data.assigned_to
        req.status = MaintenanceStatus.ASSIGNED
        req.updated_at = datetime.now(timezone.utc)
        await self._repo._session.flush()
        await self._repo._session.refresh(req)

        await self._bus.publish(Event(
            name="maintenance.assigned",
            payload={
                "request_id": str(request_id),
                "assigned_to": str(data.assigned_to),
                "tenant_id": str(req.tenant_id),
                "title": req.title,
            },
        ))
        return MaintenanceRequestResponse.model_validate(req)

    async def start(
        self, request_id: uuid.UUID, requester: User
    ) -> MaintenanceRequestResponse:
        req = await self._get_or_404(request_id)
        self._assert_can_update(req, requester)
        if req.status != MaintenanceStatus.ASSIGNED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot start a request in '{req.status.value}' status",
            )
        req.status = MaintenanceStatus.IN_PROGRESS
        req.updated_at = datetime.now(timezone.utc)
        await self._repo._session.flush()
        await self._repo._session.refresh(req)
        return MaintenanceRequestResponse.model_validate(req)

    async def complete(
        self, request_id: uuid.UUID, requester: User
    ) -> MaintenanceRequestResponse:
        req = await self._get_or_404(request_id)
        self._assert_can_update(req, requester)
        if req.status != MaintenanceStatus.IN_PROGRESS:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot complete a request in '{req.status.value}' status",
            )
        req.status = MaintenanceStatus.COMPLETED
        req.updated_at = datetime.now(timezone.utc)
        await self._repo._session.flush()
        await self._repo._session.refresh(req)

        await self._bus.publish(Event(
            name="maintenance.completed",
            payload={
                "request_id": str(request_id),
                "tenant_id": str(req.tenant_id),
                "title": req.title,
            },
        ))
        return MaintenanceRequestResponse.model_validate(req)

    async def close(
        self, request_id: uuid.UUID, requester: User
    ) -> MaintenanceRequestResponse:
        self._assert_manager_or_admin(requester)
        req = await self._get_or_404(request_id)
        if req.status != MaintenanceStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot close a request in '{req.status.value}' status",
            )
        req.status = MaintenanceStatus.CLOSED
        req.updated_at = datetime.now(timezone.utc)
        await self._repo._session.flush()
        await self._repo._session.refresh(req)
        return MaintenanceRequestResponse.model_validate(req)

    async def cancel(
        self, request_id: uuid.UUID, requester: User
    ) -> MaintenanceRequestResponse:
        req = await self._get_or_404(request_id)
        terminal = {MaintenanceStatus.COMPLETED, MaintenanceStatus.CLOSED, MaintenanceStatus.CANCELLED}
        if req.status in terminal:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot cancel a request in '{req.status.value}' status",
            )
        # Tenant can only cancel their own request while it is still SUBMITTED
        if requester.role == UserRole.TENANT:
            if req.tenant_id != requester.user_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
            if req.status != MaintenanceStatus.SUBMITTED:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Tenants can only cancel requests that have not yet been assigned",
                )
        elif requester.role not in {UserRole.MANAGER, UserRole.ADMIN, UserRole.OWNER}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

        req.status = MaintenanceStatus.CANCELLED
        req.updated_at = datetime.now(timezone.utc)
        await self._repo._session.flush()
        await self._repo._session.refresh(req)
        return MaintenanceRequestResponse.model_validate(req)

    async def escalate(
        self, request_id: uuid.UUID, requester: User
    ) -> MaintenanceRequestResponse:
        self._assert_manager_or_admin(requester)
        req = await self._get_or_404(request_id)
        self._assert_not_terminal(req)
        req.escalated = True
        req.updated_at = datetime.now(timezone.utc)
        await self._repo._session.flush()
        await self._repo._session.refresh(req)

        await self._bus.publish(Event(
            name="maintenance.escalated",
            payload={
                "request_id": str(request_id),
                "tenant_id": str(req.tenant_id),
                "title": req.title,
            },
        ))
        return MaintenanceRequestResponse.model_validate(req)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _get_or_404(self, request_id: uuid.UUID) -> MaintenanceRequest:
        req = await self._repo.get(request_id)
        if req is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Maintenance request not found"
            )
        return req

    @staticmethod
    def _assert_manager_or_admin(requester: User) -> None:
        if requester.role not in {UserRole.MANAGER, UserRole.ADMIN, UserRole.OWNER}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Requires manager, owner, or admin role",
            )

    @staticmethod
    def _assert_can_update(req: MaintenanceRequest, requester: User) -> None:
        """Managers, admins, and the assigned user may update in-progress state."""
        if requester.role in {UserRole.MANAGER, UserRole.ADMIN, UserRole.OWNER}:
            return
        if req.assigned_to == requester.user_id:
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    @staticmethod
    def _assert_not_terminal(req: MaintenanceRequest) -> None:
        terminal = {MaintenanceStatus.COMPLETED, MaintenanceStatus.CLOSED, MaintenanceStatus.CANCELLED}
        if req.status in terminal:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Request is already in terminal status '{req.status.value}'",
            )
