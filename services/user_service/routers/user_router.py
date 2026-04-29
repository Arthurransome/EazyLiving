"""User and auth API routes."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from gateway.auth import get_current_user, oauth2_scheme, require_role, revoke_token
from services.user_service.services.user_service import UserService
from shared.db.database import get_db
from shared.db.enums import UserRole
from shared.db.models import User
from shared.events import bus
from shared.schemas.user_schemas import Token, UserCreate, UserLogin, UserResponse

router = APIRouter()


def _user_service(db: Annotated[AsyncSession, Depends(get_db)]) -> UserService:
    return UserService(db, bus)


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/auth/register",
    response_model=UserResponse,
    status_code=201,
    summary="Register a new user account",
)
async def register(
    data: UserCreate,
    svc: Annotated[UserService, Depends(_user_service)],
) -> UserResponse:
    return await svc.register(data)


@router.post(
    "/auth/login",
    response_model=Token,
    summary="Authenticate and receive a JWT (JSON body)",
)
async def login(
    data: UserLogin,
    svc: Annotated[UserService, Depends(_user_service)],
) -> Token:
    return await svc.authenticate(data)


@router.post(
    "/auth/logout",
    status_code=204,
    summary="Invalidate the current Bearer token",
)
async def logout(
    _: Annotated[User, Depends(get_current_user)],
    token: Annotated[str, Depends(oauth2_scheme)],
) -> None:
    """Add the token's JTI to the server-side denylist.

    The token is immediately rejected on any subsequent request.
    Clients should also discard the token locally.
    """
    revoke_token(token)


@router.post(
    "/auth/token",
    response_model=Token,
    include_in_schema=False,  # hidden — used only by Swagger's Authorize dialog
)
async def login_form(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    svc: Annotated[UserService, Depends(_user_service)],
) -> Token:
    """OAuth2 form-data endpoint so the Swagger UI Authorize button works.
    Maps OAuth2 ``username`` field → our ``email`` field.
    """
    return await svc.authenticate(UserLogin(email=form.username, password=form.password))


# ---------------------------------------------------------------------------
# User profile endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/users/me",
    response_model=UserResponse,
    summary="Get the currently authenticated user's profile",
)
async def get_me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.get(
    "/users/{user_id}",
    response_model=UserResponse,
    summary="Get a user's profile by ID (admin or owner only)",
)
async def get_user(
    user_id: uuid.UUID,
    svc: Annotated[UserService, Depends(_user_service)],
    _: Annotated[User, Depends(require_role(UserRole.ADMIN, UserRole.OWNER))],
) -> UserResponse:
    return await svc.get_profile(user_id)
