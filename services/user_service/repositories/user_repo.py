"""UserRepository — data access layer for the users table."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db.models import User
from shared.repositories.base import AbstractRepository


class UserRepository(AbstractRepository[User]):
    """Repository for :class:`~shared.db.models.User` entities.

    Inherits generic CRUD (``get``, ``list``, ``add``, ``delete``) from
    ``AbstractRepository`` and adds user-specific queries.
    """

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, User)

    async def get_by_email(self, email: str) -> User | None:
        """Return the user with *email* (case-insensitive), or ``None``."""
        result = await self._session.execute(
            select(User).where(User.email == email.lower().strip())
        )
        return result.scalars().first()
