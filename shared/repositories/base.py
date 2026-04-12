"""Abstract repository — Repository pattern base class.

All service-specific repositories inherit from ``AbstractRepository[T]`` and
gain generic CRUD operations for free.  Domain-specific queries (e.g.
``UserRepository.get_by_email``) are added in the subclass.

The repository owns the database interaction; it is the only layer that
touches ``AsyncSession``.  Services call repositories and never write SQL.

Usage
-----
    class UserRepository(AbstractRepository[User]):
        async def get_by_email(self, email: str) -> User | None:
            result = await self._session.execute(
                select(User).where(User.email == email)
            )
            return result.scalars().first()
"""

from __future__ import annotations

import uuid
from typing import Generic, Type, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db.models import Base

T = TypeVar("T", bound=Base)


class AbstractRepository(Generic[T]):
    """Generic async repository providing basic CRUD operations.

    Parameters
    ----------
    session:
        The ``AsyncSession`` injected by the FastAPI ``get_db`` dependency.
    model:
        The SQLAlchemy ORM class this repository manages.
    """

    def __init__(self, session: AsyncSession, model: Type[T]) -> None:
        self._session = session
        self._model = model

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def get(self, entity_id: uuid.UUID) -> T | None:
        """Return the entity with *entity_id*, or ``None`` if not found."""
        return await self._session.get(self._model, entity_id)

    async def list(self, *, skip: int = 0, limit: int = 100) -> list[T]:
        """Return a paginated list of all entities (no filtering)."""
        result = await self._session.execute(
            select(self._model).offset(skip).limit(limit)
        )
        return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    async def add(self, entity: T) -> T:
        """Persist a new entity and flush it so its server-generated fields
        (e.g. ``created_at``) are populated before returning.

        The caller's ``get_db`` dependency commits on success.
        """
        self._session.add(entity)
        await self._session.flush()
        await self._session.refresh(entity)
        return entity

    async def delete(self, entity: T) -> None:
        """Delete *entity* from the database."""
        await self._session.delete(entity)
        await self._session.flush()
