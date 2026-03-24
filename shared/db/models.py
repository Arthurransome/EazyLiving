import uuid
from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import (
    Boolean, Column, Date, DateTime, Enum, ForeignKey,
    Integer, Numeric, String, Text, UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, relationship

from shared.db.enums import (
    LeaseStatus, MaintenancePriority, MaintenanceStatus,
    PaymentStatus, UserRole,
)


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# users
# ---------------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"

    user_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: str = Column(String(255), unique=True, nullable=False, index=True)
    name: str = Column(String(100), nullable=False)
    password_hash: str = Column(String(255), nullable=False)
    role: UserRole = Column(
        Enum(UserRole, name="user_role"), nullable=False, default=UserRole.TENANT
    )
    is_active: bool = Column(Boolean, nullable=False, default=True)
    created_at: datetime = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: datetime = Column(
        DateTime(timezone=True), onupdate=func.now()
    )

    # relationships
    owned_properties = relationship(
        "Property", back_populates="owner", foreign_keys="Property.owner_id"
    )
    leases = relationship(
        "Lease", back_populates="tenant", foreign_keys="Lease.tenant_id"
    )
    payments = relationship(
        "Payment", back_populates="tenant", foreign_keys="Payment.tenant_id"
    )
    submitted_requests = relationship(
        "MaintenanceRequest",
        back_populates="tenant",
        foreign_keys="MaintenanceRequest.tenant_id",
    )
    assigned_requests = relationship(
        "MaintenanceRequest",
        back_populates="assignee",
        foreign_keys="MaintenanceRequest.assigned_to",
    )
    notifications = relationship("Notification", back_populates="user")

    def __repr__(self) -> str:
        return f"<User {self.email} ({self.role})>"


# ---------------------------------------------------------------------------
# properties
# ---------------------------------------------------------------------------
class Property(Base):
    __tablename__ = "properties"

    property_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    owner_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name: str = Column(String(100), nullable=False)
    address: str = Column(Text, nullable=False)
    city: str = Column(String(100))
    state: str = Column(String(50))
    zip_code: str = Column(String(20))
    created_at: datetime = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # relationships
    owner = relationship("User", back_populates="owned_properties", foreign_keys=[owner_id])
    units = relationship("Unit", back_populates="property", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Property {self.name}>"


# ---------------------------------------------------------------------------
# units
# ---------------------------------------------------------------------------
class Unit(Base):
    __tablename__ = "units"
    __table_args__ = (
        UniqueConstraint("property_id", "unit_number", name="uq_unit_property_number"),
    )

    unit_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    property_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("properties.property_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    unit_number: str = Column(String(20), nullable=False)
    bedrooms: int = Column(Integer)
    bathrooms: int = Column(Integer)
    square_feet: int = Column(Integer)
    monthly_rent: Decimal = Column(Numeric(10, 2), nullable=False)
    is_occupied: bool = Column(Boolean, nullable=False, default=False)

    # relationships
    property = relationship("Property", back_populates="units")
    leases = relationship("Lease", back_populates="unit")
    maintenance_requests = relationship(
        "MaintenanceRequest", back_populates="unit"
    )

    def __repr__(self) -> str:
        return f"<Unit {self.unit_number}>"


# ---------------------------------------------------------------------------
# leases
# ---------------------------------------------------------------------------
class Lease(Base):
    __tablename__ = "leases"

    lease_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    unit_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("units.unit_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    tenant_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    start_date: date = Column(Date, nullable=False)
    end_date: date = Column(Date, nullable=False)
    monthly_rent: Decimal = Column(Numeric(10, 2), nullable=False)
    security_deposit: Decimal = Column(Numeric(10, 2))
    status: LeaseStatus = Column(
        Enum(LeaseStatus, name="lease_status"),
        nullable=False,
        default=LeaseStatus.DRAFT,
        index=True,
    )
    # ref to a MongoDB document _id (stored as string)
    document_ref: str = Column(String(64))
    created_at: datetime = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: datetime = Column(
        DateTime(timezone=True), onupdate=func.now()
    )

    # relationships
    unit = relationship("Unit", back_populates="leases")
    tenant = relationship("User", back_populates="leases", foreign_keys=[tenant_id])
    payments = relationship("Payment", back_populates="lease", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Lease {self.lease_id} [{self.status}]>"


# ---------------------------------------------------------------------------
# payments
# ---------------------------------------------------------------------------
class Payment(Base):
    __tablename__ = "payments"

    payment_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    lease_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("leases.lease_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tenant_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    amount: Decimal = Column(Numeric(10, 2), nullable=False)
    due_date: date = Column(Date, nullable=False, index=True)
    payment_date: datetime = Column(DateTime(timezone=True))
    status: PaymentStatus = Column(
        Enum(PaymentStatus, name="payment_status"),
        nullable=False,
        default=PaymentStatus.PENDING,
        index=True,
    )
    late_fee: Decimal = Column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    notes: str = Column(Text)
    # ref to receipt PDF in MongoDB
    receipt_ref: str = Column(String(64))
    created_at: datetime = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # relationships
    lease = relationship("Lease", back_populates="payments")
    tenant = relationship("User", back_populates="payments", foreign_keys=[tenant_id])

    def __repr__(self) -> str:
        return f"<Payment {self.payment_id} [{self.status}]>"


# ---------------------------------------------------------------------------
# maintenance_requests
# ---------------------------------------------------------------------------
class MaintenanceRequest(Base):
    __tablename__ = "maintenance_requests"

    request_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    unit_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("units.unit_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    tenant_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    assigned_to: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title: str = Column(String(200), nullable=False)
    description: str = Column(Text)
    priority: MaintenancePriority = Column(
        Enum(MaintenancePriority, name="maintenance_priority"),
        nullable=False,
        default=MaintenancePriority.MEDIUM,
        index=True,
    )
    status: MaintenanceStatus = Column(
        Enum(MaintenanceStatus, name="maintenance_status"),
        nullable=False,
        default=MaintenanceStatus.SUBMITTED,
        index=True,
    )
    escalated: bool = Column(Boolean, nullable=False, default=False)
    created_at: datetime = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: datetime = Column(
        DateTime(timezone=True), onupdate=func.now()
    )

    # relationships
    unit = relationship("Unit", back_populates="maintenance_requests")
    tenant = relationship(
        "User", back_populates="submitted_requests", foreign_keys=[tenant_id]
    )
    assignee = relationship(
        "User", back_populates="assigned_requests", foreign_keys=[assigned_to]
    )

    def __repr__(self) -> str:
        return f"<MaintenanceRequest {self.title!r} [{self.status}]>"


# ---------------------------------------------------------------------------
# notifications
# ---------------------------------------------------------------------------
class Notification(Base):
    __tablename__ = "notifications"

    notification_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type: str = Column(String(100), nullable=False)
    message: str = Column(Text, nullable=False)
    is_read: bool = Column(Boolean, nullable=False, default=False)
    created_at: datetime = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # relationships
    user = relationship("User", back_populates="notifications")

    def __repr__(self) -> str:
        return f"<Notification {self.event_type} → user {self.user_id}>"