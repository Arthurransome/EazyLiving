/**
 * In-memory database for the mocked backend.
 *
 * Shapes mirror shared/db/models.py + shared/db/enums.py from the backend.
 * All data is seeded fresh on page reload (so demo state is predictable).
 *
 * Roles:           owner | manager | tenant | admin
 * LeaseStatus:     draft | active | expiring_soon | expired | renewed | terminated
 * PaymentStatus:   pending | paid | partial | overdue
 * Maint. status:   submitted | assigned | in_progress | completed | closed | cancelled
 * Maint. priority: low | medium | high | emergency
 */

// Stable UUIDs so cross-references are easy to read in seed data.
const ID = {
  // users
  owner: "11111111-1111-1111-1111-111111111111",
  manager: "22222222-2222-2222-2222-222222222222",
  tenant1: "33333333-3333-3333-3333-333333333333",
  tenant2: "44444444-4444-4444-4444-444444444444",
  technician: "55555555-5555-5555-5555-555555555555",

  // properties
  property1: "aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa",
  property2: "aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa",

  // units
  unit_p1_101: "bbbbbbbb-1111-0001-0001-bbbbbbbbbbbb",
  unit_p1_102: "bbbbbbbb-1111-0001-0002-bbbbbbbbbbbb",
  unit_p1_201: "bbbbbbbb-1111-0002-0001-bbbbbbbbbbbb",
  unit_p2_1a: "bbbbbbbb-2222-0001-0001-bbbbbbbbbbbb",

  // leases
  lease_tessa: "cccccccc-1111-1111-1111-cccccccccccc",
  lease_tom: "cccccccc-2222-2222-2222-cccccccccccc",
}

const now = new Date()
const isoDaysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString()
const dateStr = (d) => d.toISOString().slice(0, 10)
const todayPlus = (n) => dateStr(new Date(now.getTime() + n * 86400000))

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------
function seed() {
  return {
    users: [
      {
        user_id: ID.owner,
        email: "owner@eazy.com",
        password: "password",
        name: "Olivia Owens",
        role: "owner",
        phone: "+1-555-0100",
        is_active: true,
        created_at: isoDaysAgo(400),
      },
      {
        user_id: ID.manager,
        email: "manager@eazy.com",
        password: "password",
        name: "Marcus Mendez",
        role: "manager",
        phone: "+1-555-0101",
        is_active: true,
        created_at: isoDaysAgo(380),
      },
      {
        user_id: ID.tenant1,
        email: "tenant@eazy.com",
        password: "password",
        name: "Tessa Tran",
        role: "tenant",
        phone: "+1-555-0200",
        is_active: true,
        created_at: isoDaysAgo(180),
      },
      {
        user_id: ID.tenant2,
        email: "tenant2@eazy.com",
        password: "password",
        name: "Tom Tanaka",
        role: "tenant",
        phone: "+1-555-0201",
        is_active: true,
        created_at: isoDaysAgo(120),
      },
      {
        user_id: ID.technician,
        email: "tech@eazy.com",
        password: "password",
        name: "Tariq Tech",
        role: "manager",
        phone: "+1-555-0300",
        is_active: true,
        created_at: isoDaysAgo(300),
      },
    ],
    properties: [
      {
        property_id: ID.property1,
        owner_id: ID.owner,
        name: "Maple Heights",
        address: "123 Maple Avenue",
        city: "Toronto",
        state: "ON",
        zip_code: "M5V 2K7",
        created_at: isoDaysAgo(390),
      },
      {
        property_id: ID.property2,
        owner_id: ID.owner,
        name: "Riverside Tower",
        address: "456 River Road",
        city: "Toronto",
        state: "ON",
        zip_code: "M4Y 1A8",
        created_at: isoDaysAgo(200),
      },
    ],
    units: [
      {
        unit_id: ID.unit_p1_101,
        property_id: ID.property1,
        unit_number: "101",
        bedrooms: 2,
        bathrooms: 1,
        square_feet: 820,
        monthly_rent: "1800.00",
        is_occupied: true,
      },
      {
        unit_id: ID.unit_p1_102,
        property_id: ID.property1,
        unit_number: "102",
        bedrooms: 1,
        bathrooms: 1,
        square_feet: 600,
        monthly_rent: "1500.00",
        is_occupied: true,
      },
      {
        unit_id: ID.unit_p1_201,
        property_id: ID.property1,
        unit_number: "201",
        bedrooms: 3,
        bathrooms: 2,
        square_feet: 1180,
        monthly_rent: "2500.00",
        is_occupied: false,
      },
      {
        unit_id: ID.unit_p2_1a,
        property_id: ID.property2,
        unit_number: "1A",
        bedrooms: 0,
        bathrooms: 1,
        square_feet: 450,
        monthly_rent: "1300.00",
        is_occupied: false,
      },
    ],
    leases: [
      {
        lease_id: ID.lease_tessa,
        unit_id: ID.unit_p1_101,
        tenant_id: ID.tenant1,
        start_date: dateStr(new Date(now.getFullYear(), now.getMonth() - 5, 1)),
        end_date: dateStr(new Date(now.getFullYear() + 1, now.getMonth() - 5, 1)),
        monthly_rent: "1800.00",
        security_deposit: "1800.00",
        status: "active",
        document_ref: "mongo-doc-lease-tessa",
        created_at: isoDaysAgo(160),
      },
      {
        lease_id: ID.lease_tom,
        unit_id: ID.unit_p1_102,
        tenant_id: ID.tenant2,
        start_date: dateStr(new Date(now.getFullYear(), now.getMonth() - 2, 15)),
        end_date: dateStr(new Date(now.getFullYear() + 1, now.getMonth() - 2, 15)),
        monthly_rent: "1500.00",
        security_deposit: "1500.00",
        status: "active",
        document_ref: "mongo-doc-lease-tom",
        created_at: isoDaysAgo(80),
      },
    ],
    payments: [
      // Tessa: 4 paid + 1 due in a few days
      ...[5, 4, 3, 2, 1].map((monthsAgo, i) => ({
        payment_id: `pay-tessa-${i + 1}`,
        lease_id: ID.lease_tessa,
        tenant_id: ID.tenant1,
        amount: "1800.00",
        due_date: dateStr(
          new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1),
        ),
        payment_date: isoDaysAgo(monthsAgo * 30 - 2),
        status: "paid",
        method: ["credit_card", "bank_transfer", "credit_card", "balance", "credit_card"][i],
        late_fee: "0.00",
        receipt_ref: `mongo-receipt-tessa-${i + 1}`,
        created_at: isoDaysAgo(monthsAgo * 30 - 5),
        notes: null,
      })),
      {
        payment_id: "pay-tessa-current",
        lease_id: ID.lease_tessa,
        tenant_id: ID.tenant1,
        amount: "1800.00",
        due_date: todayPlus(3),
        payment_date: null,
        status: "pending",
        method: null,
        late_fee: "0.00",
        receipt_ref: null,
        created_at: isoDaysAgo(2),
        notes: null,
      },
      // Tom: 1 paid + 1 overdue
      {
        payment_id: "pay-tom-1",
        lease_id: ID.lease_tom,
        tenant_id: ID.tenant2,
        amount: "1500.00",
        due_date: dateStr(new Date(now.getFullYear(), now.getMonth() - 1, 15)),
        payment_date: isoDaysAgo(28),
        status: "paid",
        method: "bank_transfer",
        late_fee: "0.00",
        receipt_ref: "mongo-receipt-tom-1",
        created_at: isoDaysAgo(35),
        notes: null,
      },
      {
        payment_id: "pay-tom-overdue",
        lease_id: ID.lease_tom,
        tenant_id: ID.tenant2,
        amount: "1500.00",
        due_date: todayPlus(-7),
        payment_date: null,
        status: "overdue",
        method: null,
        late_fee: "75.00",
        receipt_ref: null,
        created_at: isoDaysAgo(20),
        notes: null,
      },
    ],
    maintenance_requests: [
      {
        request_id: "maint-1",
        unit_id: ID.unit_p1_101,
        tenant_id: ID.tenant1,
        assigned_to: ID.technician,
        title: "Kitchen sink leaking under cabinet",
        description:
          "Slow drip from the cold-water shutoff valve. Bucket placed underneath.",
        priority: "medium",
        status: "in_progress",
        escalated: false,
        created_at: isoDaysAgo(3),
        updated_at: isoDaysAgo(1),
      },
      {
        request_id: "maint-2",
        unit_id: ID.unit_p1_101,
        tenant_id: ID.tenant1,
        assigned_to: null,
        title: "Bedroom window won't latch",
        description: "Latch turns but doesn't catch — security concern.",
        priority: "high",
        status: "submitted",
        escalated: false,
        created_at: isoDaysAgo(1),
        updated_at: isoDaysAgo(1),
      },
      {
        request_id: "maint-3",
        unit_id: ID.unit_p1_102,
        tenant_id: ID.tenant2,
        assigned_to: ID.technician,
        title: "No heat in living room",
        description: "Thermostat reads 12°C even when set to 22°C.",
        priority: "emergency",
        status: "assigned",
        escalated: true,
        created_at: isoDaysAgo(2),
        updated_at: isoDaysAgo(2),
      },
      {
        request_id: "maint-4",
        unit_id: ID.unit_p1_102,
        tenant_id: ID.tenant2,
        assigned_to: ID.technician,
        title: "Replace smoke detector battery",
        description: "Beeping every 60 seconds.",
        priority: "low",
        status: "completed",
        escalated: false,
        created_at: isoDaysAgo(15),
        updated_at: isoDaysAgo(13),
      },
    ],
    notifications: [
      {
        notification_id: "notif-tessa-1",
        user_id: ID.tenant1,
        event_type: "rent_due_soon",
        message: "Your rent of $1800.00 is due in 3 days.",
        is_read: false,
        created_at: isoDaysAgo(0),
      },
      {
        notification_id: "notif-tessa-2",
        user_id: ID.tenant1,
        event_type: "maintenance_status_changed",
        message: "Your request 'Kitchen sink leaking' is now In Progress.",
        is_read: false,
        created_at: isoDaysAgo(1),
      },
      {
        notification_id: "notif-tom-1",
        user_id: ID.tenant2,
        event_type: "payment_overdue",
        message: "Your rent payment is 7 days overdue. Late fee applied.",
        is_read: false,
        created_at: isoDaysAgo(7),
      },
      {
        notification_id: "notif-manager-1",
        user_id: ID.manager,
        event_type: "maintenance_escalated",
        message: "Emergency request 'No heat in living room' has been escalated.",
        is_read: false,
        created_at: isoDaysAgo(2),
      },
      {
        notification_id: "notif-manager-2",
        user_id: ID.manager,
        event_type: "payment_received",
        message: "Payment of $1500.00 received from Tom Tanaka.",
        is_read: true,
        created_at: isoDaysAgo(28),
      },
      {
        notification_id: "notif-owner-1",
        user_id: ID.owner,
        event_type: "monthly_summary",
        message: "April collected $5,100. 2 of 4 units occupied.",
        is_read: false,
        created_at: isoDaysAgo(0),
      },
    ],
  }
}

// Live, mutable instance — handlers read & write here.
export const db = seed()

// Useful for tests / dev tools.
export function resetDb() {
  const fresh = seed()
  Object.keys(db).forEach((k) => delete db[k])
  Object.assign(db, fresh)
}

export { ID }
