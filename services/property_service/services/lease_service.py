"""LeaseService — business logic for lease lifecycle management."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from services.property_service.repositories.lease_repo import LeaseRepository
from services.property_service.repositories.property_repo import PropertyRepository, UnitRepository
from shared.db.enums import LeaseStatus, UserRole
from shared.db.models import Lease, Unit, User
from shared.events import Event, EventBus
from shared.factories import LeaseFactory
from shared.schemas.lease_schemas import LeaseCreate, LeaseResponse


class LeaseService:
    """Handles lease creation and status transitions.

    Lifecycle::

        DRAFT ──activate()──► ACTIVE ──terminate()──► TERMINATED

    Creating a lease marks the unit occupied.
    Terminating a lease marks the unit vacant.
    Both state changes publish domain events to the ``EventBus``.
    """

    def __init__(self, db: AsyncSession, bus: EventBus) -> None:
        self._repo = LeaseRepository(db)
        self._unit_repo = UnitRepository(db)
        self._prop_repo = PropertyRepository(db)
        self._bus = bus

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    async def create(self, data: LeaseCreate, requester: User) -> LeaseResponse:
        """Create a new lease in DRAFT status.

        Raises
        ------
        HTTP 404  if the unit does not exist.
        HTTP 409  if the unit already has an active lease.
        HTTP 403  if the requester is a TENANT (tenants cannot create leases).
        """
        if requester.role == UserRole.TENANT:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tenants cannot create leases",
            )

        unit: Unit | None = await self._unit_repo.get(data.unit_id)
        if unit is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")

        if requester.role == UserRole.MANAGER:
            prop = await self._prop_repo.get(unit.property_id)
            if prop is None or prop.manager_id != requester.user_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Managers can only create leases for units in their assigned property",
                )

        existing = await self._repo.get_active_lease(data.unit_id)
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Unit already has an active lease",
            )

        lease = LeaseFactory.create(
            unit_id=data.unit_id,
            tenant_id=data.tenant_id,
            start_date=data.start_date,
            end_date=data.end_date,
            monthly_rent=data.monthly_rent,
            security_deposit=data.security_deposit,
        )
        lease = await self._repo.add(lease)

        await self._bus.publish(
            Event(
                name="lease.created",
                payload={"lease_id": str(lease.lease_id), "unit_id": str(lease.unit_id)},
            )
        )
        return LeaseResponse.model_validate(lease)

    # ------------------------------------------------------------------
    # Activate: DRAFT → ACTIVE
    # ------------------------------------------------------------------

    async def activate(self, lease_id: uuid.UUID, requester: User) -> LeaseResponse:
        """Transition a DRAFT lease to ACTIVE and mark its unit occupied.

        Raises HTTP 404 if not found, HTTP 409 if not in DRAFT status.
        """
        self._assert_manager_or_admin(requester)
        lease = await self._get_or_404(lease_id)
        await self._assert_manager_scope(lease, requester)

        if lease.status != LeaseStatus.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot activate a lease in '{lease.status.value}' status",
            )

        lease.status = LeaseStatus.ACTIVE
        await self._repo._session.flush()

        unit: Unit | None = await self._unit_repo.get(lease.unit_id)
        if unit is not None:
            unit.is_occupied = True
            await self._unit_repo._session.flush()

        await self._repo._session.refresh(lease)

        await self._bus.publish(
            Event(
                name="lease.activated",
                payload={"lease_id": str(lease_id), "unit_id": str(lease.unit_id)},
            )
        )
        await self._bus.publish(
            Event(name="unit.occupied", payload={"unit_id": str(lease.unit_id)})
        )
        return LeaseResponse.model_validate(lease)

    # ------------------------------------------------------------------
    # Terminate: ACTIVE → TERMINATED
    # ------------------------------------------------------------------

    async def terminate(self, lease_id: uuid.UUID, requester: User) -> LeaseResponse:
        """Transition an ACTIVE lease to TERMINATED and mark its unit vacant.

        Raises HTTP 404 if not found, HTTP 409 if not ACTIVE.
        """
        self._assert_manager_or_admin(requester)
        lease = await self._get_or_404(lease_id)
        await self._assert_manager_scope(lease, requester)

        if lease.status != LeaseStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot terminate a lease in '{lease.status.value}' status",
            )

        lease.status = LeaseStatus.TERMINATED
        await self._repo._session.flush()

        unit: Unit | None = await self._unit_repo.get(lease.unit_id)
        if unit is not None:
            unit.is_occupied = False
            await self._unit_repo._session.flush()

        await self._repo._session.refresh(lease)

        await self._bus.publish(
            Event(
                name="lease.terminated",
                payload={"lease_id": str(lease_id), "unit_id": str(lease.unit_id)},
            )
        )
        await self._bus.publish(
            Event(name="unit.vacated", payload={"unit_id": str(lease.unit_id)})
        )
        return LeaseResponse.model_validate(lease)

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def get(self, lease_id: uuid.UUID, requester: User) -> LeaseResponse:
        """Return lease by ID.  Tenants can only see their own leases."""
        lease = await self._get_or_404(lease_id)
        if requester.role == UserRole.TENANT and lease.tenant_id != requester.user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        return LeaseResponse.model_validate(lease)

    async def list_leases(
        self, requester: User, *, skip: int = 0, limit: int = 100
    ) -> list[LeaseResponse]:
        """Return leases visible to *requester*.

        - TENANT: only their own leases.
        - OWNER / MANAGER / ADMIN: all leases (paginated).
        """
        if requester.role == UserRole.TENANT:
            leases = await self._repo.list_by_tenant(requester.user_id, skip=skip, limit=limit)
        elif requester.role == UserRole.MANAGER:
            leases = await self._repo.list_by_manager(requester.user_id, skip=skip, limit=limit)
        else:
            leases = await self._repo.list(skip=skip, limit=limit)
        return [LeaseResponse.model_validate(l) for l in leases]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _get_or_404(self, lease_id: uuid.UUID) -> Lease:
        lease: Lease | None = await self._repo.get(lease_id)
        if lease is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found")
        return lease

    async def _assert_manager_scope(self, lease: Lease, requester: User) -> None:
        """Raise 403 if a manager tries to act on a lease outside their property."""
        if requester.role != UserRole.MANAGER:
            return
        unit: Unit | None = await self._unit_repo.get(lease.unit_id)
        if unit is None:
            return
        prop = await self._prop_repo.get(unit.property_id)
        if prop is None or prop.manager_id != requester.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Managers can only manage leases in their assigned property",
            )

    @staticmethod
    def _assert_manager_or_admin(requester: User) -> None:
        allowed = {UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN}
        if requester.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Requires owner, manager, or admin role",
            )
