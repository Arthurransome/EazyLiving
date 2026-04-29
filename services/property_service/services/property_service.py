"""PropertyService and UnitService — business logic for properties and units."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from services.property_service.repositories.lease_repo import LeaseRepository
from services.property_service.repositories.property_repo import (
    PropertyRepository,
    UnitRepository,
)
from shared.db.enums import LeaseStatus, UserRole
from shared.db.models import Property, Unit, User
from shared.factories import PropertyFactory, UnitFactory
from shared.schemas.lease_schemas import LeaseResponse
from shared.schemas.property_schemas import (
    AssignManagerRequest,
    PropertyCreate,
    PropertyResponse,
    PropertyUpdate,
    PropertyWithUnitsResponse,
    UnitCreate,
    UnitResponse,
    UnitUpdate,
)
from shared.schemas.user_schemas import UserResponse


class PropertyService:
    """CRUD operations for properties.

    Only the owner (or an admin) may mutate their own properties.
    Any authenticated user may list/view properties.
    """

    def __init__(self, db: AsyncSession) -> None:
        self._repo = PropertyRepository(db)

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    async def create(self, data: PropertyCreate, owner: User) -> PropertyWithUnitsResponse:
        prop = PropertyFactory.create(
            owner_id=owner.user_id,
            name=data.name,
            address=data.address,
            city=data.city,
            state=data.state,
            zip_code=data.zip_code,
        )
        prop = await self._repo.add(prop)

        created_units: list[UnitResponse] = []
        if data.units:
            unit_repo = UnitRepository(self._repo._session)
            for u in data.units:
                unit = UnitFactory.create(
                    property_id=prop.property_id,
                    unit_number=u.unit_number,
                    monthly_rent=u.monthly_rent,
                    bedrooms=u.bedrooms,
                    bathrooms=u.bathrooms,
                    square_feet=u.square_feet,
                )
                unit = await unit_repo.add(unit)
                created_units.append(UnitResponse.model_validate(unit))

        return PropertyWithUnitsResponse(
            property_id=prop.property_id,
            owner_id=prop.owner_id,
            manager_id=prop.manager_id,
            name=prop.name,
            address=prop.address,
            city=prop.city,
            state=prop.state,
            zip_code=prop.zip_code,
            created_at=prop.created_at,
            units=created_units,
        )

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def list_all(self, *, skip: int = 0, limit: int = 100) -> list[PropertyResponse]:
        props = await self._repo.list(skip=skip, limit=limit)
        return [PropertyResponse.model_validate(p) for p in props]

    async def list_for_requester(
        self, requester: User, *, skip: int = 0, limit: int = 100
    ) -> list[PropertyResponse]:
        if requester.role == UserRole.TENANT:
            props = await self._repo.list_by_tenant(requester.user_id)
        elif requester.role == UserRole.OWNER:
            props = await self._repo.list_by_owner(requester.user_id, skip=skip, limit=limit)
        elif requester.role == UserRole.MANAGER:
            props = await self._repo.list_by_manager(requester.user_id, skip=skip, limit=limit)
        else:
            props = await self._repo.list(skip=skip, limit=limit)
        return [PropertyResponse.model_validate(p) for p in props]

    async def list_by_owner(
        self, owner_id: uuid.UUID, *, skip: int = 0, limit: int = 100
    ) -> list[PropertyResponse]:
        props = await self._repo.list_by_owner(owner_id, skip=skip, limit=limit)
        return [PropertyResponse.model_validate(p) for p in props]

    async def get(self, property_id: uuid.UUID) -> PropertyResponse:
        prop = await self._repo.get(property_id)
        if prop is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
        return PropertyResponse.model_validate(prop)

    async def list_tenants_by_property(
        self, property_id: uuid.UUID, requester: User
    ) -> list[UserResponse]:
        prop = await self._repo.get(property_id)
        if prop is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
        if requester.role == UserRole.MANAGER and prop.manager_id != requester.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Managers can only view tenants of their assigned property",
            )
        if requester.role not in {UserRole.ADMIN, UserRole.MANAGER, UserRole.OWNER}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        tenants = await self._repo.list_tenants_by_property(property_id)
        return [UserResponse.model_validate(t) for t in tenants]

    async def list_leases_by_property(self, property_id: uuid.UUID) -> list[LeaseResponse]:
        prop = await self._repo.get(property_id)
        if prop is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
        leases = await self._repo.list_leases_by_property(property_id)
        return [LeaseResponse.model_validate(l) for l in leases]

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------

    async def update(
        self, property_id: uuid.UUID, data: PropertyUpdate, requester: User
    ) -> PropertyResponse:
        prop: Property | None = await self._repo.get(property_id)
        if prop is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
        self._assert_can_manage(prop, requester)

        for field, value in data.model_dump(exclude_none=True).items():
            setattr(prop, field, value)

        await self._repo._session.flush()
        await self._repo._session.refresh(prop)
        return PropertyResponse.model_validate(prop)

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    async def delete(self, property_id: uuid.UUID, requester: User) -> None:
        prop: Property | None = await self._repo.get(property_id)
        if prop is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
        self._assert_owner_or_admin(prop, requester)
        await self._repo.delete(prop)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    @staticmethod
    def _assert_owner_or_admin(prop: Property, requester: User) -> None:
        if requester.role == UserRole.ADMIN:
            return
        if prop.owner_id != requester.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not own this property",
            )

    @staticmethod
    def _assert_can_manage(prop: Property, requester: User) -> None:
        if requester.role == UserRole.ADMIN:
            return
        if prop.owner_id == requester.user_id:
            return
        if (
            requester.role == UserRole.MANAGER
            and prop.manager_id is not None
            and prop.manager_id == requester.user_id
        ):
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have management rights for this property",
        )

    async def assign_manager(
        self, property_id: uuid.UUID, manager_id: uuid.UUID | None
    ) -> PropertyResponse:
        prop = await self._repo.get(property_id)
        if prop is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")

        if manager_id is not None:
            from services.user_service.repositories.user_repo import UserRepository
            user_repo = UserRepository(self._repo._session)
            target = await user_repo.get(manager_id)
            if target is None or not target.is_active:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
            if target.role != UserRole.MANAGER:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Assigned user must have role 'manager'",
                )

        prop.manager_id = manager_id
        await self._repo._session.flush()
        await self._repo._session.refresh(prop)
        return PropertyResponse.model_validate(prop)


class UnitService:
    """CRUD operations for units within a property."""

    def __init__(self, db: AsyncSession) -> None:
        self._unit_repo = UnitRepository(db)
        self._prop_repo = PropertyRepository(db)
        self._lease_repo = LeaseRepository(db)

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    async def create(
        self, property_id: uuid.UUID, data: UnitCreate, requester: User
    ) -> UnitResponse:
        prop = await self._prop_repo.get(property_id)
        if prop is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
        PropertyService._assert_can_manage(prop, requester)

        unit = UnitFactory.create(
            property_id=property_id,
            unit_number=data.unit_number,
            monthly_rent=data.monthly_rent,
            bedrooms=data.bedrooms,
            bathrooms=data.bathrooms,
            square_feet=data.square_feet,
        )
        unit = await self._unit_repo.add(unit)
        return UnitResponse.model_validate(unit)

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def list_by_property(
        self, property_id: uuid.UUID, *, skip: int = 0, limit: int = 100,
        available_only: bool = False,
    ) -> list[UnitResponse]:
        if available_only:
            units = await self._unit_repo.get_available_units(property_id)
        else:
            units = await self._unit_repo.list_by_property(property_id, skip=skip, limit=limit)
        results = []
        for u in units:
            leases = getattr(u, "leases", None) or []
            active = next((l for l in leases if l.status == LeaseStatus.ACTIVE), None)
            resp = UnitResponse.model_validate(u)
            resp.active_lease_id = active.lease_id if active else None
            results.append(resp)
        return results

    async def list_available(self, *, skip: int = 0, limit: int = 100) -> list[UnitResponse]:
        """Return all available units across all properties."""
        units = await self._unit_repo.list_all_available(skip=skip, limit=limit)
        return [UnitResponse.model_validate(u) for u in units]

    async def get(self, unit_id: uuid.UUID) -> UnitResponse:
        unit = await self._unit_repo.get(unit_id)
        if unit is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")
        active_lease = await self._lease_repo.get_active_lease(unit_id)
        resp = UnitResponse.model_validate(unit)
        resp.active_lease_id = active_lease.lease_id if active_lease else None
        return resp

    async def list_leases_by_unit(self, unit_id: uuid.UUID) -> list[LeaseResponse]:
        unit = await self._unit_repo.get(unit_id)
        if unit is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")
        leases = await self._lease_repo.list_by_unit(unit_id)
        return [LeaseResponse.model_validate(l) for l in leases]

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------

    async def update(
        self, unit_id: uuid.UUID, data: UnitUpdate, requester: User
    ) -> UnitResponse:
        unit: Unit | None = await self._unit_repo.get(unit_id)
        if unit is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")

        prop = await self._prop_repo.get(unit.property_id)
        PropertyService._assert_can_manage(prop, requester)

        for field, value in data.model_dump(exclude_none=True).items():
            setattr(unit, field, value)

        await self._unit_repo._session.flush()
        await self._unit_repo._session.refresh(unit)
        return UnitResponse.model_validate(unit)

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    async def delete(self, unit_id: uuid.UUID, requester: User) -> None:
        unit: Unit | None = await self._unit_repo.get(unit_id)
        if unit is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")

        prop = await self._prop_repo.get(unit.property_id)
        PropertyService._assert_can_manage(prop, requester)
        await self._unit_repo.delete(unit)

    # ------------------------------------------------------------------
    # Occupancy helpers (called by LeaseService)
    # ------------------------------------------------------------------

    async def mark_occupied(self, unit_id: uuid.UUID) -> None:
        unit: Unit | None = await self._unit_repo.get(unit_id)
        if unit is not None:
            unit.is_occupied = True
            await self._unit_repo._session.flush()

    async def mark_vacant(self, unit_id: uuid.UUID) -> None:
        unit: Unit | None = await self._unit_repo.get(unit_id)
        if unit is not None:
            unit.is_occupied = False
            await self._unit_repo._session.flush()
