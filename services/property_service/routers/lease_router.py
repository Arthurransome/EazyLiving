"""Lease API routes."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from gateway.auth import get_current_user
from services.property_service.services.lease_service import LeaseService
from shared.db.database import get_db
from shared.db.models import User
from shared.events import bus
from shared.schemas.lease_schemas import LeaseCreate, LeaseResponse

router = APIRouter()


def _lease_svc(db: Annotated[AsyncSession, Depends(get_db)]) -> LeaseService:
    return LeaseService(db, bus)


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.post(
    "/leases",
    response_model=LeaseResponse,
    status_code=201,
    summary="Create a new lease in DRAFT status (owner/manager/admin only)",
)
async def create_lease(
    data: LeaseCreate,
    svc: Annotated[LeaseService, Depends(_lease_svc)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> LeaseResponse:
    return await svc.create(data, current_user)


@router.get(
    "/leases",
    response_model=list[LeaseResponse],
    summary="List leases (tenants see only their own; staff see all)",
)
async def list_leases(
    skip: int = 0,
    limit: int = 100,
    svc: Annotated[LeaseService, Depends(_lease_svc)] = None,
    current_user: Annotated[User, Depends(get_current_user)] = None,
) -> list[LeaseResponse]:
    return await svc.list_leases(current_user, skip=skip, limit=limit)


@router.get(
    "/leases/{lease_id}",
    response_model=LeaseResponse,
    summary="Get a lease by ID",
)
async def get_lease(
    lease_id: uuid.UUID,
    svc: Annotated[LeaseService, Depends(_lease_svc)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> LeaseResponse:
    return await svc.get(lease_id, current_user)


# ---------------------------------------------------------------------------
# Lifecycle transitions
# ---------------------------------------------------------------------------

@router.post(
    "/leases/{lease_id}/activate",
    response_model=LeaseResponse,
    summary="Activate a DRAFT lease (owner/manager/admin only)",
)
async def activate_lease(
    lease_id: uuid.UUID,
    svc: Annotated[LeaseService, Depends(_lease_svc)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> LeaseResponse:
    return await svc.activate(lease_id, current_user)


@router.post(
    "/leases/{lease_id}/terminate",
    response_model=LeaseResponse,
    summary="Terminate an ACTIVE lease (owner/manager/admin only)",
)
async def terminate_lease(
    lease_id: uuid.UUID,
    svc: Annotated[LeaseService, Depends(_lease_svc)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> LeaseResponse:
    return await svc.terminate(lease_id, current_user)
