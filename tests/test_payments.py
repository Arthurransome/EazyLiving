"""Payment service — unit and integration tests.

Coverage:
  - Creating payment records (staff-only)
  - Listing/getting payments with role-based filtering
  - Tenant-facing process() endpoint (simulate_failure flag)
  - Staff-only status transitions: mark_paid, mark_partial, mark_overdue
  - Late-fee accounting
  - Permission enforcement (tenants cannot see/pay others' payments)
"""
import pytest
from datetime import date, timedelta
from httpx import AsyncClient


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

async def _register_login(client: AsyncClient, email: str, name: str, role: str) -> str:
    await client.post("/api/v1/auth/register", json={
        "email": email, "name": name, "password": "testpass123", "role": role,
    })
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": "testpass123"})
    return res.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _setup_lease(client: AsyncClient, owner_token: str, tenant_token: str) -> tuple:
    """Create property → unit → lease. Returns (unit_id, tenant_id, lease_id)."""
    prop = await client.post("/api/v1/properties", headers=_h(owner_token), json={
        "name": "Payment Test Property", "address": "1 Pay St",
        "city": "Testville", "state": "TN", "zip_code": "37601",
    })
    assert prop.status_code == 201
    prop_id = prop.json()["property_id"]

    unit = await client.post(f"/api/v1/properties/{prop_id}/units", headers=_h(owner_token), json={
        "unit_number": "101", "monthly_rent": "1500.00",
        "bedrooms": 2, "bathrooms": 1, "square_feet": 900,
    })
    assert unit.status_code == 201
    unit_id = unit.json()["unit_id"]

    me = await client.get("/api/v1/users/me", headers=_h(tenant_token))
    tenant_id = me.json()["user_id"]

    lease = await client.post("/api/v1/leases", headers=_h(owner_token), json={
        "unit_id": unit_id,
        "tenant_id": tenant_id,
        "start_date": str(date.today()),
        "end_date": str(date.today() + timedelta(days=365)),
        "monthly_rent": "1500.00",
        "security_deposit": "1500.00",
    })
    assert lease.status_code == 201
    lease_id = lease.json()["lease_id"]

    return unit_id, tenant_id, lease_id


# ---------------------------------------------------------------------------
# Create payment
# ---------------------------------------------------------------------------

async def test_create_payment_as_owner(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "cp_owner@paytest.com", "CP Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "cp_tenant@paytest.com", "CP Tenant", "tenant")
    _, tenant_id, lease_id = await _setup_lease(async_client_with_db, owner_token, tenant_token)

    res = await async_client_with_db.post("/api/v1/payments", headers=_h(owner_token), json={
        "lease_id": lease_id,
        "tenant_id": tenant_id,
        "amount": "1500.00",
        "due_date": str(date.today() + timedelta(days=30)),
    })
    assert res.status_code == 201
    data = res.json()
    assert data["amount"] == "1500.00"
    assert data["status"] == "pending"
    assert data["late_fee"] == "0.00"
    assert data["payment_date"] is None


async def test_create_payment_as_tenant_forbidden(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "cpf_owner@paytest.com", "CPF Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "cpf_tenant@paytest.com", "CPF Tenant", "tenant")
    _, tenant_id, lease_id = await _setup_lease(async_client_with_db, owner_token, tenant_token)

    res = await async_client_with_db.post("/api/v1/payments", headers=_h(tenant_token), json={
        "lease_id": lease_id,
        "tenant_id": tenant_id,
        "amount": "1500.00",
        "due_date": str(date.today() + timedelta(days=30)),
    })
    assert res.status_code == 403


async def test_create_payment_invalid_amount(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "cia_owner@paytest.com", "CIA Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "cia_tenant@paytest.com", "CIA Tenant", "tenant")
    _, tenant_id, lease_id = await _setup_lease(async_client_with_db, owner_token, tenant_token)

    res = await async_client_with_db.post("/api/v1/payments", headers=_h(owner_token), json={
        "lease_id": lease_id, "tenant_id": tenant_id,
        "amount": "-100.00", "due_date": str(date.today()),
    })
    assert res.status_code == 422


# ---------------------------------------------------------------------------
# List / get payments
# ---------------------------------------------------------------------------

async def test_list_payments_owner_sees_all(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "lp_owner@paytest.com", "LP Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "lp_tenant@paytest.com", "LP Tenant", "tenant")
    _, tenant_id, lease_id = await _setup_lease(async_client_with_db, owner_token, tenant_token)

    await async_client_with_db.post("/api/v1/payments", headers=_h(owner_token), json={
        "lease_id": lease_id, "tenant_id": tenant_id,
        "amount": "1500.00", "due_date": str(date.today()),
    })

    res = await async_client_with_db.get("/api/v1/payments", headers=_h(owner_token))
    assert res.status_code == 200
    assert len(res.json()) >= 1


async def test_list_payments_tenant_sees_only_own(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "lt_owner@paytest.com", "LT Owner", "owner")
    t1_token = await _register_login(async_client_with_db, "lt_t1@paytest.com", "LT Tenant1", "tenant")
    t2_token = await _register_login(async_client_with_db, "lt_t2@paytest.com", "LT Tenant2", "tenant")
    _, t1_id, lease1_id = await _setup_lease(async_client_with_db, owner_token, t1_token)

    me2 = await async_client_with_db.get("/api/v1/users/me", headers=_h(t2_token))
    t2_id = me2.json()["user_id"]

    # Create payment for t1
    await async_client_with_db.post("/api/v1/payments", headers=_h(owner_token), json={
        "lease_id": lease1_id, "tenant_id": t1_id,
        "amount": "1200.00", "due_date": str(date.today()),
    })

    # t2 lists payments — should see none of t1's
    res = await async_client_with_db.get("/api/v1/payments", headers=_h(t2_token))
    assert res.status_code == 200
    for p in res.json():
        assert p["tenant_id"] == t2_id


async def test_get_payment_by_id(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "gp_owner@paytest.com", "GP Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "gp_tenant@paytest.com", "GP Tenant", "tenant")
    _, tenant_id, lease_id = await _setup_lease(async_client_with_db, owner_token, tenant_token)

    create = await async_client_with_db.post("/api/v1/payments", headers=_h(owner_token), json={
        "lease_id": lease_id, "tenant_id": tenant_id,
        "amount": "1500.00", "due_date": str(date.today()),
    })
    payment_id = create.json()["payment_id"]

    res = await async_client_with_db.get(f"/api/v1/payments/{payment_id}", headers=_h(owner_token))
    assert res.status_code == 200
    assert res.json()["payment_id"] == payment_id


async def test_tenant_cannot_get_other_tenants_payment(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "tco_owner@paytest.com", "TCO Owner", "owner")
    t1_token = await _register_login(async_client_with_db, "tco_t1@paytest.com", "TCO Tenant1", "tenant")
    t2_token = await _register_login(async_client_with_db, "tco_t2@paytest.com", "TCO Tenant2", "tenant")
    _, t1_id, lease_id = await _setup_lease(async_client_with_db, owner_token, t1_token)

    create = await async_client_with_db.post("/api/v1/payments", headers=_h(owner_token), json={
        "lease_id": lease_id, "tenant_id": t1_id,
        "amount": "1500.00", "due_date": str(date.today()),
    })
    payment_id = create.json()["payment_id"]

    res = await async_client_with_db.get(f"/api/v1/payments/{payment_id}", headers=_h(t2_token))
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# process() — tenant-facing payment action
# ---------------------------------------------------------------------------

async def test_process_payment_success(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "pp_owner@paytest.com", "PP Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "pp_tenant@paytest.com", "PP Tenant", "tenant")
    _, tenant_id, lease_id = await _setup_lease(async_client_with_db, owner_token, tenant_token)

    create = await async_client_with_db.post("/api/v1/payments", headers=_h(owner_token), json={
        "lease_id": lease_id, "tenant_id": tenant_id,
        "amount": "1500.00", "due_date": str(date.today()),
    })
    payment_id = create.json()["payment_id"]

    res = await async_client_with_db.post(
        f"/api/v1/payments/{payment_id}/process",
        headers=_h(tenant_token),
        json={"method": "credit_card", "simulate_failure": False},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "paid"
    assert data["payment_date"] is not None


async def test_process_payment_simulate_failure(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "psf_owner@paytest.com", "PSF Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "psf_tenant@paytest.com", "PSF Tenant", "tenant")
    _, tenant_id, lease_id = await _setup_lease(async_client_with_db, owner_token, tenant_token)

    create = await async_client_with_db.post("/api/v1/payments", headers=_h(owner_token), json={
        "lease_id": lease_id, "tenant_id": tenant_id,
        "amount": "1500.00", "due_date": str(date.today()),
    })
    payment_id = create.json()["payment_id"]

    res = await async_client_with_db.post(
        f"/api/v1/payments/{payment_id}/process",
        headers=_h(tenant_token),
        json={"method": "bank_transfer", "simulate_failure": True},
    )
    assert res.status_code == 402


async def test_process_already_paid_returns_409(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "pap_owner@paytest.com", "PAP Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "pap_tenant@paytest.com", "PAP Tenant", "tenant")
    _, tenant_id, lease_id = await _setup_lease(async_client_with_db, owner_token, tenant_token)

    create = await async_client_with_db.post("/api/v1/payments", headers=_h(owner_token), json={
        "lease_id": lease_id, "tenant_id": tenant_id,
        "amount": "1500.00", "due_date": str(date.today()),
    })
    payment_id = create.json()["payment_id"]

    payload = {"method": "credit_card", "simulate_failure": False}
    await async_client_with_db.post(f"/api/v1/payments/{payment_id}/process", headers=_h(tenant_token), json=payload)
    res = await async_client_with_db.post(f"/api/v1/payments/{payment_id}/process", headers=_h(tenant_token), json=payload)
    assert res.status_code == 409


async def test_tenant_cannot_process_other_tenants_payment(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "tcp_owner@paytest.com", "TCP Owner", "owner")
    t1_token = await _register_login(async_client_with_db, "tcp_t1@paytest.com", "TCP T1", "tenant")
    t2_token = await _register_login(async_client_with_db, "tcp_t2@paytest.com", "TCP T2", "tenant")
    _, t1_id, lease_id = await _setup_lease(async_client_with_db, owner_token, t1_token)

    create = await async_client_with_db.post("/api/v1/payments", headers=_h(owner_token), json={
        "lease_id": lease_id, "tenant_id": t1_id,
        "amount": "1500.00", "due_date": str(date.today()),
    })
    payment_id = create.json()["payment_id"]

    res = await async_client_with_db.post(
        f"/api/v1/payments/{payment_id}/process",
        headers=_h(t2_token),
        json={"method": "credit_card", "simulate_failure": False},
    )
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# Staff status transitions
# ---------------------------------------------------------------------------

async def test_mark_paid_as_owner(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "mp_owner@paytest.com", "MP Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "mp_tenant@paytest.com", "MP Tenant", "tenant")
    _, tenant_id, lease_id = await _setup_lease(async_client_with_db, owner_token, tenant_token)

    create = await async_client_with_db.post("/api/v1/payments", headers=_h(owner_token), json={
        "lease_id": lease_id, "tenant_id": tenant_id,
        "amount": "1500.00", "due_date": str(date.today()),
    })
    payment_id = create.json()["payment_id"]

    res = await async_client_with_db.post(f"/api/v1/payments/{payment_id}/pay", headers=_h(owner_token))
    assert res.status_code == 200
    assert res.json()["status"] == "paid"
    assert res.json()["payment_date"] is not None


async def test_mark_paid_already_paid_returns_409(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "mpa_owner@paytest.com", "MPA Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "mpa_tenant@paytest.com", "MPA Tenant", "tenant")
    _, tenant_id, lease_id = await _setup_lease(async_client_with_db, owner_token, tenant_token)

    create = await async_client_with_db.post("/api/v1/payments", headers=_h(owner_token), json={
        "lease_id": lease_id, "tenant_id": tenant_id,
        "amount": "1500.00", "due_date": str(date.today()),
    })
    payment_id = create.json()["payment_id"]

    await async_client_with_db.post(f"/api/v1/payments/{payment_id}/pay", headers=_h(owner_token))
    res = await async_client_with_db.post(f"/api/v1/payments/{payment_id}/pay", headers=_h(owner_token))
    assert res.status_code == 409


async def test_mark_partial_as_owner(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "mpart_owner@paytest.com", "MPart Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "mpart_tenant@paytest.com", "MPart Tenant", "tenant")
    _, tenant_id, lease_id = await _setup_lease(async_client_with_db, owner_token, tenant_token)

    create = await async_client_with_db.post("/api/v1/payments", headers=_h(owner_token), json={
        "lease_id": lease_id, "tenant_id": tenant_id,
        "amount": "1500.00", "due_date": str(date.today()),
    })
    payment_id = create.json()["payment_id"]

    res = await async_client_with_db.post(f"/api/v1/payments/{payment_id}/partial", headers=_h(owner_token))
    assert res.status_code == 200
    assert res.json()["status"] == "partial"


async def test_mark_overdue_with_late_fee(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "mo_owner@paytest.com", "MO Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "mo_tenant@paytest.com", "MO Tenant", "tenant")
    _, tenant_id, lease_id = await _setup_lease(async_client_with_db, owner_token, tenant_token)

    create = await async_client_with_db.post("/api/v1/payments", headers=_h(owner_token), json={
        "lease_id": lease_id, "tenant_id": tenant_id,
        "amount": "1500.00", "due_date": str(date.today() - timedelta(days=5)),
    })
    payment_id = create.json()["payment_id"]

    res = await async_client_with_db.post(
        f"/api/v1/payments/{payment_id}/overdue",
        headers=_h(owner_token),
        json={"late_fee": "75.00"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "overdue"
    assert data["late_fee"] == "75.00"


async def test_mark_overdue_already_paid_returns_409(async_client_with_db: AsyncClient):
    owner_token = await _register_login(async_client_with_db, "mop_owner@paytest.com", "MOP Owner", "owner")
    tenant_token = await _register_login(async_client_with_db, "mop_tenant@paytest.com", "MOP Tenant", "tenant")
    _, tenant_id, lease_id = await _setup_lease(async_client_with_db, owner_token, tenant_token)

    create = await async_client_with_db.post("/api/v1/payments", headers=_h(owner_token), json={
        "lease_id": lease_id, "tenant_id": tenant_id,
        "amount": "1500.00", "due_date": str(date.today()),
    })
    payment_id = create.json()["payment_id"]

    await async_client_with_db.post(f"/api/v1/payments/{payment_id}/pay", headers=_h(owner_token))
    res = await async_client_with_db.post(
        f"/api/v1/payments/{payment_id}/overdue",
        headers=_h(owner_token),
        json={"late_fee": "0.00"},
    )
    assert res.status_code == 409


async def test_unauthenticated_payment_access_denied(async_client_with_db: AsyncClient):
    res = await async_client_with_db.get("/api/v1/payments")
    assert res.status_code == 401
