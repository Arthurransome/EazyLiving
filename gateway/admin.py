"""SQLAdmin integration — admin panel backed by SQLAlchemy.

Mounted at /admin on the main FastAPI app.

Authentication
--------------
Only users with role=ADMIN and is_active=True can log in to the admin.
Credentials are the same email/password used in the regular API.
Sessions are stored server-side via Starlette's SessionMiddleware (signed
cookie, secret = JWT_SECRET).

Access
------
  http://localhost:8000/admin/
"""

from __future__ import annotations

import uuid

from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from sqlalchemy import select
from starlette.requests import Request
from starlette.responses import Response

from gateway.auth import verify_password
from shared.db.config import settings
from shared.db.database import AsyncSessionLocal, engine
from shared.db.enums import UserRole
from shared.db.models import Lease, Property, Unit, User


# ---------------------------------------------------------------------------
# Authentication backend — ADMIN role only
# ---------------------------------------------------------------------------

class _AdminAuth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        form = await request.form()
        email = str(form.get("username", ""))
        password = str(form.get("password", ""))
        if not email or not password:
            return False

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(User).where(User.email == email, User.is_active.is_(True))
            )
            user = result.scalar_one_or_none()

        if user is None or user.role != UserRole.ADMIN:
            return False
        if not verify_password(password, user.password_hash):
            return False

        request.session.update({"admin_uid": str(user.user_id)})
        return True

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> Response | bool:
        uid = request.session.get("admin_uid")
        if not uid:
            return False
        async with AsyncSessionLocal() as session:
            user = await session.get(User, uuid.UUID(uid))
        return user is not None and user.is_active and user.role == UserRole.ADMIN


_auth_backend = _AdminAuth(secret_key=settings.JWT_SECRET)


# ---------------------------------------------------------------------------
# Model views
# ---------------------------------------------------------------------------

class UserAdmin(ModelView, model=User):
    icon = "fa-solid fa-users"
    name = "User"
    name_plural = "Users"

    column_list = [
        User.user_id, User.email, User.name,
        User.role, User.is_active, User.created_at,
    ]
    column_searchable_list = [User.email, User.name]
    column_sortable_list = [User.email, User.role, User.is_active, User.created_at]
    column_default_sort = [(User.created_at, True)]

    # Never expose the password hash through the admin UI
    form_excluded_columns = [
        User.password_hash,
        User.owned_properties,
        User.leases,
        User.payments,
        User.submitted_requests,
        User.assigned_requests,
        User.notifications,
    ]
    # Creating users via admin bypasses hashing — use /auth/register instead
    can_create = False


class PropertyAdmin(ModelView, model=Property):
    icon = "fa-solid fa-building"
    name = "Property"
    name_plural = "Properties"

    column_list = [
        Property.property_id, Property.name, Property.address,
        Property.city, Property.state, Property.zip_code, Property.created_at,
    ]
    column_searchable_list = [Property.name, Property.city, Property.address]
    column_sortable_list = [Property.name, Property.city, Property.created_at]
    form_excluded_columns = [Property.units, Property.owner]


class UnitAdmin(ModelView, model=Unit):
    icon = "fa-solid fa-door-open"
    name = "Unit"
    name_plural = "Units"

    column_list = [
        Unit.unit_id, Unit.unit_number, Unit.bedrooms, Unit.bathrooms,
        Unit.square_feet, Unit.monthly_rent, Unit.is_occupied,
    ]
    column_sortable_list = [
        Unit.unit_number, Unit.monthly_rent, Unit.is_occupied,
        Unit.bedrooms, Unit.bathrooms,
    ]
    form_excluded_columns = [Unit.leases, Unit.maintenance_requests, Unit.property]


class LeaseAdmin(ModelView, model=Lease):
    icon = "fa-solid fa-file-contract"
    name = "Lease"
    name_plural = "Leases"

    column_list = [
        Lease.lease_id, Lease.status, Lease.start_date, Lease.end_date,
        Lease.monthly_rent, Lease.security_deposit, Lease.created_at,
    ]
    column_sortable_list = [
        Lease.start_date, Lease.end_date, Lease.status,
        Lease.monthly_rent, Lease.created_at,
    ]
    form_excluded_columns = [Lease.payments, Lease.unit, Lease.tenant]


# ---------------------------------------------------------------------------
# Factory — called once from gateway/main.py
# ---------------------------------------------------------------------------

def create_admin(app) -> Admin:
    """Attach an SQLAdmin instance to *app* and return it."""
    admin = Admin(
        app,
        engine,
        title="EazyLiving Admin",
        authentication_backend=_auth_backend,
    )
    admin.add_view(UserAdmin)
    admin.add_view(PropertyAdmin)
    admin.add_view(UnitAdmin)
    admin.add_view(LeaseAdmin)
    return admin
