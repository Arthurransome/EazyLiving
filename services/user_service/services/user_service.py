"""UserService — business logic for user management."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from gateway.auth import create_access_token, hash_password, verify_password
from services.user_service.repositories.user_repo import UserRepository
from shared.db.models import User
from shared.events import Event, EventBus
from shared.factories import UserFactory
from shared.schemas.user_schemas import Token, UserCreate, UserLogin, UserResponse


class UserService:
    """Handles registration, authentication, and profile retrieval.

    Parameters
    ----------
    db:
        An async SQLAlchemy session (injected via ``get_db``).
    bus:
        The application-level ``EventBus`` singleton.
    """

    def __init__(self, db: AsyncSession, bus: EventBus) -> None:
        self._repo = UserRepository(db)
        self._bus = bus

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    async def register(self, data: UserCreate) -> UserResponse:
        """Create a new user account.

        Raises HTTP 409 if the email is already registered.
        """
        if await self._repo.get_by_email(data.email):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            )

        user = UserFactory.create(
            email=data.email,
            name=data.name,
            password_hash=hash_password(data.password),
            role=data.role,
        )
        user = await self._repo.add(user)

        await self._bus.publish(
            Event(name="user.registered", payload={"user_id": str(user.user_id), "email": user.email})
        )

        return UserResponse.model_validate(user)

    # ------------------------------------------------------------------
    # Authentication
    # ------------------------------------------------------------------

    async def authenticate(self, data: UserLogin) -> Token:
        """Validate credentials and return a JWT.

        Raises HTTP 401 on invalid email or wrong password.
        """
        user = await self._repo.get_by_email(data.email)
        if user is None or not verify_password(data.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is inactive",
            )

        token = create_access_token({"sub": str(user.user_id), "role": user.role.value})
        return Token(access_token=token)

    # ------------------------------------------------------------------
    # Profile
    # ------------------------------------------------------------------

    async def get_profile(self, user_id: uuid.UUID) -> UserResponse:
        """Return the profile for *user_id*.

        Raises HTTP 404 if not found.
        """
        user: User | None = await self._repo.get(user_id)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return UserResponse.model_validate(user)
