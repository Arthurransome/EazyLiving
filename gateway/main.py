"""EazyLiving API Gateway.

This is the single entry point for the entire application.  All service
routers are registered here under the ``/api/v1`` prefix.

Run with::

    uvicorn gateway.main:app --reload
    # or
    fastapi dev gateway/main.py

Interactive docs:  http://localhost:8000/docs
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from gateway.admin import create_admin
from services.analytics_service.routers.analytics_router import router as analytics_router
from services.maintenance_service.routers.maintenance_router import router as maintenance_router
from services.notification_service.handlers import (
    on_lease_activated,
    on_lease_terminated,
    on_maintenance_assigned,
    on_maintenance_completed,
    on_maintenance_created,
    on_payment_created,
    on_payment_overdue,
    on_payment_paid,
    on_payment_partial,
)
from services.notification_service.routers.notification_router import router as notification_router
from services.payment_service.routers.payment_router import router as payment_router
from services.property_service.routers.lease_router import router as lease_router
from services.property_service.routers.property_router import router as property_router
from services.user_service.routers.user_router import router as user_router
from shared.db.config import settings
from shared.events import bus, log_event

# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="EazyLiving API",
    version="1.0.0",
    description=(
        "Property management system — users, properties, units, and leases. "
        "Authenticate via POST /api/v1/auth/login to obtain a Bearer token."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------
# SessionMiddleware must be added before the admin (it provides the signed-cookie
# session used by the admin authentication backend).
app.add_middleware(SessionMiddleware, secret_key=settings.JWT_SECRET)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Admin panel — /admin
# ---------------------------------------------------------------------------
create_admin(app)

# ---------------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup() -> None:
    """Register built-in event handlers on startup."""
    bus.subscribe("*", log_event)
    bus.subscribe("lease.activated", on_lease_activated)
    bus.subscribe("lease.terminated", on_lease_terminated)
    bus.subscribe("payment.created", on_payment_created)
    bus.subscribe("payment.paid", on_payment_paid)
    bus.subscribe("payment.partial", on_payment_partial)
    bus.subscribe("payment.overdue", on_payment_overdue)
    bus.subscribe("maintenance.created", on_maintenance_created)
    bus.subscribe("maintenance.assigned", on_maintenance_assigned)
    bus.subscribe("maintenance.completed", on_maintenance_completed)


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
API_PREFIX = "/api/v1"

app.include_router(user_router, prefix=API_PREFIX, tags=["Auth & Users"])
app.include_router(property_router, prefix=API_PREFIX, tags=["Properties & Units"])
app.include_router(lease_router, prefix=API_PREFIX, tags=["Leases"])
app.include_router(payment_router, prefix=API_PREFIX, tags=["Payments"])
app.include_router(maintenance_router, prefix=API_PREFIX, tags=["Maintenance"])
app.include_router(notification_router, prefix=API_PREFIX, tags=["Notifications"])
app.include_router(analytics_router, prefix=API_PREFIX, tags=["Analytics"])


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["Health"])
async def health() -> dict:
    return {"status": "ok"}
