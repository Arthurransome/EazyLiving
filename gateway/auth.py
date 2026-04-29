"""Authentication utilities and FastAPI dependencies.

Provides:
- Password hashing / verification (bcrypt via passlib)
- JWT creation and decoding (python-jose)
- ``get_current_user`` — FastAPI dependency that validates the Bearer token
  and returns the authenticated User from the database
- ``require_role`` — factory that builds a role-checking dependency

Usage
-----
    from gateway.auth import get_current_user, require_role
    from shared.db.enums import UserRole

    @router.get("/admin-only")
    async def admin_only(current_user=Depends(require_role(UserRole.ADMIN))):
        ...
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db.config import settings
from shared.db.database import get_db
from shared.db.enums import UserRole
from shared.db.models import User
from shared.schemas.user_schemas import TokenData

# ---------------------------------------------------------------------------
# Token denylist — invalidated JTI strings (survives the request, lost on
# server restart which is acceptable for a dev/course project).
# ---------------------------------------------------------------------------
_revoked_jtis: set[str] = set()

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------
_pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    """Return a bcrypt hash of *password*."""
    return _pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Return ``True`` if *plain* matches *hashed*."""
    return _pwd_context.verify(plain, hashed)


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")


def create_access_token(data: dict) -> str:
    """Encode *data* as a signed JWT with an expiry and unique ``jti`` claim."""
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(
        minutes=settings.JWT_EXPIRE_MINUTES
    )
    payload["jti"] = str(uuid.uuid4())   # unique token ID — used for revocation
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def revoke_token(token: str) -> None:
    """Add this token's JTI to the denylist so it is rejected on future requests."""
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
        jti = payload.get("jti")
        if jti:
            _revoked_jtis.add(jti)
    except JWTError:
        pass  # already invalid — nothing to revoke


def _decode_token(token: str) -> TokenData:
    """Decode and validate a JWT, returning its claims as ``TokenData``.

    Raises HTTP 401 if the token is invalid, expired, or has been revoked.
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
        user_id: str | None = payload.get("sub")
        role_str: str | None = payload.get("role")
        jti: str | None = payload.get("jti")
        if user_id is None or role_str is None:
            raise credentials_exc
        if jti and jti in _revoked_jtis:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return TokenData(user_id=user_id, role=UserRole(role_str))
    except (JWTError, ValueError):
        raise credentials_exc


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Dependency — validate Bearer token and return the authenticated User.

    Raises HTTP 401 if the token is invalid or expired.
    Raises HTTP 401 if the user no longer exists or is inactive.
    """
    token_data = _decode_token(token)
    user: User | None = await db.get(User, token_data.user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_role(*roles: UserRole):
    """Return a dependency that ensures the current user has one of *roles*.

    Usage::

        @router.post("/properties", dependencies=[Depends(require_role(UserRole.OWNER, UserRole.ADMIN))])
        async def create_property(...):
            ...

    Or inject the user::

        @router.post("/properties")
        async def create_property(current_user: User = Depends(require_role(UserRole.OWNER))):
            ...
    """
    async def _check(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of: {[r.value for r in roles]}",
            )
        return current_user

    return _check
