"""Initial schema — all tables.

Revision ID: 001
Revises:
Create Date: 2026-04-11
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------ enums
    user_role = postgresql.ENUM(
        "owner", "manager", "tenant", "admin",
        name="user_role", create_type=True,
    )
    user_role.create(op.get_bind(), checkfirst=True)

    lease_status = postgresql.ENUM(
        "draft", "active", "expiring_soon", "expired", "renewed", "terminated",
        name="lease_status", create_type=True,
    )
    lease_status.create(op.get_bind(), checkfirst=True)

    payment_status = postgresql.ENUM(
        "pending", "paid", "partial", "overdue",
        name="payment_status", create_type=True,
    )
    payment_status.create(op.get_bind(), checkfirst=True)

    maintenance_priority = postgresql.ENUM(
        "low", "medium", "high", "emergency",
        name="maintenance_priority", create_type=True,
    )
    maintenance_priority.create(op.get_bind(), checkfirst=True)

    maintenance_status = postgresql.ENUM(
        "submitted", "assigned", "in_progress", "completed", "closed", "cancelled",
        name="maintenance_status", create_type=True,
    )
    maintenance_status.create(op.get_bind(), checkfirst=True)

    # ------------------------------------------------------------------ users
    op.create_table(
        "users",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column(
            "role",
            user_role,
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # -------------------------------------------------------------- properties
    op.create_table(
        "properties",
        sa.Column("property_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.user_id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("address", sa.Text(), nullable=False),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("state", sa.String(50), nullable=True),
        sa.Column("zip_code", sa.String(20), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_properties_owner_id", "properties", ["owner_id"])

    # ------------------------------------------------------------------- units
    op.create_table(
        "units",
        sa.Column("unit_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "property_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("properties.property_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("unit_number", sa.String(20), nullable=False),
        sa.Column("bedrooms", sa.Integer(), nullable=True),
        sa.Column("bathrooms", sa.Integer(), nullable=True),
        sa.Column("square_feet", sa.Integer(), nullable=True),
        sa.Column("monthly_rent", sa.Numeric(10, 2), nullable=False),
        sa.Column("is_occupied", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("property_id", "unit_number", name="uq_unit_property_number"),
    )
    op.create_index("ix_units_property_id", "units", ["property_id"])

    # ------------------------------------------------------------------ leases
    op.create_table(
        "leases",
        sa.Column("lease_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "unit_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("units.unit_id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.user_id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("monthly_rent", sa.Numeric(10, 2), nullable=False),
        sa.Column("security_deposit", sa.Numeric(10, 2), nullable=True),
        sa.Column(
            "status",
            lease_status,
            nullable=False,
            server_default="draft",
        ),
        sa.Column("document_ref", sa.String(64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_leases_unit_id", "leases", ["unit_id"])
    op.create_index("ix_leases_tenant_id", "leases", ["tenant_id"])
    op.create_index("ix_leases_status", "leases", ["status"])

    # ---------------------------------------------------------------- payments
    op.create_table(
        "payments",
        sa.Column("payment_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "lease_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("leases.lease_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.user_id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("payment_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "status",
            payment_status,
            nullable=False,
            server_default="pending",
        ),
        sa.Column("late_fee", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("receipt_ref", sa.String(64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_payments_lease_id", "payments", ["lease_id"])
    op.create_index("ix_payments_tenant_id", "payments", ["tenant_id"])
    op.create_index("ix_payments_due_date", "payments", ["due_date"])
    op.create_index("ix_payments_status", "payments", ["status"])

    # ---------------------------------------------------- maintenance_requests
    op.create_table(
        "maintenance_requests",
        sa.Column("request_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "unit_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("units.unit_id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.user_id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "assigned_to",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.user_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "priority",
            maintenance_priority,
            nullable=False,
            server_default="medium",
        ),
        sa.Column(
            "status",
            maintenance_status,
            nullable=False,
            server_default="submitted",
        ),
        sa.Column("escalated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_maintenance_requests_unit_id", "maintenance_requests", ["unit_id"])
    op.create_index("ix_maintenance_requests_tenant_id", "maintenance_requests", ["tenant_id"])
    op.create_index("ix_maintenance_requests_assigned_to", "maintenance_requests", ["assigned_to"])
    op.create_index("ix_maintenance_requests_priority", "maintenance_requests", ["priority"])
    op.create_index("ix_maintenance_requests_status", "maintenance_requests", ["status"])

    # ----------------------------------------------------------- notifications
    op.create_table(
        "notifications",
        sa.Column("notification_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.user_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_table("maintenance_requests")
    op.drop_table("payments")
    op.drop_table("leases")
    op.drop_table("units")
    op.drop_table("properties")
    op.drop_table("users")

    op.execute("DROP TYPE IF EXISTS maintenance_status")
    op.execute("DROP TYPE IF EXISTS maintenance_priority")
    op.execute("DROP TYPE IF EXISTS payment_status")
    op.execute("DROP TYPE IF EXISTS lease_status")
    op.execute("DROP TYPE IF EXISTS user_role")
