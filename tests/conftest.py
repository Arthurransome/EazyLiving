"""Pytest configuration and shared fixtures.

Test database isolation strategy
---------------------------------
Set ``TEST_DATABASE_URL`` in .env to point at a *separate* PostgreSQL database
(e.g. ``eazyliving_test``).  The fixture will create that DB automatically on
first run and drop all tables on teardown — keeping the development DB safe.

If ``TEST_DATABASE_URL`` is not set, tests fall back to the main DATABASE_URL
and tables are left in place after the session (no drop_all).
"""
import pytest
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from httpx import AsyncClient, ASGITransport

from shared.db.models import Base
from shared.db.config import settings
from gateway.main import app


def _test_db_url() -> str:
    """Return the URL tests should use, preferring TEST_DATABASE_URL."""
    return settings.TEST_DATABASE_URL or settings.DATABASE_URL


def _is_isolated_db() -> bool:
    """True when tests have their own DB and can drop/recreate the schema."""
    return bool(settings.TEST_DATABASE_URL)


def _ensure_test_db_exists() -> None:
    """Create the test database if it doesn't exist yet (runs once per session)."""
    if not _is_isolated_db():
        return
    from sqlalchemy import create_engine
    # Connect to the default 'postgres' DB to issue CREATE DATABASE
    admin_url = settings.DATABASE_URL.replace(
        "postgresql+asyncpg://", "postgresql://"
    )
    # Replace the DB name with 'postgres' (always exists)
    base, _, db_name_part = admin_url.rpartition("/")
    test_db_name = _test_db_url().rpartition("/")[2]
    admin_url = f"{base}/postgres"
    engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :n"),
            {"n": test_db_name},
        ).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{test_db_name}"'))
    engine.dispose()


# ---------------------------------------------------------------------------
# Session-scoped engine: create schema once, optionally tear it down after
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
async def test_engine():
    """Async engine pointed at the test database.

    * If TEST_DATABASE_URL is set → isolated DB: full create_all / drop_all.
    * Otherwise → shared dev DB: create_all only (no drop, no data loss).
    """
    _ensure_test_db_exists()

    engine = create_async_engine(_test_db_url(), echo=False, pool_pre_ping=True)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    if _is_isolated_db():
        # Safe to wipe — this is the test-only DB
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest.fixture(scope="session")
async def async_session_maker(test_engine):
    """Session factory bound to the test engine."""
    return async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )


# ---------------------------------------------------------------------------
# Per-test session: always rolled back so tests never commit data
# ---------------------------------------------------------------------------

@pytest.fixture
async def db_session(async_session_maker) -> AsyncGenerator[AsyncSession, None]:
    """One async session per test, always rolled back on teardown."""
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.rollback()


# ---------------------------------------------------------------------------
# HTTP clients
# ---------------------------------------------------------------------------

@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP client — no DB injection (for /health, /docs, etc.)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        yield client


@pytest.fixture
async def async_client_with_db(db_session) -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP client wired to the per-test DB session via dependency override."""
    from shared.db import database

    async def get_test_db():
        try:
            yield db_session
        except Exception:
            await db_session.rollback()
            raise

    app.dependency_overrides[database.get_db] = get_test_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        yield client

    app.dependency_overrides.pop(database.get_db, None)
