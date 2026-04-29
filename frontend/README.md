# EazyLiving — Frontend

The web client for **EazyLiving**, a distributed apartment management platform built for a graduate-level distributed systems class. The backend is a FastAPI microservice cluster backed by PostgreSQL, Redis, and MongoDB; this folder is the React SPA that consumes it.

While the backend is being wired up, the frontend ships with a **complete in-browser mock of every API endpoint** (built on [MSW v2](https://mswjs.io/)). That means you can `npm run dev`, log in as any of the seeded demo accounts, and walk through every flow end-to-end without standing up the backend.

---

## Stack

- **Vite 8** + **React 19** (JSX, no TypeScript)
- **Tailwind CSS v4** (`@tailwindcss/vite`, oklch palette, slate base)
- **shadcn/ui** primitives (manual setup, lucide icons)
- **React Router v7** (v6-compatible JSX API)
- **Recharts** for owner portfolio analytics
- **MSW v2** for the mocked API layer (browser worker + `msw/node` smoke harness)

---

## Quick start

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The app starts with the MSW worker active and all data seeded fresh on every reload, so demo state is predictable.

### Demo accounts

All seeded users share the password `password`.

| Role     | Email                | What they see                                                       |
| -------- | -------------------- | ------------------------------------------------------------------- |
| Tenant   | `tenant@eazy.com`    | Their lease, rent invoices, maintenance, notifications              |
| Tenant 2 | `tenant2@eazy.com`   | A second tenant with an overdue rent invoice                        |
| Manager  | `manager@eazy.com`   | All properties, all units, full maintenance queue, every transition |
| Owner    | `owner@eazy.com`     | Portfolio dashboard with revenue/occupancy charts, owned buildings  |
| Tech     | `tech@eazy.com`      | A second manager-role account used as a maintenance assignee        |

After signing in, the root URL `/` redirects each user to their role-specific landing page (`/tenant/dashboard`, `/manager/dashboard`, `/owner/dashboard`).

---

## Scripts

| Command               | What it does                                                            |
| --------------------- | ----------------------------------------------------------------------- |
| `npm run dev`         | Start Vite dev server with the MSW browser worker enabled               |
| `npm run build`       | Production build to `dist/`                                             |
| `npm run preview`     | Serve the production build locally                                      |
| `npm run lint`        | ESLint over `src/`                                                      |
| `npm run mocks:smoke` | Run the contract smoke suite against the MSW handlers via `msw/node`    |

The smoke suite spins up an `msw/node` server with the same handlers the browser uses and asserts ~38 contract behaviours: auth, role scoping, the rent payment Strategy pattern, the maintenance State machine + valid-transition rejections, Observer-emitted notifications, profile editing, property/unit creation, and authZ. It runs in under a second and is the fastest way to confirm nothing has regressed.

---

## What's built

The app is split into three role-aware experiences plus shared account pages.

### Tenant
- **Dashboard** — KPIs (active lease, next rent, open requests), lease summary, rent-due callout, recent maintenance, recent notifications.
- **My Lease** — property summary, term-progress bar with renewal alert when <60 days remain, downloadable lease docs (lease agreement, move-in checklist, house rules — generated client-side as Blob downloads), tenant info, recent receipts.
- **Payments** — KPI tiles, next-due callout, full payment history with All / Due / Paid tabs, per-row Pay button. The pay-rent dialog implements the **Strategy pattern**: three pressable method cards (credit card / bank transfer / account balance), strategy-specific fields, optional "Simulate processor failure" toggle, success view with downloadable receipt.
- **Maintenance** — list with KPIs and Open / All / Closed tabs, submit form, detail page with full lifecycle timeline. Tenants can cancel a request when `valid_transitions` permits it.

### Manager
- **Dashboard** — read-only summary across properties, leases, payments, and maintenance: KPI row, escalation banner (only when the count is non-zero), maintenance queue (top 5 by priority + recency), payments at risk, properties snapshot with occupancy bars, leases ending within 60 days.
- **Properties** — KPI row, free-text search, per-property cards. **New property** dialog picks an owner from `/users` filtered to `role === "owner"`. Property detail page shows units (desktop table / mobile cards) with occupancy badge, rent, current tenant joined client-side from active leases, and lease-end with expiring-soon tone. **Add unit** dialog handles bedrooms/bathrooms/sqft/rent.
- **Maintenance queue** — KPI tiles (open / escalated / unassigned / in-progress), tabs (Open / Escalated / Unassigned / Closed / All), full-text search, property + priority dropdowns. The list sorts escalated-first → priority → status → recency. Each row has inline state-machine action buttons (`Assign`, `Start work`, `Mark completed`, `Close`) gated on `valid_transitions`. **Assignment dialog** picks a manager/admin assignee from `/users` and sends `{event: "assign", assigned_to}`. Reassignment patches `assigned_to` only.

### Owner
- **Dashboard** — eight KPI tiles spread across two rows (properties, occupancy %, MRR, YTD revenue, vacant units, overdue rent count + dollar amount, open maintenance, escalated). Four Recharts panels: revenue trend (line, last 6 months grouped by `payment_date`), payment status mix (donut), occupancy by property (stacked bar), maintenance pipeline (horizontal bar coloured per status). Plus a "Leases ending soon" list with countdown badges that escalate red ≤30 / amber ≤60 / blue otherwise.
- **Portfolio** — read-only snapshot: KPI tiles, search, per-property cards with units / occupied / MRR computed from active leases on that property, occupancy progress bar, next lease-end with countdown.

### Shared
- **Notifications page** — full-history view backed by `useNotifications` (60 s polling). Filter tabs with counts (All / Unread / Read), per-row icon based on `event_type`, "Mark read" per row, "Mark all read" + "Refresh" header buttons that fire toasts on completion.
- **Profile & Settings** — avatar with initials, role + active badges, role description, KV grid of contact info, editable name/email/phone form that calls `PUT /users/:id` and refreshes the auth context, sign-out button. Toasts confirm save / sign-out / errors.
- **Toasts** — hand-rolled queue + viewport in `src/contexts/ToastContext.jsx`. Variants: success, error, warning, info. 4 s auto-dismiss with click-to-close.

---

## Architecture & design patterns

The frontend mirrors the backend's design-pattern story so the same vocabulary applies on both sides of the wire.

| Pattern         | Where it lives                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| Repository      | `src/api/*.js` — one module per resource, all routed through a single `client.js` fetch wrapper.        |
| Strategy        | `src/lib/payment-strategies.js` declares each method's fields + display metadata; `PayRentDialog` picks. |
| State Machine   | `src/lib/maintenance.js` exposes `transitionsForRequest(req)` reading the API's `valid_transitions`. The reusable `<TransitionActions>` component renders only the buttons the backend says are legal. |
| Observer        | The MSW handler emits `notifications` rows when a maintenance request changes state; `useNotifications` polls and feeds both the topbar bell and the full Notifications page. |
| Factory         | `src/contexts/ToastContext.jsx` produces toast records via `toast.success/.error/.warning/.info`.       |

### Folder layout

```
src/
  api/                    # one module per resource (auth, properties, leases, …)
  components/
    auth/                 # ProtectedRoute, PublicOnlyRoute
    layout/               # AppShell, Sidebar, NotificationsBell, UserMenu, nav-config
    maintenance/          # StatusBadge, MaintenanceTimeline, TransitionActions
    shared/               # PageHeader, StatCard
    ui/                   # shadcn primitives (Button, Card, Dialog, Select, …)
  contexts/               # AuthContext, ToastContext
  hooks/                  # useNotifications
  lib/                    # format, maintenance, payment-strategies, utils (cn)
  mocks/                  # MSW handlers, in-memory db, browser worker bootstrap
  pages/
    auth/                 # LoginPage, RegisterPage
    tenant/               # dashboard / lease / payments / maintenance + dialogs
    manager/              # dashboard / properties / maintenance + dialogs
    owner/                # dashboard / portfolio
    shared/               # NotificationsPage, ProfilePage
  router.jsx              # role-gated route map
  main.jsx                # mounts AuthProvider + ToastProvider + Router
```

### Auth + role gating

`AuthContext` is the single source of truth for "who is logged in":
- On mount it hydrates the session from a JWT in `sessionStorage` (`eazy.token`) by calling `/auth/me`.
- `<ProtectedRoute>` redirects unauthenticated users to `/login`.
- `<ProtectedRoute allowedRoles={[…]}>` redirects authenticated users with the wrong role to `/forbidden`.
- After a successful login the user lands on their role-specific dashboard (`landingPathFor()`).

The mock backend enforces the same scoping: an owner only sees their own buildings, a tenant only sees their own lease and payments, etc. The smoke suite asserts the 403s.

---

## Environments

This SPA assumes the API is mounted at `/api/v1` (the gateway path). In dev, MSW intercepts those calls so no real backend is required. To wire up the real backend later:

1. Disable the MSW worker by deleting the `enableMocking()` call in `main.jsx` (or guard it on a dev-only env flag).
2. Configure Vite's `server.proxy` to forward `/api/v1` to the gateway.
3. The repository under `src/api/*` already speaks the contract the smoke test asserts, so no additional changes should be needed.

---

## Tests

There are no React component tests in this preview build — the verification path for the UI is the smoke harness (`npm run mocks:smoke`), which exercises the full contract the UI relies on. If a UI flow breaks because of a contract drift, the smoke suite will catch it before the screen does.

Backend integration tests live under `../tests/` and are the domain of the FastAPI side of the project.
