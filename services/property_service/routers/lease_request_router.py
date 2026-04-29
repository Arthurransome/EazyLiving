"""Lease-request API routes."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from gateway.auth import get_current_user
from services.property_service.services.lease_request_service import LeaseRequestService
from shared.db.database import get_db
from shared.db.models import User
from shared.events import bus
from shared.schemas.lease_request_schemas import LeaseRequestCreate, LeaseRequestResponse

router = APIRouter()


def _svc(db: Annotated[AsyncSession, Depends(get_db)]) -> LeaseRequestService:
    return LeaseRequestService(db, bus)


@router.post(
    "/lease-requests",
    response_model=LeaseRequestResponse,
    status_code=201,
    summary="Tenant submits a lease request for an available unit",
)
async def submit_lease_request(
    data: LeaseRequestCreate,
    svc: Annotated[LeaseRequestService, Depends(_svc)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> LeaseRequestResponse:
    return await svc.create(data, current_user)


@router.get(
    "/lease-requests",
    response_model=list[LeaseRequestResponse],
    summary="List lease requests (tenant: own; manager: their property; admin: all)",
)
async def list_lease_requests(
    pending_only: bool = Query(False, description="Manager: show only PENDING requests"),
    skip: int = 0,
    limit: int = 100,
    svc: Annotated[LeaseRequestService, Depends(_svc)] = None,
    current_user: Annotated[User, Depends(get_current_user)] = None,
) -> list[LeaseRequestResponse]:
    return await svc.list_requests(current_user, skip=skip, limit=limit, pending_only=pending_only)


@router.get(
    "/lease-requests/{request_id}",
    response_model=LeaseRequestResponse,
    summary="Get a lease request by ID",
)
async def get_lease_request(
    request_id: uuid.UUID,
    svc: Annotated[LeaseRequestService, Depends(_svc)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> LeaseRequestResponse:
    reqs = await svc.list_requests(current_user)
    match = next((r for r in reqs if r.request_id == request_id), None)
    if match is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Lease request not found")
    return match


@router.post(
    "/lease-requests/{request_id}/approve",
    response_model=LeaseRequestResponse,
    summary="Approve a pending lease request (manager/admin/owner)",
)
async def approve_lease_request(
    request_id: uuid.UUID,
    svc: Annotated[LeaseRequestService, Depends(_svc)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> LeaseRequestResponse:
    return await svc.approve(request_id, current_user)


@router.post(
    "/lease-requests/{request_id}/reject",
    response_model=LeaseRequestResponse,
    summary="Reject a pending lease request (manager/admin/owner)",
)
async def reject_lease_request(
    request_id: uuid.UUID,
    svc: Annotated[LeaseRequestService, Depends(_svc)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> LeaseRequestResponse:
    return await svc.reject(request_id, current_user)
