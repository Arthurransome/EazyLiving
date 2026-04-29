"""Factory pattern — model construction.

Each factory encapsulates the creation of a SQLAlchemy ORM model instance,
keeping that logic out of service classes and routers.  Factories do NOT
interact with the database session; they only build objects.  Persisting them
is the repository's responsibility.

Usage
-----
    from shared.factories import UserFactory, PropertyFactory

    user = UserFactory.create(
        email="alice@example.com",
        name="Alice",
        password_hash=hashed_pw,
        role=UserRole.OWNER,
    )
    # then hand to the repository: await user_repo.add(user)
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from shared.db.enums import LeaseRequestStatus, LeaseStatus, MaintenancePriority, MaintenanceStatus, PaymentStatus, UserRole
from shared.db.models import Lease, LeaseRequest, MaintenanceRequest, Notification, Payment, Property, Unit, User


class UserFactory:
    """Creates :class:`~shared.db.models.User` instances."""

    @staticmethod
    def create(
        *,
        email: str,
        name: str,
        password_hash: str,
        role: UserRole = UserRole.TENANT,
    ) -> User:
        """Return a new (unsaved) User with a generated UUID."""
        return User(
            user_id=uuid.uuid4(),
            email=email.lower().strip(),
            name=name.strip(),
            password_hash=password_hash,
            role=role,
            is_active=True,
        )


class PropertyFactory:
    """Creates :class:`~shared.db.models.Property` instances."""

    @staticmethod
    def create(
        *,
        owner_id: uuid.UUID,
        name: str,
        address: str,
        city: str | None = None,
        state: str | None = None,
        zip_code: str | None = None,
        manager_id: uuid.UUID | None = None,
    ) -> Property:
        """Return a new (unsaved) Property with a generated UUID."""
        return Property(
            property_id=uuid.uuid4(),
            owner_id=owner_id,
            manager_id=manager_id,
            name=name.strip(),
            address=address.strip(),
            city=city,
            state=state,
            zip_code=zip_code,
        )


class UnitFactory:
    """Creates :class:`~shared.db.models.Unit` instances."""

    @staticmethod
    def create(
        *,
        property_id: uuid.UUID,
        unit_number: str,
        monthly_rent: Decimal,
        bedrooms: int | None = None,
        bathrooms: int | None = None,
        square_feet: int | None = None,
    ) -> Unit:
        """Return a new (unsaved) Unit with a generated UUID."""
        return Unit(
            unit_id=uuid.uuid4(),
            property_id=property_id,
            unit_number=unit_number.strip(),
            monthly_rent=monthly_rent,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            square_feet=square_feet,
            is_occupied=False,
        )


class PaymentFactory:
    """Creates :class:`~shared.db.models.Payment` instances."""

    @staticmethod
    def create(
        *,
        lease_id: uuid.UUID,
        tenant_id: uuid.UUID,
        amount: Decimal,
        due_date: date,
        notes: str | None = None,
    ) -> Payment:
        """Return a new (unsaved) Payment in PENDING status."""
        return Payment(
            payment_id=uuid.uuid4(),
            lease_id=lease_id,
            tenant_id=tenant_id,
            amount=amount,
            due_date=due_date,
            notes=notes,
            status=PaymentStatus.PENDING,
            late_fee=Decimal("0.00"),
        )


class MaintenanceRequestFactory:
    """Creates :class:`~shared.db.models.MaintenanceRequest` instances."""

    @staticmethod
    def create(
        *,
        unit_id: uuid.UUID,
        tenant_id: uuid.UUID,
        title: str,
        description: str | None = None,
        priority: MaintenancePriority = MaintenancePriority.MEDIUM,
    ) -> MaintenanceRequest:
        """Return a new (unsaved) MaintenanceRequest in SUBMITTED status."""
        return MaintenanceRequest(
            request_id=uuid.uuid4(),
            unit_id=unit_id,
            tenant_id=tenant_id,
            title=title.strip(),
            description=description,
            priority=priority,
            status=MaintenanceStatus.SUBMITTED,
            escalated=False,
        )


class NotificationFactory:
    """Creates :class:`~shared.db.models.Notification` instances."""

    @staticmethod
    def create(
        *,
        user_id: uuid.UUID,
        event_type: str,
        message: str,
    ) -> Notification:
        """Return a new (unsaved) unread Notification."""
        return Notification(
            notification_id=uuid.uuid4(),
            user_id=user_id,
            event_type=event_type,
            message=message,
            is_read=False,
        )


class LeaseRequestFactory:
    """Creates :class:`~shared.db.models.LeaseRequest` instances."""

    @staticmethod
    def create(
        *,
        tenant_id: uuid.UUID,
        unit_id: uuid.UUID,
        desired_move_in: date,
        desired_move_out: date,
        message: str | None = None,
    ) -> LeaseRequest:
        return LeaseRequest(
            request_id=uuid.uuid4(),
            tenant_id=tenant_id,
            unit_id=unit_id,
            desired_move_in=desired_move_in,
            desired_move_out=desired_move_out,
            message=message,
            status=LeaseRequestStatus.PENDING,
        )


class LeaseFactory:
    """Creates :class:`~shared.db.models.Lease` instances."""

    @staticmethod
    def create(
        *,
        unit_id: uuid.UUID,
        tenant_id: uuid.UUID,
        start_date: date,
        end_date: date,
        monthly_rent: Decimal,
        security_deposit: Decimal | None = None,
    ) -> Lease:
        """Return a new (unsaved) Lease in DRAFT status with a generated UUID."""
        return Lease(
            lease_id=uuid.uuid4(),
            unit_id=unit_id,
            tenant_id=tenant_id,
            start_date=start_date,
            end_date=end_date,
            monthly_rent=monthly_rent,
            security_deposit=security_deposit,
            status=LeaseStatus.DRAFT,
        )
