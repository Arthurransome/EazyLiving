"""Add manager_id to properties.

Revision ID: 002
Revises: 001
Create Date: 2026-04-11
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "properties",
        sa.Column("manager_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_properties_manager_id_users",
        "properties", "users",
        ["manager_id"], ["user_id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_properties_manager_id", "properties", ["manager_id"])


def downgrade() -> None:
    op.drop_index("ix_properties_manager_id", table_name="properties")
    op.drop_constraint("fk_properties_manager_id_users", "properties", type_="foreignkey")
    op.drop_column("properties", "manager_id")
