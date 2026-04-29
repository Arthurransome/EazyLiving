"""Notification service — unit and integration tests.

Coverage:
  - List notifications (own only)
  - Mark single notification as read
  - Mark all notifications as read
  - Delete notification
  - Ownership enforcement (cannot read/delete another user's notification)
  - Handler unit tests: on_payment_paid, on_payment_partial, on_payment_overdue,
    on_maintenance_created, on_maintenance_completed
"""
import uuid
import pytest
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch

from shared.events import Event
from services.notification_service.handlers import (
    on_payment_paid,
    on_payment_partial,
    on_payment_overdue,
    on_maintenance_created,
    on_maintenance_completed,
    on_maintenance_assigned,
)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

async def _register_login(client: AsyncClient, email: str, name: str, role: str = "tenant") -> str:
    await client.post("/api/v1/auth/register", json={
        "email": email, "name": name, "password": "testpass123", "role": role,
    })
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": "testpass123"})
    return res.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _seed_notification(db_session, user_id: uuid.UUID, message: str = "test notif") -> str:
    """Insert a notification directly into the test session and return its ID."""
    from shared.factories import NotificationFactory
    notif = NotificationFactory.create(user_id=user_id, event_type="test.event", message=message)
    db_session.add(notif)
    await db_session.flush()
    return str(notif.notification_id)


async def _get_user_id(client: AsyncClient, token: str) -> uuid.UUID:
    res = await client.get("/api/v1/users/me", headers=_h(token))
    return uuid.UUID(res.json()["user_id"])


# ---------------------------------------------------------------------------
# Integration tests — notification endpoints
# ---------------------------------------------------------------------------

async def test_list_notifications_empty(async_client_with_db: AsyncClient):
    token = await _register_login(async_client_with_db, "ln_empty@notiftest.com", "LN Empty")
    res = await async_client_with_db.get("/api/v1/notifications", headers=_h(token))
    assert res.status_code == 200
    assert res.json() == []


async def test_list_notifications_returns_own(async_client_with_db: AsyncClient, db_session):
    token = await _register_login(async_client_with_db, "ln_own@notiftest.com", "LN Own")
    user_id = await _get_user_id(async_client_with_db, token)

    await _seed_notification(db_session, user_id, "Hello, tenant!")

    res = await async_client_with_db.get("/api/v1/notifications", headers=_h(token))
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["message"] == "Hello, tenant!"
    assert res.json()[0]["is_read"] is False


async def test_list_notifications_only_own(async_client_with_db: AsyncClient, db_session):
    """User must not see another user's notifications."""
    t1_token = await _register_login(async_client_with_db, "ln_t1@notiftest.com", "LN T1")
    t2_token = await _register_login(async_client_with_db, "ln_t2@notiftest.com", "LN T2")
    t1_id = await _get_user_id(async_client_with_db, t1_token)

    await _seed_notification(db_session, t1_id, "Only for T1")

    res = await async_client_with_db.get("/api/v1/notifications", headers=_h(t2_token))
    assert res.status_code == 200
    assert res.json() == []


async def test_mark_single_notification_read(async_client_with_db: AsyncClient, db_session):
    token = await _register_login(async_client_with_db, "mr_single@notiftest.com", "MR Single")
    user_id = await _get_user_id(async_client_with_db, token)
    notif_id = await _seed_notification(db_session, user_id)

    res = await async_client_with_db.post(f"/api/v1/notifications/{notif_id}/read", headers=_h(token))
    assert res.status_code == 200
    assert res.json()["is_read"] is True


async def test_cannot_mark_other_users_notification_read(async_client_with_db: AsyncClient, db_session):
    t1_token = await _register_login(async_client_with_db, "mr_t1@notiftest.com", "MR T1")
    t2_token = await _register_login(async_client_with_db, "mr_t2@notiftest.com", "MR T2")
    t1_id = await _get_user_id(async_client_with_db, t1_token)
    notif_id = await _seed_notification(db_session, t1_id)

    res = await async_client_with_db.post(f"/api/v1/notifications/{notif_id}/read", headers=_h(t2_token))
    assert res.status_code == 403


async def test_mark_all_notifications_read(async_client_with_db: AsyncClient, db_session):
    token = await _register_login(async_client_with_db, "mar_user@notiftest.com", "MAR User")
    user_id = await _get_user_id(async_client_with_db, token)

    await _seed_notification(db_session, user_id, "Notif 1")
    await _seed_notification(db_session, user_id, "Notif 2")

    res = await async_client_with_db.post("/api/v1/notifications/read-all", headers=_h(token))
    assert res.status_code == 204

    list_res = await async_client_with_db.get("/api/v1/notifications", headers=_h(token))
    assert all(n["is_read"] for n in list_res.json())


async def test_delete_notification(async_client_with_db: AsyncClient, db_session):
    token = await _register_login(async_client_with_db, "del_notif@notiftest.com", "Del Notif")
    user_id = await _get_user_id(async_client_with_db, token)
    notif_id = await _seed_notification(db_session, user_id)

    res = await async_client_with_db.delete(f"/api/v1/notifications/{notif_id}", headers=_h(token))
    assert res.status_code == 204

    list_res = await async_client_with_db.get("/api/v1/notifications", headers=_h(token))
    ids = [n["notification_id"] for n in list_res.json()]
    assert notif_id not in ids


async def test_cannot_delete_other_users_notification(async_client_with_db: AsyncClient, db_session):
    t1_token = await _register_login(async_client_with_db, "cd_t1@notiftest.com", "CD T1")
    t2_token = await _register_login(async_client_with_db, "cd_t2@notiftest.com", "CD T2")
    t1_id = await _get_user_id(async_client_with_db, t1_token)
    notif_id = await _seed_notification(db_session, t1_id)

    res = await async_client_with_db.delete(f"/api/v1/notifications/{notif_id}", headers=_h(t2_token))
    assert res.status_code == 403


async def test_notifications_require_auth(async_client_with_db: AsyncClient):
    res = await async_client_with_db.get("/api/v1/notifications")
    assert res.status_code == 401


# ---------------------------------------------------------------------------
# Handler unit tests — verify each handler calls _save with correct args
# ---------------------------------------------------------------------------

async def test_handler_on_payment_paid():
    user_id = uuid.uuid4()
    with patch("services.notification_service.handlers._save", new_callable=AsyncMock) as mock_save:
        await on_payment_paid(Event(name="payment.paid", payload={"tenant_id": str(user_id)}))
        mock_save.assert_called_once_with(user_id, "payment.paid", "Your rent payment has been received. Thank you!")


async def test_handler_on_payment_partial():
    user_id = uuid.uuid4()
    with patch("services.notification_service.handlers._save", new_callable=AsyncMock) as mock_save:
        await on_payment_partial(Event(name="payment.partial", payload={"tenant_id": str(user_id)}))
        mock_save.assert_called_once_with(user_id, "payment.partial", "Your partial rent payment has been recorded.")


async def test_handler_on_payment_overdue_no_fee():
    user_id = uuid.uuid4()
    with patch("services.notification_service.handlers._save", new_callable=AsyncMock) as mock_save:
        await on_payment_overdue(Event(name="payment.overdue", payload={"tenant_id": str(user_id), "late_fee": "0.00"}))
        call_args = mock_save.call_args[0]
        assert "overdue" in call_args[2].lower()
        assert "late fee" not in call_args[2].lower()


async def test_handler_on_payment_overdue_with_fee():
    user_id = uuid.uuid4()
    with patch("services.notification_service.handlers._save", new_callable=AsyncMock) as mock_save:
        await on_payment_overdue(Event(name="payment.overdue", payload={"tenant_id": str(user_id), "late_fee": "50.00"}))
        call_args = mock_save.call_args[0]
        assert "$50.00" in call_args[2]


async def test_handler_on_maintenance_created():
    user_id = uuid.uuid4()
    with patch("services.notification_service.handlers._save", new_callable=AsyncMock) as mock_save:
        await on_maintenance_created(Event(
            name="maintenance.created",
            payload={"tenant_id": str(user_id), "title": "Leaky tap", "request_id": str(uuid.uuid4()), "unit_id": str(uuid.uuid4())},
        ))
        call_args = mock_save.call_args[0]
        assert "Leaky tap" in call_args[2]


async def test_handler_on_maintenance_completed():
    user_id = uuid.uuid4()
    with patch("services.notification_service.handlers._save", new_callable=AsyncMock) as mock_save:
        await on_maintenance_completed(Event(
            name="maintenance.completed",
            payload={"tenant_id": str(user_id), "title": "Leaky tap", "request_id": str(uuid.uuid4())},
        ))
        call_args = mock_save.call_args[0]
        assert "completed" in call_args[2].lower()


async def test_handler_on_maintenance_assigned():
    assigned_to = uuid.uuid4()
    with patch("services.notification_service.handlers._save", new_callable=AsyncMock) as mock_save:
        await on_maintenance_assigned(Event(
            name="maintenance.assigned",
            payload={"assigned_to": str(assigned_to), "title": "Broken heater", "request_id": str(uuid.uuid4()), "tenant_id": str(uuid.uuid4())},
        ))
        call_args = mock_save.call_args[0]
        assert call_args[0] == assigned_to
        assert "Broken heater" in call_args[2]
