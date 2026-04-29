"""Tests for database migrations — verify enum types are created correctly."""
import pytest
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from shared.db.config import settings


@pytest.mark.asyncio
async def test_user_role_enum_exists():
    """Verify user_role enum type exists in the database."""
    engine = create_async_engine(settings.DATABASE_URL)
    
    async with engine.connect() as conn:
        result = await conn.execute(
            text(
                "SELECT EXISTS ("
                "  SELECT 1 FROM pg_type WHERE typname = 'user_role'"
                ")"
            )
        )
        enum_exists = result.scalar()
        assert enum_exists, "user_role enum should exist in the database"
    
    await engine.dispose()


@pytest.mark.asyncio
async def test_all_enum_types_exist():
    """Verify all required enum types exist without duplicates."""
    engine = create_async_engine(settings.DATABASE_URL)
    required_enums = [
        "user_role",
        "lease_status",
        "payment_status",
        "maintenance_priority",
        "maintenance_status",
    ]
    
    async with engine.connect() as conn:
        for enum_name in required_enums:
            result = await conn.execute(
                text(
                    "SELECT COUNT(*) FROM pg_type WHERE typname = :enum_name"
                ),
                {"enum_name": enum_name}
            )
            count = result.scalar()
            assert count == 1, f"Enum '{enum_name}' should exist exactly once, found {count}"
    
    await engine.dispose()


@pytest.mark.asyncio
async def test_user_role_enum_values():
    """Verify user_role enum has correct values."""
    engine = create_async_engine(settings.DATABASE_URL)
    expected_values = {"ADMIN", "MANAGER", "OWNER", "TENANT"}
    
    async with engine.connect() as conn:
        result = await conn.execute(
            text(
                "SELECT enum_range(NULL::user_role)::text[] as values"
            )
        )
        row = result.first()
        if row:
            enum_values = set(row[0]) if row[0] else set()
            assert enum_values == expected_values, \
                f"user_role values should be {expected_values}, got {enum_values}"
    
    await engine.dispose()


@pytest.mark.asyncio
async def test_users_table_exists():
    engine = create_async_engine(settings.DATABASE_URL)

    async with engine.connect() as conn:

        def check(sync_conn):
            inspector = inspect(sync_conn)

            tables = inspector.get_table_names()
            assert "users" in tables

            columns = {col["name"] for col in inspector.get_columns("users")}
            expected = {"user_id", "email","name", "password_hash", "role", "is_active", "created_at", "updated_at"}
            assert expected.issubset(columns)

        # Run ALL inspection inside run_sync
        await conn.run_sync(check)
