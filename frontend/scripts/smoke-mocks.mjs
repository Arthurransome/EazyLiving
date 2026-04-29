/**
 * Smoke test for the MSW mock layer.
 *
 * Spins up an msw/node server with our handlers, fires real fetch() calls at
 * /api/v1/*, and asserts a handful of contract behaviors. Run with:
 *
 *   node scripts/smoke-mocks.mjs
 */
import { setupServer } from "msw/node"

import { handlers } from "../src/mocks/handlers.js"
import { resetDb } from "../src/mocks/db.js"

const server = setupServer(...handlers)
server.listen({ onUnhandledRequest: "error" })

const BASE = "http://localhost/api/v1"
let pass = 0
let fail = 0

function ok(name, cond, extra = "") {
  if (cond) {
    console.log(`  PASS  ${name}`)
    pass += 1
  } else {
    console.log(`  FAIL  ${name}  ${extra}`)
    fail += 1
  }
}

async function http(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) }
  const body = options.body ? JSON.stringify(options.body) : undefined
  const res = await fetch(`${BASE}${path}`, {
    method: options.method || (body ? "POST" : "GET"),
    headers,
    body,
  })
  let data = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  return { status: res.status, data }
}

async function run() {
  console.log("\nAuth")
  let r = await http("/auth/login", { body: { email: "tenant@eazy.com", password: "password" } })
  ok("tenant login returns 200", r.status === 200, `got ${r.status}`)
  ok("tenant login returns token + user", !!r.data.token && r.data.user.role === "tenant")
  const tenantToken = r.data.token

  r = await http("/auth/login", { body: { email: "tenant@eazy.com", password: "wrong" } })
  ok("bad password returns 401", r.status === 401)

  r = await http("/auth/me", { headers: { Authorization: `Bearer ${tenantToken}` } })
  ok("me returns the logged in user", r.status === 200 && r.data.email === "tenant@eazy.com")

  r = await http("/auth/me")
  ok("me without token returns 401", r.status === 401)

  // owner & manager logins
  const owner = await http("/auth/login", { body: { email: "owner@eazy.com", password: "password" } })
  const manager = await http("/auth/login", { body: { email: "manager@eazy.com", password: "password" } })
  ok("owner + manager log in", owner.status === 200 && manager.status === 200)
  const ownerToken = owner.data.token
  const managerToken = manager.data.token

  console.log("\nProperties")
  r = await http("/properties", { headers: { Authorization: `Bearer ${ownerToken}` } })
  ok("owner sees their properties", r.status === 200 && r.data.length === 2)

  r = await http("/properties", { headers: { Authorization: `Bearer ${tenantToken}` } })
  ok("tenant sees only their property", r.status === 200 && r.data.length === 1)

  console.log("\nLeases")
  r = await http("/leases", { headers: { Authorization: `Bearer ${tenantToken}` } })
  ok("tenant sees their lease", r.status === 200 && r.data.length === 1 && r.data[0].status === "active")
  ok("lease is expanded with unit + property", !!r.data[0].unit && !!r.data[0].property)

  console.log("\nPayments + Strategy")
  r = await http("/payments", { headers: { Authorization: `Bearer ${tenantToken}` } })
  ok("tenant payment history loads", r.status === 200 && r.data.length >= 6)
  const pending = r.data.find((p) => p.status === "pending")
  ok("tenant has a pending payment", !!pending)

  r = await http(`/payments/${pending.payment_id}/process`, {
    headers: { Authorization: `Bearer ${tenantToken}` },
    body: { method: "credit_card" },
  })
  ok("pay rent (credit_card) succeeds", r.status === 200 && r.data.status === "paid")

  r = await http(`/payments/${pending.payment_id}/process`, {
    headers: { Authorization: `Bearer ${tenantToken}` },
    body: { method: "credit_card" },
  })
  ok("paying an already-paid invoice returns 409", r.status === 409)

  // Reset db so the rest of the suite is deterministic.
  resetDb()
  // Re-login since reset doesn't invalidate existing tokens.
  const tenantR = await http("/auth/login", { body: { email: "tenant@eazy.com", password: "password" } })
  const tToken = tenantR.data.token
  const mgrR = await http("/auth/login", { body: { email: "manager@eazy.com", password: "password" } })
  const mToken = mgrR.data.token

  console.log("\nMaintenance + State machine")
  r = await http("/maintenance-requests", { headers: { Authorization: `Bearer ${tToken}` } })
  const initialCount = r.data.length
  ok("tenant can list maintenance requests", r.status === 200)

  r = await http("/maintenance-requests", {
    headers: { Authorization: `Bearer ${tToken}` },
    body: { title: "Oven won't turn on", description: "No power.", priority: "high" },
  })
  ok("tenant can submit a request", r.status === 201 && r.data.status === "submitted")
  const newReqId = r.data.request_id

  r = await http("/maintenance-requests", { headers: { Authorization: `Bearer ${tToken}` } })
  ok("submitted request appears in list", r.data.length === initialCount + 1)

  // Invalid transition: submitted -> completed (must go via assigned/in_progress)
  r = await http(`/maintenance-requests/${newReqId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${mToken}` },
    body: { status: "completed" },
  })
  ok("invalid state transition rejected with 409", r.status === 409)

  // Valid path: submitted -> assigned -> in_progress -> completed
  r = await http(`/maintenance-requests/${newReqId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${mToken}` },
    body: { event: "assign", assigned_to: r.data.tenant_id ?? "55555555-5555-5555-5555-555555555555" },
  })
  ok("manager can assign (submitted -> assigned)", r.status === 200 && r.data.status === "assigned")

  r = await http(`/maintenance-requests/${newReqId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${mToken}` },
    body: { event: "start" },
  })
  ok("manager can start (assigned -> in_progress)", r.status === 200 && r.data.status === "in_progress")

  console.log("\nNotifications + Observer")
  r = await http("/notifications", { headers: { Authorization: `Bearer ${tToken}` } })
  ok("tenant has notifications including state-change observer events", r.status === 200 && r.data.length >= 2)
  const unread = r.data.find((n) => !n.is_read)
  ok("at least one is unread", !!unread)

  r = await http(`/notifications/${unread.notification_id}/read`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tToken}` },
  })
  ok("mark-as-read flips is_read", r.status === 200 && r.data.is_read === true)

  console.log("\nAuthZ")
  r = await http("/users", { headers: { Authorization: `Bearer ${tToken}` } })
  ok("tenant cannot list users (403)", r.status === 403)

  r = await http("/properties", {
    method: "POST",
    headers: { Authorization: `Bearer ${tToken}` },
    body: { name: "Sneaky Plaza", address: "1 Hax St", city: "X", state: "Y", zip_code: "0" },
  })
  ok("tenant cannot create properties (403)", r.status === 403)

  console.log("\nOwner scope")
  r = await http("/properties", { headers: { Authorization: `Bearer ${ownerToken}` } })
  ok(
    "owner only sees their own properties",
    r.status === 200 && r.data.length === 2 && r.data.every((p) => p.owner.email === "owner@eazy.com"),
  )
  r = await http("/payments", { headers: { Authorization: `Bearer ${ownerToken}` } })
  ok(
    "owner sees portfolio payments (filtered server-side)",
    r.status === 200 && r.data.length > 0,
  )
  r = await http("/maintenance-requests", {
    headers: { Authorization: `Bearer ${ownerToken}` },
  })
  ok(
    "owner sees portfolio maintenance requests",
    r.status === 200 && r.data.every((req) => req.property),
  )

  console.log("\nProfile editing")
  // Each user can edit themselves; they cannot edit other users.
  r = await http("/auth/me", { headers: { Authorization: `Bearer ${tToken}` } })
  const tenantId = r.data.user_id
  r = await http(`/users/${tenantId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${tToken}` },
    body: { phone: "+1-555-9999" },
  })
  ok(
    "tenant can update their own profile",
    r.status === 200 && r.data.phone === "+1-555-9999",
  )
  // Pick a different user id (the manager's) and try to edit it as the tenant.
  const managerMe = await http("/auth/me", {
    headers: { Authorization: `Bearer ${mToken}` },
  })
  r = await http(`/users/${managerMe.data.user_id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${tToken}` },
    body: { name: "Hacker McHackface" },
  })
  ok("tenant cannot edit other users (403)", r.status === 403)

  console.log("\nProperty + unit creation")
  r = await http("/properties", {
    method: "POST",
    headers: { Authorization: `Bearer ${mToken}` },
    body: {
      name: "Smoke Test Plaza",
      address: "1 Test Way",
      city: "Toronto",
      state: "ON",
      zip_code: "M1M 1M1",
      owner_id: owner.data.user.user_id,
    },
  })
  ok(
    "manager can create a property",
    r.status === 201 && r.data.name === "Smoke Test Plaza",
  )
  const newPropId = r.data.property_id

  r = await http(`/properties/${newPropId}/units`, {
    method: "POST",
    headers: { Authorization: `Bearer ${mToken}` },
    body: { unit_number: "999", monthly_rent: "2000.00", bedrooms: 2 },
  })
  ok(
    "manager can create a unit on the new property",
    r.status === 201 && r.data.unit_number === "999",
  )

  r = await http(`/properties/${newPropId}/units`, {
    headers: { Authorization: `Bearer ${mToken}` },
  })
  ok(
    "newly created unit shows up in the property's unit list",
    r.status === 200 && r.data.length === 1,
  )

  console.log("\nMaintenance reassignment + closure")
  // Continue with the request we just transitioned to in_progress.
  r = await http(`/maintenance-requests/${newReqId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${mToken}` },
    body: { event: "complete" },
  })
  ok(
    "manager can complete (in_progress -> completed)",
    r.status === 200 && r.data.status === "completed",
  )
  r = await http(`/maintenance-requests/${newReqId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${mToken}` },
    body: { event: "close" },
  })
  ok(
    "manager can close (completed -> closed)",
    r.status === 200 && r.data.status === "closed",
  )
  // Closed is terminal — further transitions should 409.
  r = await http(`/maintenance-requests/${newReqId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${mToken}` },
    body: { event: "start" },
  })
  ok("closed requests can't be reopened (409)", r.status === 409)

  console.log("\nMark-all-read + Notifications")
  r = await http("/notifications/read-all", {
    method: "POST",
    headers: { Authorization: `Bearer ${tToken}` },
  })
  ok("mark-all-read returns the count", r.status === 200 && typeof r.data.updated === "number")
  r = await http("/notifications", {
    headers: { Authorization: `Bearer ${tToken}` },
  })
  ok(
    "all notifications are now read",
    r.status === 200 && r.data.every((n) => n.is_read),
  )

  console.log(`\n${pass} pass, ${fail} fail`)
  server.close()
  if (fail > 0) process.exit(1)
}

run().catch((err) => {
  console.error("smoke test crashed:", err)
  server.close()
  process.exit(1)
})
