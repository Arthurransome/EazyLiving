"""Maintenance service — unit and integration tests.

Coverage:
  - Create maintenance requests
  - Role-based list filtering (tenant sees own; staff sees all)
  - State machine transitions: assign → start → complete → close
  - Cancellation rules (tenant can cancel own SUBMITTED only)
  - Escalation (manager/admin only)
  - Permission enforcement
"""
from datetime import date, timedelta
from httpx import AsyncClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _register_login(client: AsyncClient, email: str, name: str, role: str) -> str:
    await client.post("/api/v1/auth/register", json={
        "email": email, "name": name, "password": "testpass123", "role": role,
    })
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": "testpass123"})
    return res.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _setup_unit(client: AsyncClient, owner_token: str) -> str:
    """Create property + unit, return unit_id."""
    prop = await client.post("/api/v1/properties", headers=_h(owner_token), json={
        "name": "Maint Test Prop", "address": "99 Fix St",
        "city": "Bristol", "state": "TN", "zip_code": "37620",
    })
    prop_id = prop.json()["property_id"]
    unit = await client.post(f"/api/v1/properties/{prop_id}/units", headers=_h(owner_token), json={
        "unit_number": "M1", "monthly_rent": "1000.00",
        "bedrooms": 1, "bathrooms": 1, "square_feet": 600,
    })
    return unit.json()["unit_id"]


async def _create_request(client: AsyncClient, token: str, unit_id: str, title: str = "Fix the tap") -> str:
    res = await client.post("/api/v1/maintenance-requests", headers=_h(token), json={
        "unit_id": unit_id, "title": title, "description": "It drips.", "priority": "medium",
    })
    assert res.status_code == 201
    return res.json()["request_id"]


async def _get_user_id(client: AsyncClient, token: str) -> str:
    res = await client.get("/api/v1/users/me", headers=_h(token))
    return res.json()["user_id"]


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

async def test_create_maintenance_request(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "cr_owner@mainttest.com", "CR Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "cr_tenant@mainttest.com", "CR Tenant", "tenant")
    unit_id = await _setup_unit(async_client_with_db, owner_token)

    res = await async_client_with_db.post("/api/v1/maintenance-requests", headers=_h(tenant_token), json={
        "unit_id": unit_id, "title": "Broken window", "priority": "high",
    })
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "submitted"
    assert data["title"] == "Broken window"
    assert data["escalated"] is False


async def test_create_request_nonexistent_unit(async_client_with_db: AsyncClient):
    tenant_token = await _register_login(async_client_with_db, "crn_tenant@mainttest.com", "CRN Tenant", "tenant")
    import uuid
    res = await async_client_with_db.post("/api/v1/maintenance-requests", headers=_h(tenant_token), json={
        "unit_id": str(uuid.uuid4()), "title": "Ghost unit", "priority": "low",
    })
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# List — role filtering
# ---------------------------------------------------------------------------

async def test_tenant_sees_only_own_requests(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "ls_owner@mainttest.com", "LS Owner", "owner")
    t1_token = await _register_login(async_client_with_db, "ls_t1@mainttest.com", "LS T1", "tenant")
    t2_token = await _register_login(async_client_with_db, "ls_t2@mainttest.com", "LS T2", "tenant")
    unit_id = await _setup_unit(async_client_with_db, owner_token)

    t1_id = await _get_user_id(async_client_with_db, t1_token)
    await _create_request(async_client_with_db, t1_token, unit_id, "T1 request")

    res = await async_client_with_db.get("/api/v1/maintenance-requests", headers=_h(t2_token))
    assert res.status_code == 200
    for req in res.json():
        assert req["tenant_id"] != t1_id


async def test_manager_sees_requests_for_assigned_property(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "ms_owner@mainttest.com", "MS Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "ms_tenant@mainttest.com", "MS Tenant", "tenant")
    manager_token = await _register_login(async_client_with_db, "ms_mgr@mainttest.com", "MS Manager", "manager")

    # Create property + unit, then assign the manager to that property
    prop = await async_client_with_db.post("/api/v1/properties", headers=_h(owner_token), json={
        "name": "MS Prop", "address": "1 MS St", "city": "Bristol", "state": "TN", "zip_code": "37620",
    })
    prop_id = prop.json()["property_id"]
    unit = await async_client_with_db.post(f"/api/v1/properties/{prop_id}/units", headers=_h(owner_token), json={
        "unit_number": "MS1", "monthly_rent": "1000.00", "bedrooms": 1, "bathrooms": 1, "square_feet": 600,
    })
    unit_id = unit.json()["unit_id"]
    manager_id = await _get_user_id(async_client_with_db, manager_token)

    # Assign manager to this property (requires admin — use owner token; actually owner can't, we need admin)
    # Owner assigns manager via the assign endpoint (admin-only). Register an admin to do this.
    admin_token = await _register_login(async_client_with_db, "ms_admin@mainttest.com", "MS Admin", "admin")
    await async_client_with_db.put(
        f"/api/v1/properties/{prop_id}/manager",
        headers=_h(admin_token),
        json={"manager_id": str(manager_id)},
    )

    await _create_request(async_client_with_db, tenant_token, unit_id, "Manager visible request")

    res = await async_client_with_db.get("/api/v1/maintenance-requests", headers=_h(manager_token))
    assert res.status_code == 200
    titles = [r["title"] for r in res.json()]
    assert "Manager visible request" in titles


# ---------------------------------------------------------------------------
# State machine: assign → start → complete → close
# ---------------------------------------------------------------------------

async def test_full_state_machine_flow(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "sm_owner@mainttest.com", "SM Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "sm_tenant@mainttest.com", "SM Tenant", "tenant")
    manager_token = await _register_login(async_client_with_db, "sm_mgr@mainttest.com", "SM Manager", "manager")
    unit_id = await _setup_unit(async_client_with_db, owner_token)
    req_id = await _create_request(async_client_with_db, tenant_token, unit_id, "Full flow request")
    manager_id = await _get_user_id(async_client_with_db, manager_token)

    # assign
    res = await async_client_with_db.put(
        f"/api/v1/maintenance-requests/{req_id}",
        headers=_h(manager_token),
        json={"event": "assign", "assigned_to": manager_id},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "assigned"

    # start
    res = await async_client_with_db.put(
        f"/api/v1/maintenance-requests/{req_id}",
        headers=_h(manager_token),
        json={"event": "start"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "in_progress"

    # complete
    res = await async_client_with_db.put(
        f"/api/v1/maintenance-requests/{req_id}",
        headers=_h(manager_token),
        json={"event": "complete"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "completed"

    # close
    res = await async_client_with_db.put(
        f"/api/v1/maintenance-requests/{req_id}",
        headers=_h(manager_token),
        json={"event": "close"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "closed"


async def test_assign_without_assigned_to_returns_422(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "aw_owner@mainttest.com", "AW Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "aw_tenant@mainttest.com", "AW Tenant", "tenant")
    manager_token = await _register_login(async_client_with_db, "aw_mgr@mainttest.com", "AW Manager", "manager")
    unit_id = await _setup_unit(async_client_with_db, owner_token)
    req_id = await _create_request(async_client_with_db, tenant_token, unit_id)

    res = await async_client_with_db.put(
        f"/api/v1/maintenance-requests/{req_id}",
        headers=_h(manager_token),
        json={"event": "assign"},
    )
    assert res.status_code == 422


async def test_cannot_start_without_assigning_first(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "cs_owner@mainttest.com", "CS Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "cs_tenant@mainttest.com", "CS Tenant", "tenant")
    manager_token = await _register_login(async_client_with_db, "cs_mgr@mainttest.com", "CS Manager", "manager")
    unit_id = await _setup_unit(async_client_with_db, owner_token)
    req_id = await _create_request(async_client_with_db, tenant_token, unit_id)

    res = await async_client_with_db.put(
        f"/api/v1/maintenance-requests/{req_id}",
        headers=_h(manager_token),
        json={"event": "start"},
    )
    assert res.status_code == 409


# ---------------------------------------------------------------------------
# Cancellation
# ---------------------------------------------------------------------------

async def test_tenant_can_cancel_own_submitted_request(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "tc_owner@mainttest.com", "TC Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "tc_tenant@mainttest.com", "TC Tenant", "tenant")
    unit_id = await _setup_unit(async_client_with_db, owner_token)
    req_id = await _create_request(async_client_with_db, tenant_token, unit_id)

    res = await async_client_with_db.put(
        f"/api/v1/maintenance-requests/{req_id}",
        headers=_h(tenant_token),
        json={"event": "cancel"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"


async def test_tenant_cannot_cancel_assigned_request(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "tca_owner@mainttest.com", "TCA Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "tca_tenant@mainttest.com", "TCA Tenant", "tenant")
    manager_token = await _register_login(async_client_with_db, "tca_mgr@mainttest.com", "TCA Manager", "manager")
    unit_id = await _setup_unit(async_client_with_db, owner_token)
    req_id = await _create_request(async_client_with_db, tenant_token, unit_id)
    manager_id = await _get_user_id(async_client_with_db, manager_token)

    await async_client_with_db.put(
        f"/api/v1/maintenance-requests/{req_id}",
        headers=_h(manager_token),
        json={"event": "assign", "assigned_to": manager_id},
    )

    res = await async_client_with_db.put(
        f"/api/v1/maintenance-requests/{req_id}",
        headers=_h(tenant_token),
        json={"event": "cancel"},
    )
    assert res.status_code == 409


async def test_tenant_cannot_cancel_other_tenants_request(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "tco_owner@mainttest.com", "TCO Owner", "owner")
    t1_token = await _register_login(async_client_with_db, "tco_t1@mainttest.com", "TCO T1", "tenant")
    t2_token = await _register_login(async_client_with_db, "tco_t2@mainttest.com", "TCO T2", "tenant")
    unit_id = await _setup_unit(async_client_with_db, owner_token)
    req_id = await _create_request(async_client_with_db, t1_token, unit_id)

    res = await async_client_with_db.put(
        f"/api/v1/maintenance-requests/{req_id}",
        headers=_h(t2_token),
        json={"event": "cancel"},
    )
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# Escalation
# ---------------------------------------------------------------------------

async def test_manager_can_escalate(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "esc_owner@mainttest.com", "ESC Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "esc_tenant@mainttest.com", "ESC Tenant", "tenant")
    manager_token = await _register_login(async_client_with_db, "esc_mgr@mainttest.com", "ESC Manager", "manager")
    unit_id = await _setup_unit(async_client_with_db, owner_token)
    req_id = await _create_request(async_client_with_db, tenant_token, unit_id)

    res = await async_client_with_db.put(
        f"/api/v1/maintenance-requests/{req_id}",
        headers=_h(manager_token),
        json={"event": "escalate"},
    )
    assert res.status_code == 200
    assert res.json()["escalated"] is True


async def test_tenant_cannot_escalate(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "tce_owner@mainttest.com", "TCE Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "tce_tenant@mainttest.com", "TCE Tenant", "tenant")
    unit_id = await _setup_unit(async_client_with_db, owner_token)
    req_id = await _create_request(async_client_with_db, tenant_token, unit_id)

    res = await async_client_with_db.put(
        f"/api/v1/maintenance-requests/{req_id}",
        headers=_h(tenant_token),
        json={"event": "escalate"},
    )
    assert res.status_code == 403


async def test_unknown_event_returns_422(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "ue_owner@mainttest.com", "UE Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "ue_tenant@mainttest.com", "UE Tenant", "tenant")
    manager_token = await _register_login(async_client_with_db, "ue_mgr@mainttest.com", "UE Manager", "manager")
    unit_id = await _setup_unit(async_client_with_db, owner_token)
    req_id = await _create_request(async_client_with_db, tenant_token, unit_id)

    res = await async_client_with_db.put(
        f"/api/v1/maintenance-requests/{req_id}",
        headers=_h(manager_token),
        json={"event": "teleport"},
    )
    assert res.status_code == 422


async def test_unauthenticated_maintenance_access_denied(async_client_with_db: AsyncClient):
    res = await async_client_with_db.get("/api/v1/maintenance-requests")
    assert res.status_code == 401
