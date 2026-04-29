"""Lease-request workflow — integration tests.

Coverage:
  - Tenant submits request for an available unit
  - Tenant cannot request an occupied unit
  - Tenant cannot double-submit to same unit
  - Tenant sees only own requests
  - Manager sees only requests for their property (pending_only filter)
  - Manager approves → lease created, unit occupied, other pending requests auto-rejected
  - Manager rejects → request rejected, unit still available
  - Non-manager cannot approve/reject
  - Available units listing (GET /units/available)
  - Manager can manually mark unit unavailable (is_available toggle)
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


async def _get_user_id(client: AsyncClient, token: str) -> str:
    return (await client.get("/api/v1/users/me", headers=_h(token))).json()["user_id"]


_MOVE_IN = str(date.today() + timedelta(days=30))
_MOVE_OUT = str(date.today() + timedelta(days=395))

_DATES = {
    "desired_move_in": _MOVE_IN,
    "desired_move_out": _MOVE_OUT,
}

_LEASE_DATES = {
    "start_date": _MOVE_IN,
    "end_date": _MOVE_OUT,
}


async def _setup(client: AsyncClient):
    """Create owner, manager, admin; property; unit; assign manager. Return dict of tokens + ids."""
    owner = await _register_login(client, "lr_owner@lrtest.com", "LR Owner", "owner")
    mgr = await _register_login(client, "lr_mgr@lrtest.com", "LR Manager", "manager")
    admin = await _register_login(client, "lr_admin@lrtest.com", "LR Admin", "admin")
    mgr_id = await _get_user_id(client, mgr)

    prop = await client.post("/api/v1/properties", headers=_h(owner), json={
        "name": "LR Prop", "address": "1 LR St", "city": "Bristol", "state": "TN", "zip_code": "37620",
    })
    prop_id = prop.json()["property_id"]

    unit = await client.post(f"/api/v1/properties/{prop_id}/units", headers=_h(owner), json={
        "unit_number": "LR1", "monthly_rent": "1200.00", "bedrooms": 1, "bathrooms": 1, "square_feet": 650,
    })
    unit_id = unit.json()["unit_id"]

    await client.put(f"/api/v1/properties/{prop_id}/manager", headers=_h(admin), json={"manager_id": mgr_id})

    return {"owner": owner, "mgr": mgr, "admin": admin, "prop_id": prop_id, "unit_id": unit_id, "mgr_id": mgr_id}


# ---------------------------------------------------------------------------
# Available units
# ---------------------------------------------------------------------------

async def test_available_units_listed(async_client_with_db: AsyncClient):
    ctx = await _setup(async_client_with_db)
    tenant = await _register_login(async_client_with_db, "av_t@lrtest.com", "AV Tenant", "tenant")

    res = await async_client_with_db.get("/api/v1/units/available", headers=_h(tenant))
    assert res.status_code == 200
    ids = [u["unit_id"] for u in res.json()]
    assert ctx["unit_id"] in ids


async def test_occupied_unit_not_listed_as_available(async_client_with_db: AsyncClient):
    ctx = await _setup(async_client_with_db)
    tenant = await _register_login(async_client_with_db, "oa_t@lrtest.com", "OA Tenant", "tenant")
    tenant_id = await _get_user_id(async_client_with_db, tenant)

    # Directly create + activate a lease (manager action) to occupy the unit
    lease = await async_client_with_db.post("/api/v1/leases", headers=_h(ctx["mgr"]), json={
        "unit_id": ctx["unit_id"], "tenant_id": tenant_id,
        **_LEASE_DATES, "monthly_rent": "1200.00",
    })
    await async_client_with_db.post(f"/api/v1/leases/{lease.json()['lease_id']}/activate", headers=_h(ctx["mgr"]))

    res = await async_client_with_db.get("/api/v1/units/available", headers=_h(tenant))
    ids = [u["unit_id"] for u in res.json()]
    assert ctx["unit_id"] not in ids


# ---------------------------------------------------------------------------
# Submit lease request
# ---------------------------------------------------------------------------

async def test_tenant_submits_lease_request(async_client_with_db: AsyncClient):
    ctx = await _setup(async_client_with_db)
    tenant = await _register_login(async_client_with_db, "slr_t@lrtest.com", "SLR Tenant", "tenant")

    res = await async_client_with_db.post("/api/v1/lease-requests", headers=_h(tenant), json={
        "unit_id": ctx["unit_id"], **_DATES,
    })
    assert res.status_code == 201
    assert res.json()["status"] == "pending"


async def test_non_tenant_cannot_submit(async_client_with_db: AsyncClient):
    ctx = await _setup(async_client_with_db)
    res = await async_client_with_db.post("/api/v1/lease-requests", headers=_h(ctx["mgr"]), json={
        "unit_id": ctx["unit_id"], **_DATES,
    })
    assert res.status_code == 403


async def test_tenant_cannot_double_submit(async_client_with_db: AsyncClient):
    ctx = await _setup(async_client_with_db)
    tenant = await _register_login(async_client_with_db, "ds_t@lrtest.com", "DS Tenant", "tenant")
    payload = {"unit_id": ctx["unit_id"], **_DATES}

    await async_client_with_db.post("/api/v1/lease-requests", headers=_h(tenant), json=payload)
    res = await async_client_with_db.post("/api/v1/lease-requests", headers=_h(tenant), json=payload)
    assert res.status_code == 409


async def test_cannot_request_occupied_unit(async_client_with_db: AsyncClient):
    ctx = await _setup(async_client_with_db)
    t1 = await _register_login(async_client_with_db, "occ_t1@lrtest.com", "OCC T1", "tenant")
    t2 = await _register_login(async_client_with_db, "occ_t2@lrtest.com", "OCC T2", "tenant")
    t1_id = await _get_user_id(async_client_with_db, t1)

    # Occupy the unit via direct lease
    lease = await async_client_with_db.post("/api/v1/leases", headers=_h(ctx["mgr"]), json={
        "unit_id": ctx["unit_id"], "tenant_id": t1_id,
        **_LEASE_DATES, "monthly_rent": "1200.00",
    })
    await async_client_with_db.post(f"/api/v1/leases/{lease.json()['lease_id']}/activate", headers=_h(ctx["mgr"]))

    res = await async_client_with_db.post("/api/v1/lease-requests", headers=_h(t2), json={
        "unit_id": ctx["unit_id"], **_DATES,
    })
    assert res.status_code == 409


# ---------------------------------------------------------------------------
# List requests
# ---------------------------------------------------------------------------

async def test_tenant_sees_own_requests_only(async_client_with_db: AsyncClient):
    ctx = await _setup(async_client_with_db)
    t1 = await _register_login(async_client_with_db, "ts_t1@lrtest.com", "TS T1", "tenant")
    t2 = await _register_login(async_client_with_db, "ts_t2@lrtest.com", "TS T2", "tenant")

    await async_client_with_db.post("/api/v1/lease-requests", headers=_h(t1), json={"unit_id": ctx["unit_id"], **_DATES})

    res = await async_client_with_db.get("/api/v1/lease-requests", headers=_h(t2))
    assert res.status_code == 200
    assert res.json() == []


async def test_manager_sees_pending_for_their_property(async_client_with_db: AsyncClient):
    ctx = await _setup(async_client_with_db)
    tenant = await _register_login(async_client_with_db, "mp_t@lrtest.com", "MP Tenant", "tenant")

    await async_client_with_db.post("/api/v1/lease-requests", headers=_h(tenant), json={"unit_id": ctx["unit_id"], **_DATES})

    res = await async_client_with_db.get("/api/v1/lease-requests?pending_only=true", headers=_h(ctx["mgr"]))
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["status"] == "pending"


# ---------------------------------------------------------------------------
# Approve
# ---------------------------------------------------------------------------

async def test_manager_approves_creates_active_lease(async_client_with_db: AsyncClient):
    ctx = await _setup(async_client_with_db)
    tenant = await _register_login(async_client_with_db, "apr_t@lrtest.com", "APR Tenant", "tenant")

    lr = await async_client_with_db.post("/api/v1/lease-requests", headers=_h(tenant), json={"unit_id": ctx["unit_id"], **_DATES})
    req_id = lr.json()["request_id"]

    res = await async_client_with_db.post(f"/api/v1/lease-requests/{req_id}/approve", headers=_h(ctx["mgr"]))
    assert res.status_code == 200
    assert res.json()["status"] == "approved"

    # Unit should now be occupied
    unit = await async_client_with_db.get(f"/api/v1/units/{ctx['unit_id']}", headers=_h(ctx["mgr"]))
    assert unit.json()["is_occupied"] is True

    # Lease should be active
    leases = await async_client_with_db.get("/api/v1/leases", headers=_h(tenant))
    active = [l for l in leases.json() if l["status"] == "active"]
    assert len(active) == 1


async def test_approve_auto_rejects_other_pending(async_client_with_db: AsyncClient):
    ctx = await _setup(async_client_with_db)
    t1 = await _register_login(async_client_with_db, "ar_t1@lrtest.com", "AR T1", "tenant")
    t2 = await _register_login(async_client_with_db, "ar_t2@lrtest.com", "AR T2", "tenant")

    lr1 = await async_client_with_db.post("/api/v1/lease-requests", headers=_h(t1), json={"unit_id": ctx["unit_id"], **_DATES})
    lr2 = await async_client_with_db.post("/api/v1/lease-requests", headers=_h(t2), json={"unit_id": ctx["unit_id"], **_DATES})

    await async_client_with_db.post(f"/api/v1/lease-requests/{lr1.json()['request_id']}/approve", headers=_h(ctx["mgr"]))

    # T2's request should now be rejected
    t2_reqs = await async_client_with_db.get("/api/v1/lease-requests", headers=_h(t2))
    assert t2_reqs.json()[0]["status"] == "rejected"


async def test_tenant_cannot_approve(async_client_with_db: AsyncClient):
    ctx = await _setup(async_client_with_db)
    tenant = await _register_login(async_client_with_db, "tca_t@lrtest.com", "TCA Tenant", "tenant")

    lr = await async_client_with_db.post("/api/v1/lease-requests", headers=_h(tenant), json={"unit_id": ctx["unit_id"], **_DATES})
    res = await async_client_with_db.post(f"/api/v1/lease-requests/{lr.json()['request_id']}/approve", headers=_h(tenant))
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# Reject
# ---------------------------------------------------------------------------

async def test_manager_rejects_request(async_client_with_db: AsyncClient):
    ctx = await _setup(async_client_with_db)
    tenant = await _register_login(async_client_with_db, "rej_t@lrtest.com", "REJ Tenant", "tenant")

    lr = await async_client_with_db.post("/api/v1/lease-requests", headers=_h(tenant), json={"unit_id": ctx["unit_id"], **_DATES})
    req_id = lr.json()["request_id"]

    res = await async_client_with_db.post(f"/api/v1/lease-requests/{req_id}/reject", headers=_h(ctx["mgr"]))
    assert res.status_code == 200
    assert res.json()["status"] == "rejected"

    # Unit should still be available
    unit = await async_client_with_db.get(f"/api/v1/units/{ctx['unit_id']}", headers=_h(ctx["mgr"]))
    assert unit.json()["is_occupied"] is False


# ---------------------------------------------------------------------------
# Manager controls availability manually
# ---------------------------------------------------------------------------

async def test_manager_marks_unit_unavailable(async_client_with_db: AsyncClient):
    ctx = await _setup(async_client_with_db)
    tenant = await _register_login(async_client_with_db, "mu_t@lrtest.com", "MU Tenant", "tenant")

    # Manager marks unit unavailable
    res = await async_client_with_db.put(f"/api/v1/units/{ctx['unit_id']}", headers=_h(ctx["mgr"]),
                                          json={"is_available": False})
    assert res.status_code == 200
    assert res.json()["is_available"] is False

    # Tenant should not see it in available pool
    avail = await async_client_with_db.get("/api/v1/units/available", headers=_h(tenant))
    ids = [u["unit_id"] for u in avail.json()]
    assert ctx["unit_id"] not in ids

    # Tenant cannot request it
    lr = await async_client_with_db.post("/api/v1/lease-requests", headers=_h(tenant), json={"unit_id": ctx["unit_id"], **_DATES})
    assert lr.status_code == 409
