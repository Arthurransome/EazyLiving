"""Maintenance request API routes."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from gateway.auth import get_current_user, require_role
from services.maintenance_service.services.maintenance_service import MaintenanceService
from shared.db.database import get_db
from shared.db.enums import UserRole
from shared.db.models import User
from shared.events import bus
from shared.schemas.maintenance_schemas import (
    AssignRequest,
    MaintenanceRequestCreate,
    MaintenanceRequestResponse,
    MaintenanceUpdateRequest,
)

router = APIRouter()


def _svc(db: Annotated[AsyncSession, Depends(get_db)]) -> MaintenanceService:
    return MaintenanceService(db, bus)


@router.post(
    "/maintenance-requests",
    response_model=MaintenanceRequestResponse,
    status_code=201,
    summary="Submit a maintenance request (any authenticated user)",
)
async def create_request(
    data: MaintenanceRequestCreate,
    svc: Annotated[MaintenanceService, Depends(_svc)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> MaintenanceRequestResponse:
    return await svc.create(data, current_user)


@router.get(
    "/maintenance-requests",
    response_model=list[MaintenanceRequestResponse],
    summary="List maintenance requests (tenants see own; staff see all)",
)
async def list_requests(
    skip: int = 0,
    limit: int = 100,
    svc: Annotated[MaintenanceService, Depends(_svc)] = None,
    current_user: Annotated[User, Depends(get_current_user)] = None,
) -> list[MaintenanceRequestResponse]:
    return await svc.list_requests(current_user, skip=skip, limit=limit)


@router.get(
    "/maintenance-requests/{request_id}",
    response_model=MaintenanceRequestResponse,
    summary="Get a maintenance request by ID",
)
async def get_request(
    request_id: uuid.UUID,
    svc: Annotated[MaintenanceService, Depends(_svc)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> MaintenanceRequestResponse:
    return await svc.get(request_id, current_user)


@router.put(
    "/maintenance-requests/{request_id}",
    response_model=MaintenanceRequestResponse,
    summary="Dispatch a state-machine event on a request (assign/start/complete/close/cancel/escalate)",
)
async def update_request(
    request_id: uuid.UUID,
    data: MaintenanceUpdateRequest,
    svc: Annotated[MaintenanceService, Depends(_svc)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> MaintenanceRequestResponse:
    match data.event:
        case "assign":
            if data.assigned_to is None:
                raise HTTPException(status_code=422, detail="assigned_to is required for event 'assign'")
            return await svc.assign(request_id, AssignRequest(assigned_to=data.assigned_to), current_user)
        case "start":
            return await svc.start(request_id, current_user)
        case "complete":
            return await svc.complete(request_id, current_user)
        case "close":
            return await svc.close(request_id, current_user)
        case "cancel":
            return await svc.cancel(request_id, current_user)
        case "escalate":
            return await svc.escalate(request_id, current_user)
        case _:
            raise HTTPException(status_code=422, detail=f"Unknown event '{data.event}'")


@router.post(
    "/maintenance-requests/{request_id}/assign",
    response_model=MaintenanceRequestResponse,
    summary="Assign a request to a user (owner/manager/admin)",
)
async def assign_request(
    request_id: uuid.UUID,
    data: AssignRequest,
    svc: Annotated[MaintenanceService, Depends(_svc)],
    current_user: Annotated[
        User, Depends(require_role(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN))
    ],
) -> MaintenanceRequestResponse:
    return await svc.assign(request_id, data, current_user)


@router.post(
    "/maintenance-requests/{request_id}/start",
    response_model=MaintenanceRequestResponse,
    summary="Mark request as in-progress (owner/manager/admin or assignee)",
)
async def start_request(
    request_id: uuid.UUID,
    svc: Annotated[MaintenanceService, Depends(_svc)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> MaintenanceRequestResponse:
    return await svc.start(request_id, current_user)


@router.post(
    "/maintenance-requests/{request_id}/complete",
    response_model=MaintenanceRequestResponse,
    summary="Mark request as completed (owner/manager/admin or assignee)",
)
async def complete_request(
    request_id: uuid.UUID,
    svc: Annotated[MaintenanceService, Depends(_svc)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> MaintenanceRequestResponse:
    return await svc.complete(request_id, current_user)


@router.post(
    "/maintenance-requests/{request_id}/close",
    response_model=MaintenanceRequestResponse,
    summary="Close a completed request (owner/manager/admin)",
)
async def close_request(
    request_id: uuid.UUID,
    svc: Annotated[MaintenanceService, Depends(_svc)],
    current_user: Annotated[
        User, Depends(require_role(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN))
    ],
) -> MaintenanceRequestResponse:
    return await svc.close(request_id, current_user)


@router.post(
    "/maintenance-requests/{request_id}/cancel",
    response_model=MaintenanceRequestResponse,
    summary="Cancel a request (manager/admin, or tenant for own unassigned request)",
)
async def cancel_request(
    request_id: uuid.UUID,
    svc: Annotated[MaintenanceService, Depends(_svc)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> MaintenanceRequestResponse:
    return await svc.cancel(request_id, current_user)


@router.post(
    "/maintenance-requests/{request_id}/escalate",
    response_model=MaintenanceRequestResponse,
    summary="Flag a request as escalated (owner/manager/admin)",
)
async def escalate_request(
    request_id: uuid.UUID,
    svc: Annotated[MaintenanceService, Depends(_svc)],
    current_user: Annotated[
        User, Depends(require_role(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN))
    ],
) -> MaintenanceRequestResponse:
    return await svc.escalate(request_id, current_user)
