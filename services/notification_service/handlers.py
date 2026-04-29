"""Event handlers that auto-create Notification rows.

Each handler is an async function subscribed to a domain event via the
EventBus.  Handlers run outside the HTTP request lifecycle, so they open
their own AsyncSession rather than relying on the ``get_db`` dependency.

Register all handlers in ``gateway.main.startup``.
"""

from __future__ import annotations

import uuid

from shared.db.database import AsyncSessionLocal
from shared.db.models import Lease, MaintenanceRequest
from shared.events import Event
from shared.factories import NotificationFactory


async def _save(user_id: uuid.UUID, event_type: str, message: str) -> None:
    """Open a fresh session, write one notification, commit."""
    async with AsyncSessionLocal() as session:
        notif = NotificationFactory.create(
            user_id=user_id, event_type=event_type, message=message
        )
        session.add(notif)
        await session.commit()


# ---------------------------------------------------------------------------
# Lease events
# ---------------------------------------------------------------------------

async def on_lease_activated(event: Event) -> None:
    """Notify the tenant that their lease is now active."""
    lease_id = uuid.UUID(event.payload["lease_id"])
    async with AsyncSessionLocal() as session:
        lease: Lease | None = await session.get(Lease, lease_id)
        if lease is None:
            return
    await _save(
        lease.tenant_id,
        "lease.activated",
        "Your lease is now active. Welcome to your new home!",
    )


async def on_lease_terminated(event: Event) -> None:
    """Notify the tenant that their lease has been terminated."""
    lease_id = uuid.UUID(event.payload["lease_id"])
    async with AsyncSessionLocal() as session:
        lease: Lease | None = await session.get(Lease, lease_id)
        if lease is None:
            return
    await _save(
        lease.tenant_id,
        "lease.terminated",
        "Your lease has been terminated.",
    )


# ---------------------------------------------------------------------------
# Payment events
# ---------------------------------------------------------------------------

async def on_payment_created(event: Event) -> None:
    """Remind the tenant about an upcoming payment."""
    tenant_id = uuid.UUID(event.payload["tenant_id"])
    amount = event.payload["amount"]
    due_date = event.payload["due_date"]
    await _save(
        tenant_id,
        "payment.created",
        f"A rent payment of ${amount} is due on {due_date}.",
    )


async def on_payment_paid(event: Event) -> None:
    """Notify the tenant that their payment was received."""
    tenant_id = uuid.UUID(event.payload["tenant_id"])
    await _save(tenant_id, "payment.paid", "Your rent payment has been received. Thank you!")


async def on_payment_partial(event: Event) -> None:
    """Notify the tenant that their partial payment has been recorded."""
    tenant_id = uuid.UUID(event.payload["tenant_id"])
    await _save(tenant_id, "payment.partial", "Your partial rent payment has been recorded.")


async def on_payment_overdue(event: Event) -> None:
    """Alert the tenant that a payment is overdue."""
    tenant_id = uuid.UUID(event.payload["tenant_id"])
    late_fee = event.payload.get("late_fee", "0.00")
    msg = "Your rent payment is overdue."
    if float(late_fee) > 0:
        msg += f" A late fee of ${late_fee} has been applied."
    await _save(tenant_id, "payment.overdue", msg)


# ---------------------------------------------------------------------------
# Maintenance events
# ---------------------------------------------------------------------------

async def on_maintenance_created(event: Event) -> None:
    """Confirm to the tenant that their request was received."""
    tenant_id = uuid.UUID(event.payload["tenant_id"])
    title = event.payload["title"]
    await _save(
        tenant_id,
        "maintenance.created",
        f"Your maintenance request '{title}' has been received and is under review.",
    )


async def on_maintenance_assigned(event: Event) -> None:
    """Notify the assigned user that a request is waiting for them."""
    assigned_to = uuid.UUID(event.payload["assigned_to"])
    title = event.payload["title"]
    await _save(
        assigned_to,
        "maintenance.assigned",
        f"A maintenance request has been assigned to you: '{title}'.",
    )


async def on_maintenance_completed(event: Event) -> None:
    """Notify the tenant that their maintenance request is done."""
    tenant_id = uuid.UUID(event.payload["tenant_id"])
    title = event.payload["title"]
    await _save(
        tenant_id,
        "maintenance.completed",
        f"Your maintenance request '{title}' has been completed.",
    )
