"""Property and unit API routes."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from gateway.auth import get_current_user, require_role
from services.property_service.services.property_service import PropertyService, UnitService
from shared.db.database import get_db
from shared.db.enums import UserRole
from shared.db.models import User
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

router = APIRouter()


def _prop_svc(db: Annotated[AsyncSession, Depends(get_db)]) -> PropertyService:
    return PropertyService(db)


def _unit_svc(db: Annotated[AsyncSession, Depends(get_db)]) -> UnitService:
    return UnitService(db)


# ---------------------------------------------------------------------------
# Properties
# ---------------------------------------------------------------------------

@router.post(
    "/properties",
    response_model=PropertyWithUnitsResponse,
    status_code=201,
    summary="Create a new property, optionally with units (owner/admin only)",
)
async def create_property(
    data: PropertyCreate,
    svc: Annotated[PropertyService, Depends(_prop_svc)],
    current_user: Annotated[User, Depends(require_role(UserRole.OWNER, UserRole.ADMIN))],
) -> PropertyWithUnitsResponse:
    return await svc.create(data, current_user)


@router.get(
    "/properties",
    response_model=list[PropertyResponse],
    summary="List properties (owners see own; tenants see rented; staff see all)",
)
async def list_properties(
    skip: int = 0,
    limit: int = 100,
    svc: Annotated[PropertyService, Depends(_prop_svc)] = None,
    current_user: Annotated[User, Depends(get_current_user)] = None,
) -> list[PropertyResponse]:
    return await svc.list_for_requester(current_user, skip=skip, limit=limit)


@router.get(
    "/properties/{property_id}",
    response_model=PropertyResponse,
    summary="Get a property by ID",
)
async def get_property(
    property_id: uuid.UUID,
    svc: Annotated[PropertyService, Depends(_prop_svc)],
    _: Annotated[User, Depends(get_current_user)],
) -> PropertyResponse:
    return await svc.get(property_id)


@router.put(
    "/properties/{property_id}",
    response_model=PropertyResponse,
    summary="Update a property (owner/admin/assigned manager)",
)
async def update_property(
    property_id: uuid.UUID,
    data: PropertyUpdate,
    svc: Annotated[PropertyService, Depends(_prop_svc)],
    current_user: Annotated[User, Depends(require_role(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER))],
) -> PropertyResponse:
    return await svc.update(property_id, data, current_user)


@router.put(
    "/properties/{property_id}/manager",
    response_model=PropertyResponse,
    summary="Assign or remove a property manager (admin only)",
)
async def assign_manager(
    property_id: uuid.UUID,
    data: AssignManagerRequest,
    svc: Annotated[PropertyService, Depends(_prop_svc)],
    _: Annotated[User, Depends(require_role(UserRole.ADMIN))],
) -> PropertyResponse:
    return await svc.assign_manager(property_id, data.manager_id)


@router.delete(
    "/properties/{property_id}",
    status_code=204,
    summary="Delete a property (owner/admin only)",
)
async def delete_property(
    property_id: uuid.UUID,
    svc: Annotated[PropertyService, Depends(_prop_svc)],
    current_user: Annotated[User, Depends(require_role(UserRole.OWNER, UserRole.ADMIN))],
) -> None:
    await svc.delete(property_id, current_user)


# ---------------------------------------------------------------------------
# Units (nested under property)
# ---------------------------------------------------------------------------

@router.post(
    "/properties/{property_id}/units",
    response_model=UnitResponse,
    status_code=201,
    summary="Add a unit to a property (owner/admin/assigned manager)",
)
async def create_unit(
    property_id: uuid.UUID,
    data: UnitCreate,
    svc: Annotated[UnitService, Depends(_unit_svc)],
    current_user: Annotated[User, Depends(require_role(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER))],
) -> UnitResponse:
    return await svc.create(property_id, data, current_user)


@router.get(
    "/properties/{property_id}/units",
    response_model=list[UnitResponse],
    summary="List all units in a property",
)
async def list_units(
    property_id: uuid.UUID,
    available: bool = False,
    skip: int = 0,
    limit: int = 100,
    svc: Annotated[UnitService, Depends(_unit_svc)] = None,
    _: Annotated[User, Depends(get_current_user)] = None,
) -> list[UnitResponse]:
    return await svc.list_by_property(property_id, skip=skip, limit=limit, available_only=available)


@router.get(
    "/properties/{property_id}/leases",
    response_model=list[LeaseResponse],
    summary="List all leases across all units of a property",
)
async def list_leases_for_property(
    property_id: uuid.UUID,
    svc: Annotated[PropertyService, Depends(_prop_svc)],
    _: Annotated[User, Depends(get_current_user)],
) -> list[LeaseResponse]:
    return await svc.list_leases_by_property(property_id)


@router.get(
    "/units/{unit_id}/leases",
    response_model=list[LeaseResponse],
    summary="List all leases for a unit",
)
async def list_leases_for_unit(
    unit_id: uuid.UUID,
    svc: Annotated[UnitService, Depends(_unit_svc)],
    _: Annotated[User, Depends(get_current_user)],
) -> list[LeaseResponse]:
    return await svc.list_leases_by_unit(unit_id)


@router.get(
    "/units/{unit_id}",
    response_model=UnitResponse,
    summary="Get a unit by ID",
)
async def get_unit(
    unit_id: uuid.UUID,
    svc: Annotated[UnitService, Depends(_unit_svc)],
    _: Annotated[User, Depends(get_current_user)],
) -> UnitResponse:
    return await svc.get(unit_id)


@router.put(
    "/units/{unit_id}",
    response_model=UnitResponse,
    summary="Update a unit (owner/admin/assigned manager)",
)
async def update_unit(
    unit_id: uuid.UUID,
    data: UnitUpdate,
    svc: Annotated[UnitService, Depends(_unit_svc)],
    current_user: Annotated[User, Depends(require_role(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER))],
) -> UnitResponse:
    return await svc.update(unit_id, data, current_user)


@router.delete(
    "/units/{unit_id}",
    status_code=204,
    summary="Delete a unit (owner/admin/assigned manager)",
)
async def delete_unit(
    unit_id: uuid.UUID,
    svc: Annotated[UnitService, Depends(_unit_svc)],
    current_user: Annotated[User, Depends(require_role(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER))],
) -> None:
    await svc.delete(unit_id, current_user)
