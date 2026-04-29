"""Properties, units, and leases — integration tests.

Coverage:
  - Property CRUD and role-based access
  - Unit creation and listing
  - Role-filtered GET /properties (owner vs tenant vs manager)
  - Lease creation, activation, termination
  - is_occupied flag toggled on activate/terminate
  - Permission enforcement throughout
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


_PROP = {
    "name": "Sunrise Apts", "address": "42 Main St",
    "city": "Kingsport", "state": "TN", "zip_code": "37660",
}

_UNIT = {
    "unit_number": "1A", "monthly_rent": "1200.00",
    "bedrooms": 1, "bathrooms": 1, "square_feet": 650,
}


# ---------------------------------------------------------------------------
# Properties — CRUD
# ---------------------------------------------------------------------------

async def test_create_property_as_owner(async_client_with_db: AsyncClient):
    token = await _register_login(async_client_with_db, "cp_owner@proptest.com", "CP Owner", "owner")
    res = await async_client_with_db.post("/api/v1/properties", headers=_h(token), json=_PROP)
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == _PROP["name"]
    assert "property_id" in data


async def test_create_property_as_tenant_forbidden(async_client_with_db: AsyncClient):
    token = await _register_login(async_client_with_db, "cp_tenant@proptest.com", "CP Tenant", "tenant")
    res = await async_client_with_db.post("/api/v1/properties", headers=_h(token), json=_PROP)
    assert res.status_code == 403


async def test_get_property_by_id(async_client_with_db: AsyncClient):
    token = await _register_login(async_client_with_db, "gp_owner@proptest.com", "GP Owner", "owner")
    create = await async_client_with_db.post("/api/v1/properties", headers=_h(token), json=_PROP)
    prop_id = create.json()["property_id"]

    res = await async_client_with_db.get(f"/api/v1/properties/{prop_id}", headers=_h(token))
    assert res.status_code == 200
    assert res.json()["property_id"] == prop_id


async def test_update_property_as_owner(async_client_with_db: AsyncClient):
    token = await _register_login(async_client_with_db, "up_owner@proptest.com", "UP Owner", "owner")
    create = await async_client_with_db.post("/api/v1/properties", headers=_h(token), json=_PROP)
    prop_id = create.json()["property_id"]

    res = await async_client_with_db.put(
        f"/api/v1/properties/{prop_id}", headers=_h(token), json={"name": "Updated Apts"},
    )
    assert res.status_code == 200
    assert res.json()["name"] == "Updated Apts"


async def test_delete_property_as_owner(async_client_with_db: AsyncClient):
    token = await _register_login(async_client_with_db, "dp_owner@proptest.com", "DP Owner", "owner")
    create = await async_client_with_db.post("/api/v1/properties", headers=_h(token), json=_PROP)
    prop_id = create.json()["property_id"]

    res = await async_client_with_db.delete(f"/api/v1/properties/{prop_id}", headers=_h(token))
    assert res.status_code == 204


# ---------------------------------------------------------------------------
# Role-filtered GET /properties
# ---------------------------------------------------------------------------

async def test_owner_sees_only_own_properties(async_client_with_db: AsyncClient):
    owner1_token = await _register_login(async_client_with_db, "rf_o1@proptest.com", "RF Owner1", "owner")
    owner2_token = await _register_login(async_client_with_db, "rf_o2@proptest.com", "RF Owner2", "owner")

    await async_client_with_db.post("/api/v1/properties", headers=_h(owner1_token), json={**_PROP, "name": "O1 Prop"})
    await async_client_with_db.post("/api/v1/properties", headers=_h(owner2_token), json={**_PROP, "name": "O2 Prop"})

    res = await async_client_with_db.get("/api/v1/properties", headers=_h(owner1_token))
    assert res.status_code == 200
    names = [p["name"] for p in res.json()]
    assert "O1 Prop" in names
    assert "O2 Prop" not in names


async def test_tenant_sees_only_rented_property(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "rf_owner@proptest.com", "RF Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "rf_tenant@proptest.com", "RF Tenant", "tenant")

    # Property the tenant rents
    p1 = await async_client_with_db.post("/api/v1/properties", headers=_h(owner_token), json={**_PROP, "name": "Rented Prop"})
    p1_id = p1.json()["property_id"]

    # Another property the tenant does NOT rent
    await async_client_with_db.post("/api/v1/properties", headers=_h(owner_token), json={**_PROP, "name": "Other Prop"})

    unit = await async_client_with_db.post(f"/api/v1/properties/{p1_id}/units", headers=_h(owner_token), json=_UNIT)
    unit_id = unit.json()["unit_id"]

    me = await async_client_with_db.get("/api/v1/users/me", headers=_h(tenant_token))
    tenant_id = me.json()["user_id"]

    lease = await async_client_with_db.post("/api/v1/leases", headers=_h(owner_token), json={
        "unit_id": unit_id, "tenant_id": tenant_id,
        "start_date": str(date.today()), "end_date": str(date.today() + timedelta(days=365)),
        "monthly_rent": "1200.00", "security_deposit": "1200.00",
    })
    lease_id = lease.json()["lease_id"]

    # Activate the lease so tenant is officially renting
    await async_client_with_db.post(f"/api/v1/leases/{lease_id}/activate", headers=_h(owner_token))

    res = await async_client_with_db.get("/api/v1/properties", headers=_h(tenant_token))
    assert res.status_code == 200
    names = [p["name"] for p in res.json()]
    assert "Rented Prop" in names
    assert "Other Prop" not in names


async def test_manager_sees_only_assigned_properties(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "mg_owner@proptest.com", "MG Owner", "owner")
    manager_token = await _register_login(async_client_with_db, "mg_mgr@proptest.com", "MG Manager", "manager")
    admin_token = await _register_login(async_client_with_db, "mg_admin@proptest.com", "MG Admin", "admin")

    # Create two properties — manager will be assigned to only one
    prop_assigned = await async_client_with_db.post("/api/v1/properties", headers=_h(owner_token), json={
        **_PROP, "name": "Mgr Assigned",
    })
    await async_client_with_db.post("/api/v1/properties", headers=_h(owner_token), json={
        **_PROP, "name": "Mgr Not Assigned",
    })

    prop_id = prop_assigned.json()["property_id"]
    manager_id = (await async_client_with_db.get("/api/v1/users/me", headers=_h(manager_token))).json()["user_id"]

    await async_client_with_db.put(
        f"/api/v1/properties/{prop_id}/manager",
        headers=_h(admin_token),
        json={"manager_id": manager_id},
    )

    res = await async_client_with_db.get("/api/v1/properties", headers=_h(manager_token))
    assert res.status_code == 200
    names = [p["name"] for p in res.json()]
    assert "Mgr Assigned" in names
    assert "Mgr Not Assigned" not in names


# ---------------------------------------------------------------------------
# Units
# ---------------------------------------------------------------------------

async def test_create_unit_in_property(async_client_with_db: AsyncClient):
    token = await _register_login(async_client_with_db, "cu_owner@proptest.com", "CU Owner", "owner")
    prop = await async_client_with_db.post("/api/v1/properties", headers=_h(token), json=_PROP)
    prop_id = prop.json()["property_id"]

    res = await async_client_with_db.post(f"/api/v1/properties/{prop_id}/units", headers=_h(token), json=_UNIT)
    assert res.status_code == 201
    assert res.json()["unit_number"] == "1A"
    assert res.json()["is_occupied"] is False


async def test_list_units_in_property(async_client_with_db: AsyncClient):
    token = await _register_login(async_client_with_db, "lu_owner@proptest.com", "LU Owner", "owner")
    prop = await async_client_with_db.post("/api/v1/properties", headers=_h(token), json=_PROP)
    prop_id = prop.json()["property_id"]

    await async_client_with_db.post(f"/api/v1/properties/{prop_id}/units", headers=_h(token), json={**_UNIT, "unit_number": "2A"})
    await async_client_with_db.post(f"/api/v1/properties/{prop_id}/units", headers=_h(token), json={**_UNIT, "unit_number": "2B"})

    res = await async_client_with_db.get(f"/api/v1/properties/{prop_id}/units", headers=_h(token))
    assert res.status_code == 200
    assert len(res.json()) == 2


# ---------------------------------------------------------------------------
# Leases — lifecycle
# ---------------------------------------------------------------------------

async def test_create_lease(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "cl_owner@proptest.com", "CL Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "cl_tenant@proptest.com", "CL Tenant", "tenant")

    prop = await async_client_with_db.post("/api/v1/properties", headers=_h(owner_token), json=_PROP)
    unit = await async_client_with_db.post(f"/api/v1/properties/{prop.json()['property_id']}/units", headers=_h(owner_token), json=_UNIT)
    tenant_id = (await async_client_with_db.get("/api/v1/users/me", headers=_h(tenant_token))).json()["user_id"]

    res = await async_client_with_db.post("/api/v1/leases", headers=_h(owner_token), json={
        "unit_id": unit.json()["unit_id"], "tenant_id": tenant_id,
        "start_date": str(date.today()), "end_date": str(date.today() + timedelta(days=365)),
        "monthly_rent": "1200.00", "security_deposit": "1200.00",
    })
    assert res.status_code == 201
    assert res.json()["status"] == "draft"


async def test_activate_lease_marks_unit_occupied(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "al_owner@proptest.com", "AL Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "al_tenant@proptest.com", "AL Tenant", "tenant")

    prop = await async_client_with_db.post("/api/v1/properties", headers=_h(owner_token), json=_PROP)
    prop_id = prop.json()["property_id"]
    unit_res = await async_client_with_db.post(f"/api/v1/properties/{prop_id}/units", headers=_h(owner_token), json=_UNIT)
    unit_id = unit_res.json()["unit_id"]
    tenant_id = (await async_client_with_db.get("/api/v1/users/me", headers=_h(tenant_token))).json()["user_id"]

    lease = await async_client_with_db.post("/api/v1/leases", headers=_h(owner_token), json={
        "unit_id": unit_id, "tenant_id": tenant_id,
        "start_date": str(date.today()), "end_date": str(date.today() + timedelta(days=365)),
        "monthly_rent": "1200.00", "security_deposit": "1200.00",
    })
    lease_id = lease.json()["lease_id"]

    activate = await async_client_with_db.post(f"/api/v1/leases/{lease_id}/activate", headers=_h(owner_token))
    assert activate.status_code == 200
    assert activate.json()["status"] == "active"

    unit_check = await async_client_with_db.get(f"/api/v1/units/{unit_id}", headers=_h(owner_token))
    assert unit_check.json()["is_occupied"] is True


async def test_terminate_lease_marks_unit_vacant(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "tl_owner@proptest.com", "TL Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "tl_tenant@proptest.com", "TL Tenant", "tenant")

    prop = await async_client_with_db.post("/api/v1/properties", headers=_h(owner_token), json=_PROP)
    prop_id = prop.json()["property_id"]
    unit_res = await async_client_with_db.post(f"/api/v1/properties/{prop_id}/units", headers=_h(owner_token), json=_UNIT)
    unit_id = unit_res.json()["unit_id"]
    tenant_id = (await async_client_with_db.get("/api/v1/users/me", headers=_h(tenant_token))).json()["user_id"]

    lease = await async_client_with_db.post("/api/v1/leases", headers=_h(owner_token), json={
        "unit_id": unit_id, "tenant_id": tenant_id,
        "start_date": str(date.today()), "end_date": str(date.today() + timedelta(days=365)),
        "monthly_rent": "1200.00", "security_deposit": "1200.00",
    })
    lease_id = lease.json()["lease_id"]

    await async_client_with_db.post(f"/api/v1/leases/{lease_id}/activate", headers=_h(owner_token))
    terminate = await async_client_with_db.post(f"/api/v1/leases/{lease_id}/terminate", headers=_h(owner_token))
    assert terminate.status_code == 200
    assert terminate.json()["status"] == "terminated"

    unit_check = await async_client_with_db.get(f"/api/v1/units/{unit_id}", headers=_h(owner_token))
    assert unit_check.json()["is_occupied"] is False


async def test_activate_non_draft_lease_returns_409(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "and_owner@proptest.com", "AND Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "and_tenant@proptest.com", "AND Tenant", "tenant")

    prop = await async_client_with_db.post("/api/v1/properties", headers=_h(owner_token), json=_PROP)
    unit_res = await async_client_with_db.post(
        f"/api/v1/properties/{prop.json()['property_id']}/units", headers=_h(owner_token), json=_UNIT,
    )
    tenant_id = (await async_client_with_db.get("/api/v1/users/me", headers=_h(tenant_token))).json()["user_id"]

    lease = await async_client_with_db.post("/api/v1/leases", headers=_h(owner_token), json={
        "unit_id": unit_res.json()["unit_id"], "tenant_id": tenant_id,
        "start_date": str(date.today()), "end_date": str(date.today() + timedelta(days=365)),
        "monthly_rent": "1200.00", "security_deposit": "1200.00",
    })
    lease_id = lease.json()["lease_id"]

    await async_client_with_db.post(f"/api/v1/leases/{lease_id}/activate", headers=_h(owner_token))
    res = await async_client_with_db.post(f"/api/v1/leases/{lease_id}/activate", headers=_h(owner_token))
    assert res.status_code == 409


async def test_tenant_cannot_create_lease(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "tncl_owner@proptest.com", "TNCL Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "tncl_tenant@proptest.com", "TNCL Tenant", "tenant")

    prop = await async_client_with_db.post("/api/v1/properties", headers=_h(owner_token), json=_PROP)
    unit_res = await async_client_with_db.post(
        f"/api/v1/properties/{prop.json()['property_id']}/units", headers=_h(owner_token), json=_UNIT,
    )
    tenant_id = (await async_client_with_db.get("/api/v1/users/me", headers=_h(tenant_token))).json()["user_id"]

    res = await async_client_with_db.post("/api/v1/leases", headers=_h(tenant_token), json={
        "unit_id": unit_res.json()["unit_id"], "tenant_id": tenant_id,
        "start_date": str(date.today()), "end_date": str(date.today() + timedelta(days=365)),
        "monthly_rent": "1200.00", "security_deposit": "1200.00",
    })
    assert res.status_code == 403


async def test_duplicate_active_lease_on_unit_returns_409(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "dup_owner@proptest.com", "DUP Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "dup_tenant@proptest.com", "DUP Tenant", "tenant")

    prop = await async_client_with_db.post("/api/v1/properties", headers=_h(owner_token), json=_PROP)
    unit_res = await async_client_with_db.post(
        f"/api/v1/properties/{prop.json()['property_id']}/units", headers=_h(owner_token), json=_UNIT,
    )
    unit_id = unit_res.json()["unit_id"]
    tenant_id = (await async_client_with_db.get("/api/v1/users/me", headers=_h(tenant_token))).json()["user_id"]

    lease_payload = {
        "unit_id": unit_id, "tenant_id": tenant_id,
        "start_date": str(date.today()), "end_date": str(date.today() + timedelta(days=365)),
        "monthly_rent": "1200.00", "security_deposit": "1200.00",
    }
    lease = await async_client_with_db.post("/api/v1/leases", headers=_h(owner_token), json=lease_payload)
    await async_client_with_db.post(f"/api/v1/leases/{lease.json()['lease_id']}/activate", headers=_h(owner_token))

    # Try to create another lease on the same unit while one is already ACTIVE
    # (activate checks for existing active lease — create only checks for active)
    # The service checks for active lease on create as well
    res = await async_client_with_db.post("/api/v1/leases", headers=_h(owner_token), json=lease_payload)
    assert res.status_code == 409
