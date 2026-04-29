import { http, HttpResponse, delay } from "msw"

import { db } from "./db.js"

// ---------------------------------------------------------------------------
// API base — all endpoints versioned under /api/v1 (matches design doc).
// The leading "*" wildcard matches any host, so the same handlers work in:
//   • the browser (where fetch resolves /api/v1/... against window.location)
//   • msw/node smoke tests (where fetch needs an absolute http://localhost URL)
// ---------------------------------------------------------------------------
const API = "*/api/v1"

// ---------------------------------------------------------------------------
// Token helpers — mock JWT.
// Real backend uses HS256 JWT. Here we just base64-encode the user_id + role
// + exp so the mocked handlers can identify the caller.
// ---------------------------------------------------------------------------
function makeToken(user) {
  const payload = {
    user_id: user.user_id,
    role: user.role,
    email: user.email,
    exp: Date.now() + 1000 * 60 * 30, // 30 min
  }
  return "mock." + btoa(JSON.stringify(payload))
}

function readToken(request) {
  const auth = request.headers.get("authorization") || ""
  const match = auth.match(/^Bearer\s+mock\.(.+)$/)
  if (!match) return null
  try {
    const payload = JSON.parse(atob(match[1]))
    if (payload.exp && payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

function requireAuth(request, allowedRoles) {
  const payload = readToken(request)
  if (!payload) {
    return [
      null,
      HttpResponse.json({ detail: "Not authenticated" }, { status: 401 }),
    ]
  }
  if (allowedRoles && !allowedRoles.includes(payload.role)) {
    return [
      null,
      HttpResponse.json({ detail: "Forbidden" }, { status: 403 }),
    ]
  }
  return [payload, null]
}

// Small helper: simulate ~150ms network so loading states are visible.
async function net() {
  await delay(150)
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
const auth = [
  http.post(`${API}/auth/login`, async ({ request }) => {
    await net()
    const { email, password } = await request.json()
    const user = db.users.find(
      (u) => u.email === email && u.password === password,
    )
    if (!user) {
      return HttpResponse.json(
        { detail: "Invalid email or password" },
        { status: 401 },
      )
    }
    if (!user.is_active) {
      return HttpResponse.json(
        { detail: "Account is disabled" },
        { status: 403 },
      )
    }
    const { password: _pw, ...safe } = user
    return HttpResponse.json({ token: makeToken(user), user: safe })
  }),

  http.post(`${API}/auth/register`, async ({ request }) => {
    await net()
    const body = await request.json()
    if (!body.email || !body.password || !body.name || !body.role) {
      return HttpResponse.json({ detail: "Missing fields" }, { status: 422 })
    }
    if (db.users.some((u) => u.email === body.email)) {
      return HttpResponse.json(
        { detail: "Email already registered" },
        { status: 409 },
      )
    }
    const user = {
      user_id: crypto.randomUUID(),
      email: body.email,
      password: body.password,
      name: body.name,
      role: body.role,
      phone: body.phone || null,
      is_active: true,
      created_at: new Date().toISOString(),
    }
    db.users.push(user)
    const { password: _pw, ...safe } = user
    return HttpResponse.json(
      { token: makeToken(user), user: safe },
      { status: 201 },
    )
  }),

  http.get(`${API}/auth/me`, async ({ request }) => {
    await net()
    const [payload, err] = requireAuth(request)
    if (err) return err
    const user = db.users.find((u) => u.user_id === payload.user_id)
    if (!user)
      return HttpResponse.json({ detail: "User not found" }, { status: 404 })
    const { password: _pw, ...safe } = user
    return HttpResponse.json(safe)
  }),

  http.post(`${API}/auth/logout`, async () => {
    await net()
    // Stateless mock — real backend would add the token to a Redis blocklist.
    return HttpResponse.json({ ok: true })
  }),
]

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
const stripPw = (u) => {
  const { password: _pw, ...safe } = u
  return safe
}

const users = [
  http.get(`${API}/users`, async ({ request }) => {
    await net()
    const [, err] = requireAuth(request, ["owner", "manager", "admin"])
    if (err) return err
    return HttpResponse.json(db.users.map(stripPw))
  }),

  http.get(`${API}/users/:id`, async ({ request, params }) => {
    await net()
    const [, err] = requireAuth(request)
    if (err) return err
    const u = db.users.find((u) => u.user_id === params.id)
    if (!u) return HttpResponse.json({ detail: "Not found" }, { status: 404 })
    return HttpResponse.json(stripPw(u))
  }),

  http.put(`${API}/users/:id`, async ({ request, params }) => {
    await net()
    const [payload, err] = requireAuth(request)
    if (err) return err
    if (payload.user_id !== params.id && payload.role !== "admin") {
      return HttpResponse.json({ detail: "Forbidden" }, { status: 403 })
    }
    const u = db.users.find((u) => u.user_id === params.id)
    if (!u) return HttpResponse.json({ detail: "Not found" }, { status: 404 })
    const body = await request.json()
    Object.assign(u, {
      name: body.name ?? u.name,
      phone: body.phone ?? u.phone,
      email: body.email ?? u.email,
    })
    return HttpResponse.json(stripPw(u))
  }),
]

// ---------------------------------------------------------------------------
// Properties + Units
// ---------------------------------------------------------------------------
function expandProperty(p) {
  const manager = p.manager_id
    ? db.users.find((u) => u.user_id === p.manager_id)
    : null
  // Find the active offer for this property — used to surface the management
  // fee on portfolio cards.
  const offer = db.management_offers
    .filter((o) => o.property_id === p.property_id && o.status === "accepted")
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0]
  return {
    ...p,
    owner: stripPw(db.users.find((u) => u.user_id === p.owner_id)) || null,
    manager: manager ? stripPw(manager) : null,
    unit_count: db.units.filter((u) => u.property_id === p.property_id).length,
    occupied_count: db.units.filter(
      (u) => u.property_id === p.property_id && u.is_occupied,
    ).length,
    management_fee_percent: offer?.management_fee_percent ?? null,
  }
}

const properties = [
  http.get(`${API}/properties`, async ({ request }) => {
    await net()
    const [payload, err] = requireAuth(request)
    if (err) return err
    let list = db.properties
    // Owners only see their own; managers/admins see everything.
    if (payload.role === "owner") {
      list = list.filter((p) => p.owner_id === payload.user_id)
    } else if (payload.role === "tenant") {
      const tenantUnits = db.leases
        .filter((l) => l.tenant_id === payload.user_id)
        .map((l) => l.unit_id)
      const props = new Set(
        db.units
          .filter((u) => tenantUnits.includes(u.unit_id))
          .map((u) => u.property_id),
      )
      list = list.filter((p) => props.has(p.property_id))
    }
    return HttpResponse.json(list.map(expandProperty))
  }),

  http.get(`${API}/properties/:id`, async ({ request, params }) => {
    await net()
    const [, err] = requireAuth(request)
    if (err) return err
    const p = db.properties.find((p) => p.property_id === params.id)
    if (!p) return HttpResponse.json({ detail: "Not found" }, { status: 404 })
    return HttpResponse.json(expandProperty(p))
  }),

  http.post(`${API}/properties`, async ({ request }) => {
    await net()
    const [payload, err] = requireAuth(request, ["owner", "manager", "admin"])
    if (err) return err
    const body = await request.json()
    const property = {
      property_id: crypto.randomUUID(),
      owner_id: payload.role === "owner" ? payload.user_id : body.owner_id,
      manager_id: null,
      is_available: false,
      name: body.name,
      address: body.address,
      city: body.city,
      state: body.state,
      zip_code: body.zip_code,
      created_at: new Date().toISOString(),
    }
    db.properties.push(property)
    return HttpResponse.json(expandProperty(property), { status: 201 })
  }),

  // PUT /properties/:id — update editable fields. Owner can edit their own,
  // manager can toggle availability if they're the assigned manager.
  http.put(`${API}/properties/:id`, async ({ request, params }) => {
    await net()
    const [payload, err] = requireAuth(request, ["owner", "manager", "admin"])
    if (err) return err
    const property = db.properties.find((p) => p.property_id === params.id)
    if (!property)
      return HttpResponse.json({ detail: "Not found" }, { status: 404 })
    if (
      payload.role === "owner" &&
      property.owner_id !== payload.user_id
    ) {
      return HttpResponse.json({ detail: "Forbidden" }, { status: 403 })
    }
    if (
      payload.role === "manager" &&
      property.manager_id !== payload.user_id
    ) {
      return HttpResponse.json({ detail: "Forbidden" }, { status: 403 })
    }
    const body = await request.json()
    if (body.name !== undefined) property.name = body.name
    if (body.address !== undefined) property.address = body.address
    if (body.city !== undefined) property.city = body.city
    if (body.state !== undefined) property.state = body.state
    if (body.zip_code !== undefined) property.zip_code = body.zip_code
    if (body.is_available !== undefined) property.is_available = body.is_available
    return HttpResponse.json(expandProperty(property))
  }),

  http.get(`${API}/properties/:id/units`, async ({ request, params }) => {
    await net()
    const [, err] = requireAuth(request)
    if (err) return err
    const list = db.units.filter((u) => u.property_id === params.id)
    return HttpResponse.json(list)
  }),

  http.post(`${API}/properties/:id/units`, async ({ request, params }) => {
    await net()
    const [, err] = requireAuth(request, ["owner", "manager", "admin"])
    if (err) return err
    const body = await request.json()
    const unit = {
      unit_id: crypto.randomUUID(),
      property_id: params.id,
      unit_number: body.unit_number,
      bedrooms: body.bedrooms ?? null,
      bathrooms: body.bathrooms ?? null,
      square_feet: body.square_feet ?? null,
      monthly_rent: body.monthly_rent,
      is_occupied: false,
    }
    db.units.push(unit)
    return HttpResponse.json(unit, { status: 201 })
  }),
]

// ---------------------------------------------------------------------------
// Leases
// ---------------------------------------------------------------------------
function expandLease(lease) {
  const unit = db.units.find((u) => u.unit_id === lease.unit_id)
  const property = unit
    ? db.properties.find((p) => p.property_id === unit.property_id)
    : null
  const tenant = db.users.find((u) => u.user_id === lease.tenant_id)
  const manager = lease.manager_id
    ? db.users.find((u) => u.user_id === lease.manager_id)
    : null
  return {
    ...lease,
    unit: unit || null,
    property: property || null,
    tenant: tenant ? stripPw(tenant) : null,
    manager: manager ? stripPw(manager) : null,
  }
}

const leases = [
  http.get(`${API}/leases`, async ({ request }) => {
    await net()
    const [payload, err] = requireAuth(request)
    if (err) return err
    let list = db.leases
    if (payload.role === "tenant") {
      list = list.filter((l) => l.tenant_id === payload.user_id)
    } else if (payload.role === "owner") {
      const ownedProps = new Set(
        db.properties
          .filter((p) => p.owner_id === payload.user_id)
          .map((p) => p.property_id),
      )
      const ownedUnits = new Set(
        db.units
          .filter((u) => ownedProps.has(u.property_id))
          .map((u) => u.unit_id),
      )
      list = list.filter((l) => ownedUnits.has(l.unit_id))
    }
    return HttpResponse.json(list.map(expandLease))
  }),

  http.get(`${API}/leases/:id`, async ({ request, params }) => {
    await net()
    const [, err] = requireAuth(request)
    if (err) return err
    const l = db.leases.find((l) => l.lease_id === params.id)
    if (!l) return HttpResponse.json({ detail: "Not found" }, { status: 404 })
    return HttpResponse.json(expandLease(l))
  }),

  http.post(`${API}/leases`, async ({ request }) => {
    await net()
    const [payload, err] = requireAuth(request, ["owner", "manager", "admin"])
    if (err) return err
    const body = await request.json()
    const lease = {
      lease_id: crypto.randomUUID(),
      unit_id: body.unit_id,
      tenant_id: body.tenant_id,
      manager_id: payload.role === "manager" ? payload.user_id : body.manager_id,
      start_date: body.start_date,
      end_date: body.end_date,
      monthly_rent: body.monthly_rent,
      security_deposit: body.security_deposit ?? null,
      status: body.status ?? "draft",
      document_ref: null,
      manager_signature: null,
      manager_signed_at: null,
      tenant_signature: null,
      tenant_signed_at: null,
      terms: body.terms ?? "Standard 12-month residential lease.",
      created_at: new Date().toISOString(),
    }
    db.leases.push(lease)
    // Mark unit occupied if lease is active.
    const unit = db.units.find((u) => u.unit_id === lease.unit_id)
    if (unit && lease.status === "active") unit.is_occupied = true
    // Notify the tenant that a draft lease is ready for them to review.
    db.notifications.unshift({
      notification_id: crypto.randomUUID(),
      user_id: lease.tenant_id,
      event_type: "lease_drafted",
      message: `A new lease has been drafted for you to review.`,
      is_read: false,
      created_at: new Date().toISOString(),
    })
    return HttpResponse.json(expandLease(lease), { status: 201 })
  }),

  http.put(`${API}/leases/:id`, async ({ request, params }) => {
    await net()
    const [, err] = requireAuth(request, ["owner", "manager", "admin"])
    if (err) return err
    const lease = db.leases.find((l) => l.lease_id === params.id)
    if (!lease)
      return HttpResponse.json({ detail: "Not found" }, { status: 404 })
    const body = await request.json()
    Object.assign(lease, body, { updated_at: new Date().toISOString() })
    return HttpResponse.json(expandLease(lease))
  }),

  // POST /leases/:id/sign — manager or tenant signs the lease.
  // Body: { signature: "Full Name" }. Role is inferred from the token.
  // Lifecycle: draft -> manager signs -> pending_tenant -> tenant signs -> active.
  http.post(`${API}/leases/:id/sign`, async ({ request, params }) => {
    await net()
    const [payload, err] = requireAuth(request)
    if (err) return err
    const lease = db.leases.find((l) => l.lease_id === params.id)
    if (!lease)
      return HttpResponse.json({ detail: "Not found" }, { status: 404 })
    const body = await request.json()
    if (!body.signature || !body.signature.trim()) {
      return HttpResponse.json(
        { detail: "Signature is required" },
        { status: 422 },
      )
    }
    const signature = body.signature.trim()
    const nowIso = new Date().toISOString()

    if (payload.role === "manager" || payload.role === "admin") {
      if (lease.status !== "draft") {
        return HttpResponse.json(
          { detail: `Cannot sign as manager from status: ${lease.status}` },
          { status: 409 },
        )
      }
      lease.manager_signature = signature
      lease.manager_signed_at = nowIso
      lease.manager_id = payload.user_id
      lease.status = "pending_tenant"
      // Notify the tenant that the lease is ready to sign.
      db.notifications.unshift({
        notification_id: crypto.randomUUID(),
        user_id: lease.tenant_id,
        event_type: "lease_pending_signature",
        message: "Your lease is ready for your signature.",
        is_read: false,
        created_at: nowIso,
      })
    } else if (payload.role === "tenant") {
      if (lease.tenant_id !== payload.user_id) {
        return HttpResponse.json({ detail: "Forbidden" }, { status: 403 })
      }
      if (lease.status !== "pending_tenant") {
        return HttpResponse.json(
          { detail: `Cannot sign as tenant from status: ${lease.status}` },
          { status: 409 },
        )
      }
      lease.tenant_signature = signature
      lease.tenant_signed_at = nowIso
      lease.status = "active"
      // Mark unit occupied + notify manager.
      const unit = db.units.find((u) => u.unit_id === lease.unit_id)
      if (unit) unit.is_occupied = true
      if (lease.manager_id) {
        db.notifications.unshift({
          notification_id: crypto.randomUUID(),
          user_id: lease.manager_id,
          event_type: "lease_signed",
          message: `Lease for unit ${unit?.unit_number ?? ""} is fully signed.`,
          is_read: false,
          created_at: nowIso,
        })
      }
      // Generate the first rent invoice (pending) so payment flow works.
      db.payments.unshift({
        payment_id: `pay-${lease.lease_id.slice(0, 8)}-1`,
        lease_id: lease.lease_id,
        tenant_id: lease.tenant_id,
        amount: String(lease.monthly_rent),
        due_date: lease.start_date,
        payment_date: null,
        status: "pending",
        method: null,
        late_fee: "0.00",
        receipt_ref: null,
        created_at: nowIso,
        notes: null,
      })
    } else {
      return HttpResponse.json({ detail: "Forbidden" }, { status: 403 })
    }
    return HttpResponse.json(expandLease(lease))
  }),
]

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
function expandPayment(p) {
  const lease = db.leases.find((l) => l.lease_id === p.lease_id)
  const unit = lease ? db.units.find((u) => u.unit_id === lease.unit_id) : null
  const property = unit
    ? db.properties.find((pp) => pp.property_id === unit.property_id)
    : null
  const tenant = db.users.find((u) => u.user_id === p.tenant_id)
  return {
    ...p,
    lease: lease || null,
    unit: unit || null,
    property: property || null,
    tenant: tenant ? stripPw(tenant) : null,
  }
}

const payments = [
  http.get(`${API}/payments`, async ({ request }) => {
    await net()
    const [payload, err] = requireAuth(request)
    if (err) return err
    const url = new URL(request.url)
    const statusFilter = url.searchParams.get("status")
    let list = db.payments
    if (payload.role === "tenant") {
      list = list.filter((p) => p.tenant_id === payload.user_id)
    } else if (payload.role === "owner") {
      const ownedProps = new Set(
        db.properties
          .filter((p) => p.owner_id === payload.user_id)
          .map((p) => p.property_id),
      )
      const ownedUnits = new Set(
        db.units
          .filter((u) => ownedProps.has(u.property_id))
          .map((u) => u.unit_id),
      )
      const ownedLeases = new Set(
        db.leases
          .filter((l) => ownedUnits.has(l.unit_id))
          .map((l) => l.lease_id),
      )
      list = list.filter((p) => ownedLeases.has(p.lease_id))
    }
    if (statusFilter) list = list.filter((p) => p.status === statusFilter)
    list = [...list].sort((a, b) => (a.due_date < b.due_date ? 1 : -1))
    return HttpResponse.json(list.map(expandPayment))
  }),

  http.get(`${API}/payments/:id`, async ({ request, params }) => {
    await net()
    const [, err] = requireAuth(request)
    if (err) return err
    const p = db.payments.find((p) => p.payment_id === params.id)
    if (!p) return HttpResponse.json({ detail: "Not found" }, { status: 404 })
    return HttpResponse.json(expandPayment(p))
  }),

  // POST /payments/{id}/process — Strategy pattern entry point
  http.post(`${API}/payments/:id/process`, async ({ request, params }) => {
    await net()
    const [payload, err] = requireAuth(request, ["tenant"])
    if (err) return err
    const p = db.payments.find((p) => p.payment_id === params.id)
    if (!p) return HttpResponse.json({ detail: "Not found" }, { status: 404 })
    if (p.tenant_id !== payload.user_id) {
      return HttpResponse.json({ detail: "Forbidden" }, { status: 403 })
    }
    if (p.status === "paid") {
      return HttpResponse.json(
        { detail: "Payment already settled" },
        { status: 409 },
      )
    }
    const body = await request.json()
    const validMethods = ["credit_card", "bank_transfer", "balance"]
    if (!validMethods.includes(body.method)) {
      return HttpResponse.json(
        { detail: `Unknown payment method: ${body.method}` },
        { status: 422 },
      )
    }
    // Simulate strategy: credit_card / bank_transfer can fail randomly.
    if (body.simulate_failure) {
      p.status = "pending"
      return HttpResponse.json(
        { detail: "Payment processor declined" },
        { status: 402 },
      )
    }
    p.status = "paid"
    p.method = body.method
    p.payment_date = new Date().toISOString()
    p.receipt_ref = `mongo-receipt-${p.payment_id}`

    // Observer pattern: emit a notification.
    db.notifications.unshift({
      notification_id: crypto.randomUUID(),
      user_id: p.tenant_id,
      event_type: "payment_received",
      message: `Your payment of $${p.amount} was received.`,
      is_read: false,
      created_at: new Date().toISOString(),
    })
    return HttpResponse.json(expandPayment(p))
  }),
]

// ---------------------------------------------------------------------------
// Maintenance Requests
// ---------------------------------------------------------------------------

// Valid State Machine transitions (mirrors the backend State pattern).
const MAINT_TRANSITIONS = {
  submitted: ["assigned", "cancelled"],
  assigned: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: ["closed"],
  closed: [],
  cancelled: [],
}

function expandMaintenance(req) {
  const unit = db.units.find((u) => u.unit_id === req.unit_id)
  const property = unit
    ? db.properties.find((p) => p.property_id === unit.property_id)
    : null
  const tenant = db.users.find((u) => u.user_id === req.tenant_id)
  const assignee = req.assigned_to
    ? db.users.find((u) => u.user_id === req.assigned_to)
    : null
  return {
    ...req,
    unit: unit || null,
    property: property || null,
    tenant: tenant ? stripPw(tenant) : null,
    assignee: assignee ? stripPw(assignee) : null,
    valid_transitions: MAINT_TRANSITIONS[req.status] || [],
  }
}

const maintenance = [
  http.get(`${API}/maintenance-requests`, async ({ request }) => {
    await net()
    const [payload, err] = requireAuth(request)
    if (err) return err
    let list = db.maintenance_requests
    if (payload.role === "tenant") {
      list = list.filter((r) => r.tenant_id === payload.user_id)
    } else if (payload.role === "owner") {
      const ownedProps = new Set(
        db.properties
          .filter((p) => p.owner_id === payload.user_id)
          .map((p) => p.property_id),
      )
      const ownedUnits = new Set(
        db.units
          .filter((u) => ownedProps.has(u.property_id))
          .map((u) => u.unit_id),
      )
      list = list.filter((r) => ownedUnits.has(r.unit_id))
    }
    list = [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return HttpResponse.json(list.map(expandMaintenance))
  }),

  http.get(`${API}/maintenance-requests/:id`, async ({ request, params }) => {
    await net()
    const [, err] = requireAuth(request)
    if (err) return err
    const r = db.maintenance_requests.find((r) => r.request_id === params.id)
    if (!r) return HttpResponse.json({ detail: "Not found" }, { status: 404 })
    return HttpResponse.json(expandMaintenance(r))
  }),

  http.post(`${API}/maintenance-requests`, async ({ request }) => {
    await net()
    const [payload, err] = requireAuth(request, ["tenant"])
    if (err) return err
    const body = await request.json()
    // Find tenant's active lease to derive their unit.
    const lease = db.leases.find(
      (l) => l.tenant_id === payload.user_id && l.status === "active",
    )
    if (!lease) {
      return HttpResponse.json(
        { detail: "No active lease found for tenant" },
        { status: 400 },
      )
    }
    const req = {
      request_id: crypto.randomUUID(),
      unit_id: lease.unit_id,
      tenant_id: payload.user_id,
      assigned_to: null,
      title: body.title,
      description: body.description ?? "",
      priority: body.priority || "medium",
      status: "submitted",
      escalated: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    db.maintenance_requests.push(req)
    // Notify the manager(s).
    db.users
      .filter((u) => u.role === "manager")
      .forEach((m) => {
        db.notifications.unshift({
          notification_id: crypto.randomUUID(),
          user_id: m.user_id,
          event_type: "maintenance_submitted",
          message: `New ${req.priority} request: "${req.title}"`,
          is_read: false,
          created_at: new Date().toISOString(),
        })
      })
    return HttpResponse.json(expandMaintenance(req), { status: 201 })
  }),

  // Transition the state machine. Body: { event: "assign"|"start"|"complete"|"close"|"cancel", assigned_to?: uuid }
  http.put(`${API}/maintenance-requests/:id`, async ({ request, params }) => {
    await net()
    const [payload, err] = requireAuth(request)
    if (err) return err
    const req = db.maintenance_requests.find(
      (r) => r.request_id === params.id,
    )
    if (!req)
      return HttpResponse.json({ detail: "Not found" }, { status: 404 })

    const body = await request.json()
    // Compute target status from event or direct status.
    const eventToStatus = {
      assign: "assigned",
      start: "in_progress",
      complete: "completed",
      close: "closed",
      cancel: "cancelled",
    }
    const target = body.status || (body.event && eventToStatus[body.event])
    if (target) {
      const allowed = MAINT_TRANSITIONS[req.status] || []
      if (!allowed.includes(target)) {
        return HttpResponse.json(
          {
            detail: `Invalid transition: ${req.status} -> ${target}`,
            valid_transitions: allowed,
          },
          { status: 409 },
        )
      }
      req.status = target
    }
    if (body.assigned_to !== undefined) req.assigned_to = body.assigned_to
    if (body.priority) req.priority = body.priority
    if (body.escalated !== undefined) req.escalated = body.escalated
    req.updated_at = new Date().toISOString()

    // Observer: notify tenant on status change.
    if (target) {
      db.notifications.unshift({
        notification_id: crypto.randomUUID(),
        user_id: req.tenant_id,
        event_type: "maintenance_status_changed",
        message: `Your request "${req.title}" is now ${target.replace("_", " ")}.`,
        is_read: false,
        created_at: new Date().toISOString(),
      })
    }
    return HttpResponse.json(expandMaintenance(req))
  }),
]

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
const notifications = [
  http.get(`${API}/notifications`, async ({ request }) => {
    await net()
    const [payload, err] = requireAuth(request)
    if (err) return err
    const list = db.notifications
      .filter((n) => n.user_id === payload.user_id)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return HttpResponse.json(list)
  }),

  http.post(
    `${API}/notifications/:id/read`,
    async ({ request, params }) => {
      await net()
      const [payload, err] = requireAuth(request)
      if (err) return err
      const n = db.notifications.find((n) => n.notification_id === params.id)
      if (!n)
        return HttpResponse.json({ detail: "Not found" }, { status: 404 })
      if (n.user_id !== payload.user_id) {
        return HttpResponse.json({ detail: "Forbidden" }, { status: 403 })
      }
      n.is_read = true
      return HttpResponse.json(n)
    },
  ),

  http.post(`${API}/notifications/read-all`, async ({ request }) => {
    await net()
    const [payload, err] = requireAuth(request)
    if (err) return err
    let updated = 0
    db.notifications.forEach((n) => {
      if (n.user_id === payload.user_id && !n.is_read) {
        n.is_read = true
        updated += 1
      }
    })
    return HttpResponse.json({ updated })
  }),
]

// ---------------------------------------------------------------------------
// Manager directory — owners browse this when picking a manager for a new
// property. Profile data is seeded; live stats (active properties, open
// tickets, total units) are computed from the rest of the db.
// ---------------------------------------------------------------------------
function expandManager(profile) {
  const user = db.users.find((u) => u.user_id === profile.manager_id)
  if (!user) return null
  const managedProperties = db.properties.filter(
    (p) => p.manager_id === profile.manager_id,
  )
  const managedUnitIds = new Set(
    db.units
      .filter((u) =>
        managedProperties.some((p) => p.property_id === u.property_id),
      )
      .map((u) => u.unit_id),
  )
  const openTickets = db.maintenance_requests.filter(
    (r) => managedUnitIds.has(r.unit_id) && !["closed", "cancelled"].includes(r.status),
  ).length
  const activeLeases = db.leases.filter(
    (l) => managedUnitIds.has(l.unit_id) && l.status === "active",
  ).length
  return {
    ...profile,
    user: stripPw(user),
    active_properties: managedProperties.length,
    active_units: managedUnitIds.size,
    active_leases: activeLeases,
    open_tickets: openTickets,
  }
}

const managers = [
  http.get(`${API}/managers`, async ({ request }) => {
    await net()
    const [, err] = requireAuth(request)
    if (err) return err
    const list = db.manager_profiles
      .map(expandManager)
      .filter(Boolean)
      .sort((a, b) => b.rating - a.rating)
    return HttpResponse.json(list)
  }),

  http.get(`${API}/managers/:id`, async ({ request, params }) => {
    await net()
    const [, err] = requireAuth(request)
    if (err) return err
    const profile = db.manager_profiles.find(
      (p) => p.manager_id === params.id,
    )
    if (!profile)
      return HttpResponse.json({ detail: "Not found" }, { status: 404 })
    return HttpResponse.json(expandManager(profile))
  }),
]

// ---------------------------------------------------------------------------
// Management offers — owner -> manager engagements.
// ---------------------------------------------------------------------------
function expandOffer(o) {
  const property = db.properties.find((p) => p.property_id === o.property_id)
  const owner = db.users.find((u) => u.user_id === o.owner_id)
  const manager = db.users.find((u) => u.user_id === o.manager_id)
  return {
    ...o,
    property: property ? expandProperty(property) : null,
    owner: owner ? stripPw(owner) : null,
    manager: manager ? stripPw(manager) : null,
  }
}

const offers = [
  http.get(`${API}/management-offers`, async ({ request }) => {
    await net()
    const [payload, err] = requireAuth(request)
    if (err) return err
    let list = db.management_offers
    if (payload.role === "owner") {
      list = list.filter((o) => o.owner_id === payload.user_id)
    } else if (payload.role === "manager") {
      list = list.filter((o) => o.manager_id === payload.user_id)
    } else if (payload.role === "tenant") {
      return HttpResponse.json({ detail: "Forbidden" }, { status: 403 })
    }
    list = [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return HttpResponse.json(list.map(expandOffer))
  }),

  http.get(`${API}/management-offers/:id`, async ({ request, params }) => {
    await net()
    const [payload, err] = requireAuth(request)
    if (err) return err
    const o = db.management_offers.find((o) => o.offer_id === params.id)
    if (!o) return HttpResponse.json({ detail: "Not found" }, { status: 404 })
    if (payload.role === "owner" && o.owner_id !== payload.user_id) {
      return HttpResponse.json({ detail: "Forbidden" }, { status: 403 })
    }
    if (payload.role === "manager" && o.manager_id !== payload.user_id) {
      return HttpResponse.json({ detail: "Forbidden" }, { status: 403 })
    }
    return HttpResponse.json(expandOffer(o))
  }),

  // Owner creates an offer to a specific manager for a specific property.
  http.post(`${API}/management-offers`, async ({ request }) => {
    await net()
    const [payload, err] = requireAuth(request, ["owner", "admin"])
    if (err) return err
    const body = await request.json()
    const property = db.properties.find(
      (p) => p.property_id === body.property_id,
    )
    if (!property) {
      return HttpResponse.json(
        { detail: "Property not found" },
        { status: 404 },
      )
    }
    if (payload.role === "owner" && property.owner_id !== payload.user_id) {
      return HttpResponse.json({ detail: "Forbidden" }, { status: 403 })
    }
    const manager = db.users.find(
      (u) => u.user_id === body.manager_id && u.role === "manager",
    )
    if (!manager) {
      return HttpResponse.json(
        { detail: "Manager not found" },
        { status: 404 },
      )
    }
    // Reject if there's already a pending offer for this property.
    if (
      db.management_offers.some(
        (o) =>
          o.property_id === body.property_id && o.status === "pending",
      )
    ) {
      return HttpResponse.json(
        { detail: "An offer is already pending for this property." },
        { status: 409 },
      )
    }
    const owner = db.users.find((u) => u.user_id === property.owner_id)
    const offer = {
      offer_id: crypto.randomUUID(),
      property_id: body.property_id,
      owner_id: property.owner_id,
      manager_id: body.manager_id,
      status: "pending",
      proposed_message: body.proposed_message || "",
      management_fee_percent: null,
      onboarding_fee: null,
      owner_signature: owner?.name || null,
      owner_signed_at: new Date().toISOString(),
      manager_signature: null,
      manager_signed_at: null,
      decline_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    db.management_offers.push(offer)
    db.notifications.unshift({
      notification_id: crypto.randomUUID(),
      user_id: body.manager_id,
      event_type: "offer_received",
      message: `New management offer from ${owner?.name || "an owner"} for ${property.name}.`,
      is_read: false,
      created_at: new Date().toISOString(),
    })
    return HttpResponse.json(expandOffer(offer), { status: 201 })
  }),

  // PUT /management-offers/:id — handles accept / decline / withdraw events.
  // Body shapes:
  //   { event: "accept", management_fee_percent, onboarding_fee, signature }
  //   { event: "decline", reason }
  //   { event: "withdraw" }
  http.put(`${API}/management-offers/:id`, async ({ request, params }) => {
    await net()
    const [payload, err] = requireAuth(request)
    if (err) return err
    const o = db.management_offers.find((o) => o.offer_id === params.id)
    if (!o) return HttpResponse.json({ detail: "Not found" }, { status: 404 })
    const body = await request.json()
    const event = body.event
    const nowIso = new Date().toISOString()

    if (event === "accept") {
      if (payload.role !== "manager" && payload.role !== "admin") {
        return HttpResponse.json({ detail: "Forbidden" }, { status: 403 })
      }
      if (o.manager_id !== payload.user_id) {
        return HttpResponse.json({ detail: "Forbidden" }, { status: 403 })
      }
      if (o.status !== "pending") {
        return HttpResponse.json(
          { detail: `Cannot accept offer in status: ${o.status}` },
          { status: 409 },
        )
      }
      if (
        body.management_fee_percent === undefined ||
        body.management_fee_percent === null ||
        Number.isNaN(Number(body.management_fee_percent))
      ) {
        return HttpResponse.json(
          { detail: "management_fee_percent is required" },
          { status: 422 },
        )
      }
      if (!body.signature || !body.signature.trim()) {
        return HttpResponse.json(
          { detail: "Signature is required to accept" },
          { status: 422 },
        )
      }
      o.management_fee_percent = Number(body.management_fee_percent)
      o.onboarding_fee = body.onboarding_fee ?? "0.00"
      o.manager_signature = body.signature.trim()
      o.manager_signed_at = nowIso
      o.status = "accepted"
      o.updated_at = nowIso
      // Set the manager on the property.
      const property = db.properties.find(
        (p) => p.property_id === o.property_id,
      )
      if (property) property.manager_id = o.manager_id
      // Notify the owner.
      db.notifications.unshift({
        notification_id: crypto.randomUUID(),
        user_id: o.owner_id,
        event_type: "offer_accepted",
        message: `Your offer for ${property?.name || "the property"} was accepted.`,
        is_read: false,
        created_at: nowIso,
      })
      return HttpResponse.json(expandOffer(o))
    }

    if (event === "decline") {
      if (payload.role !== "manager" && payload.role !== "admin") {
        return HttpResponse.json({ detail: "Forbidden" }, { status: 403 })
      }
      if (o.manager_id !== payload.user_id) {
        return HttpResponse.json({ detail: "Forbidden" }, { status: 403 })
      }
      if (o.status !== "pending") {
        return HttpResponse.json(
          { detail: `Cannot decline offer in status: ${o.status}` },
          { status: 409 },
        )
      }
      o.status = "declined"
      o.decline_reason = body.reason || null
      o.updated_at = nowIso
      const property = db.properties.find(
        (p) => p.property_id === o.property_id,
      )
      db.notifications.unshift({
        notification_id: crypto.randomUUID(),
        user_id: o.owner_id,
        event_type: "offer_declined",
        message: `Your offer for ${property?.name || "the property"} was declined.`,
        is_read: false,
        created_at: nowIso,
      })
      return HttpResponse.json(expandOffer(o))
    }

    if (event === "withdraw") {
      if (payload.role !== "owner" && payload.role !== "admin") {
        return HttpResponse.json({ detail: "Forbidden" }, { status: 403 })
      }
      if (o.owner_id !== payload.user_id) {
        return HttpResponse.json({ detail: "Forbidden" }, { status: 403 })
      }
      if (o.status !== "pending") {
        return HttpResponse.json(
          { detail: `Cannot withdraw offer in status: ${o.status}` },
          { status: 409 },
        )
      }
      o.status = "withdrawn"
      o.updated_at = nowIso
      return HttpResponse.json(expandOffer(o))
    }

    return HttpResponse.json(
      { detail: `Unknown offer event: ${event}` },
      { status: 422 },
    )
  }),
]

// ---------------------------------------------------------------------------
// Tenant invites — manager creates an account for a new tenant and links them
// to a unit. The tenant gets a temp password they can use to log in.
// ---------------------------------------------------------------------------
const tenantInvites = [
  http.get(`${API}/tenant-invites`, async ({ request }) => {
    await net()
    const [payload, err] = requireAuth(request, [
      "manager",
      "admin",
      "owner",
    ])
    if (err) return err
    let list = db.tenant_invites
    if (payload.role === "manager") {
      list = list.filter((i) => i.manager_id === payload.user_id)
    } else if (payload.role === "owner") {
      const ownedProps = new Set(
        db.properties
          .filter((p) => p.owner_id === payload.user_id)
          .map((p) => p.property_id),
      )
      list = list.filter((i) => ownedProps.has(i.property_id))
    }
    return HttpResponse.json(list)
  }),

  http.post(`${API}/tenant-invites`, async ({ request }) => {
    await net()
    const [payload, err] = requireAuth(request, ["manager", "admin"])
    if (err) return err
    const body = await request.json()
    if (!body.email || !body.name) {
      return HttpResponse.json(
        { detail: "name and email are required" },
        { status: 422 },
      )
    }
    if (db.users.some((u) => u.email === body.email)) {
      return HttpResponse.json(
        { detail: "A user with this email already exists." },
        { status: 409 },
      )
    }
    const tempPassword = "welcome123"
    const tenant = {
      user_id: crypto.randomUUID(),
      email: body.email,
      password: tempPassword,
      name: body.name,
      role: "tenant",
      phone: body.phone || null,
      is_active: true,
      created_at: new Date().toISOString(),
    }
    db.users.push(tenant)
    const invite = {
      invite_id: crypto.randomUUID(),
      manager_id: payload.user_id,
      property_id: body.property_id,
      unit_id: body.unit_id,
      name: body.name,
      email: body.email,
      phone: body.phone || null,
      status: "sent",
      user_id: tenant.user_id,
      temp_password: tempPassword,
      created_at: new Date().toISOString(),
    }
    db.tenant_invites.push(invite)
    db.notifications.unshift({
      notification_id: crypto.randomUUID(),
      user_id: tenant.user_id,
      event_type: "tenant_invited",
      message: `Welcome to EazyLiving — your account has been set up by your property manager.`,
      is_read: false,
      created_at: new Date().toISOString(),
    })
    return HttpResponse.json(
      { invite, user: stripPw(tenant), temp_password: tempPassword },
      { status: 201 },
    )
  }),
]

export const handlers = [
  ...auth,
  ...users,
  ...properties,
  ...leases,
  ...payments,
  ...maintenance,
  ...notifications,
  ...managers,
  ...offers,
  ...tenantInvites,
]
