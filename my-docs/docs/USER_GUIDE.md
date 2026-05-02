# User Guide

This guide covers every feature of EazyLiving, organised by role. Jump to the section that matches your account type.

---

## Getting Started

### Create an Account

1. Go to `http://localhost:5173` and click **Register**.
2. Enter your name, email, and password.
3. Choose a **role** — this determines what you can see and do:

| Role | Choose if you are… |
| --- | --- |
| **Tenant** | Looking for a unit to rent, or already renting |
| **Manager** | Overseeing a property on behalf of the owner |
| **Owner** | The property owner |
| **Admin** | A system administrator |

1. Click **Create Account**. You are logged in immediately and sent to your dashboard.

> **Note:** Roles cannot be changed after registration. Contact an admin if yours needs to be corrected.

### Log In and Out

- **Login:** Enter email and password on the login page and click **Sign In**.
- **Logout:** Click your name or avatar in the top-right corner and select **Sign out**.
- Your session persists across browser refreshes until you sign out.

---

## Tenant

After login you land on the **Tenant Dashboard** (`/tenant/dashboard`).

### Dashboard

A snapshot of your rental situation:

- Active lease summary (unit, property, term)
- Next payment due
- Open maintenance requests

### Browse Available Units

All units that are currently available and unoccupied appear in the browsing pool with rent, size, and bedroom/bathroom count.

### Request a Lease

1. Find a unit in the available pool.
2. Click **Request Lease**.
3. Choose your **desired move-in** and **move-out** dates (move-out must be after move-in).
4. Add an optional message to the manager.
5. Submit.

The property manager is notified. You will receive an in-app notification when your request is approved or rejected.

!!! info "Request rules"
    - Only available, unoccupied units can be requested.
    - You cannot have two pending requests for the same unit at the same time.

### My Lease (`/tenant/lease`)

Shows your current active lease: unit number, property address, start and end dates, and monthly rent. If no active lease exists, any pending lease request is shown here instead.

### Payments (`/tenant/payments`)

All payment records tied to your lease, with their current status:

| Status | Meaning |
| --- | --- |
| **Pending** | Due but not yet paid |
| **Paid** | Payment received in full |
| **Partial** | Partial payment recorded |
| **Overdue** | Past due — a late fee may apply |

Click **Pay Now** on any pending or overdue payment to process it.

### Maintenance (`/tenant/maintenance`)

#### Submit a New Request

1. Click **New Request** on the maintenance page.
2. Enter a title, description, and priority level (Low / Medium / High / Urgent).
3. Submit. The manager is notified automatically.

#### Track Your Requests

Each request moves through a defined lifecycle:

```text
Submitted → Assigned → In Progress → Completed → Closed
```

A request can be cancelled at any point before it is completed.

Click any request in the list to open its detail view, which shows the full status timeline.

#### Cancel a Request

Open the request and click **Cancel** while it is still in **Submitted** status.

---

## Manager

After login you land on the **Manager Dashboard** (`/manager/dashboard`).

!!! warning "Scope"
    Managers are scoped to a **single assigned property**. All views — units, tenants, maintenance, lease requests — show only data for that property. An admin must assign you to a property before any data appears.

### Manager Dashboard

Key metrics for your property:

- Occupancy rate
- Open maintenance requests
- Pending lease requests

### Properties (`/manager/properties`)

Lists your assigned property and all its units. Click the property name to open the detail view.

#### Unit Detail

Each unit card shows its current status (available / occupied), monthly rent, and active tenant if occupied.

#### Add a Unit

1. Open the property detail.
2. Click **Add Unit**.
3. Enter unit number, rent, bedrooms, bathrooms, and square footage.

#### Toggle Unit Availability

Units have two independent flags:

| Flag | Controlled by | Meaning |
| --- | --- | --- |
| `is_occupied` | System (automatic) | A tenant is actively leasing this unit |
| `is_available` | Manager (manual) | The unit is listed in the available pool |

To hide a unit from tenants without terminating a lease:

1. Open the unit in the property detail.
2. Click **Edit** and set **Available** to off.
3. Save. The unit disappears from the browsable pool immediately.

Set it back to on when ready to list again.

### Lease Requests / Offers (`/manager/offers`)

All pending lease requests for your property are listed here.

#### Approve a Request

1. Click **Approve**.
2. A lease is automatically created and activated.
3. The unit is marked occupied.
4. All other pending requests for the same unit are auto-rejected.
5. The tenant is notified.

#### Reject a Request

1. Click **Decline**.
2. The request is rejected; the unit stays available.
3. The tenant is notified.

Use the **Pending Only** toggle to filter out already-processed requests.

### Tenants (`/manager/tenants`)

Lists every tenant with an active lease in your property. Click a tenant row to open their lease detail.

### Lease Detail (`/manager/leases/:id`)

Full lease information: tenant name, unit, dates, rent, and status. Available actions:

- **Activate** — move a draft lease to active
- **Terminate** — end an active lease (the unit becomes unoccupied automatically)

### Maintenance (`/manager/maintenance`)

All maintenance requests for your property.

#### Assign a Request

1. Open a request in **Submitted** status.
2. Click **Assign** and enter the technician's name or ID.
3. The technician receives an in-app notification.

#### Advance Through the Lifecycle

Use the action buttons in the request detail to transition state:

| Action | From state | To state |
| --- | --- | --- |
| Assign | Submitted | Assigned |
| Start | Assigned | In Progress |
| Complete | In Progress | Completed |
| Close | Completed | Closed |
| Escalate | Any active state | Escalated |
| Cancel | Any active state | Cancelled |

---

## Owner

After login you land on the **Owner Dashboard** (`/owner/dashboard`).

Owners have full control over all their properties and can see aggregate data across all of them.

### Owner Dashboard

Portfolio overview: total properties, total units, aggregate occupancy rate, and revenue.

### Properties (`/owner/properties`)

Lists every property you own.

#### Create a Property

1. Click **Add Property**.
2. Enter name, address, city, state, and zip code.
3. Optionally add units during creation.
4. Save.

#### Manage Units

Click any property to view and edit its units: add new units, update rent or details, delete units (vacant only).

#### Assigning a Manager

Owners cannot assign managers — this requires an **admin** account.
To get a manager assigned, have an admin call:

```http
PUT /api/v1/properties/{property_id}/manager
Body: { "manager_id": "<user-id>" }
```

Or do it directly in the admin panel at `http://localhost:8000/admin`.

### Lease Requests / Offers (`/owner/offers`)

Review and act on pending lease requests across all your properties — same approve / reject flow as managers, but covering every property you own.

---

## Admin

Admins share the manager interface (`/manager/*`) and have unrestricted access to all data.

### Assign a Manager to a Property

This is required before a manager can see or act on any data.

**Via Swagger UI** (`http://localhost:8000/docs`):

```http
PUT /api/v1/properties/{property_id}/manager
Body: { "manager_id": "<manager-user-id>" }
```

**Via Admin Panel** (`http://localhost:8000/admin`):

1. Log in with admin credentials.
2. Open the **Properties** table.
3. Edit the property and set `manager_id`.

### Remove a Manager

Same endpoint with `"manager_id": null`.

### Admin Panel

`http://localhost:8000/admin` provides a full database GUI:

- Users · Properties · Units · Leases · Lease Requests
- Payments · Maintenance Requests · Notifications

Use it for data inspection, manual corrections, and bulk updates.

### List All Users

```http
GET /api/v1/users
```

Returns all registered users. Only admins can call this endpoint.

---

## Notifications

The **bell icon** in the top navigation shows your unread count.

| Event | Notified user |
| --- | --- |
| Lease request submitted | Assigned property manager |
| Lease request approved | Tenant |
| Lease request rejected | Tenant |
| Lease activated | Tenant |
| Lease terminated | Tenant |
| Payment created (due) | Tenant |
| Payment received | Tenant |
| Payment partial | Tenant |
| Payment overdue | Tenant |
| Maintenance request received | Tenant (submitter) |
| Maintenance assigned | Assigned technician |
| Maintenance completed | Tenant (submitter) |

Click the bell to open the notifications panel. From there:

- Click any notification to mark it **read**
- Click **Mark all as read** to clear the badge at once
- Click the trash icon to **delete** a notification

---

## Profile

Click your avatar in the top-right and select **Profile**, or go to `/profile`.

You can update:

- Display name
- Email address
- Phone number
- Password

---

## FAQ

**Can I change my role?**
No — roles are set at registration. An admin can update your role via the admin panel.

**I can not find any available units.**
All units may be occupied, or the manager has manually hidden them. Contact the property office directly.

**I submitted a lease request but heard nothing.**
The manager has not yet reviewed it. You will receive a notification the moment they act on it. Pending requests are visible on your `/tenant/lease` page.

**My maintenance request has been sitting in Submitted for days.**
The manager has not assigned it yet. You can cancel and resubmit with a higher priority, or reach out to the office.

**My payment shows as Overdue.**
The due date has passed and the manager or owner has flagged it. Click **Pay Now** to clear it. A late fee may have been applied — check the payment detail for the exact amount.

**The page shows 403 Forbidden.**
You are signed in with the wrong role for that page. Sign out and log in with the correct account.

**The app shows a blank page.**
Make sure the backend is running on port 8000 before starting the frontend. See the [README](../../README.md) for startup instructions.
