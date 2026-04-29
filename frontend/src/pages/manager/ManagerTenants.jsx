import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  AlertCircle,
  ArrowRight,
  ClipboardCopy,
  FileSignature,
  Hourglass,
  Mail,
  PenLine,
  Phone,
  Plus,
  Search,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatCard } from "@/components/shared/StatCard"

import { listLeases } from "@/api/leases"
import { listUsers } from "@/api/users"
import { listInvites } from "@/api/invites"
import { useAuth } from "@/contexts/AuthContext"
import { useToast } from "@/contexts/ToastContext"
import { formatCurrency, formatDate, titleCase } from "@/lib/format"
import { cn } from "@/lib/utils"

import { InviteTenantDialog } from "./InviteTenantDialog"
import { CreateLeaseDialog } from "./CreateLeaseDialog"

const LEASE_BADGE = {
  draft: { variant: "muted", label: "Draft", icon: PenLine },
  pending_tenant: {
    variant: "warning",
    label: "Awaiting tenant signature",
    icon: Hourglass,
  },
  active: { variant: "success", label: "Active", icon: UserCheck },
  expiring_soon: { variant: "warning", label: "Expiring soon", icon: Hourglass },
  expired: { variant: "destructive", label: "Expired", icon: AlertCircle },
  terminated: { variant: "destructive", label: "Terminated", icon: AlertCircle },
  renewed: { variant: "info", label: "Renewed", icon: Sparkles },
}

const TABS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "drafting", label: "Drafting" },
  { id: "no_lease", label: "No lease yet" },
]

/**
 * Manager-side tenants page. Aggregates the manager's tenants by joining:
 *   - leases they signed (or could sign) -> tenant on file
 *   - tenant_invites they created  -> tenant accounts pending a lease
 *
 * Each row shows the tenant's contact info plus their freshest lease
 * status, and offers a "Draft lease" action when the tenant has none.
 */
export default function ManagerTenants() {
  const { user } = useAuth()
  const toast = useToast()
  const [leases, setLeases] = useState([])
  const [users, setUsers] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState("all")
  const [inviteOpen, setInviteOpen] = useState(false)
  const [draftFor, setDraftFor] = useState(null) // tenant user object
  const [lastInvite, setLastInvite] = useState(null) // {user, temp_password}

  async function load() {
    setLoading(true)
    try {
      const [leaseList, userList, inviteList] = await Promise.all([
        listLeases(),
        listUsers(),
        listInvites().catch(() => []),
      ])
      // Manager scope: only leases this manager owns. The mock API is
      // permissive but we want to keep the UI honest.
      const mine = leaseList.filter(
        (l) => !l.manager_id || l.manager_id === user?.user_id,
      )
      setLeases(mine)
      setUsers(userList)
      setInvites(inviteList)
      setError(null)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_id])

  // Build a tenant-centric list. Each row = one tenant + their freshest
  // lease (if any). Tenants we invited but who haven't been put on a
  // lease yet still show up so we can hand them a draft lease.
  const rows = useMemo(() => {
    const tenantsById = new Map()

    // Seed from invites we sent (oldest first so the freshest invite wins).
    for (const inv of invites
      .filter((i) => !i.invited_by || i.invited_by === user?.user_id)
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime(),
      )) {
      const u = users.find((u) => u.user_id === inv.user_id) ||
        (inv.user ? inv.user : null)
      if (!u) continue
      tenantsById.set(u.user_id, {
        tenant: u,
        invite: inv,
        lease: null,
      })
    }

    // Layer in leases — newest lease per tenant wins.
    for (const lease of leases) {
      if (!lease.tenant_id) continue
      const existing = tenantsById.get(lease.tenant_id) || {
        tenant:
          users.find((u) => u.user_id === lease.tenant_id) ||
          lease.tenant ||
          null,
        invite: null,
        lease: null,
      }
      const olderLease = existing.lease
      const isNewer =
        !olderLease ||
        new Date(lease.created_at).getTime() >
          new Date(olderLease.created_at).getTime()
      if (isNewer) existing.lease = lease
      if (existing.tenant) tenantsById.set(lease.tenant_id, existing)
    }

    return [...tenantsById.values()].filter((r) => r.tenant)
  }, [leases, users, invites, user?.user_id])

  const stats = useMemo(() => {
    let active = 0
    let drafting = 0
    let noLease = 0
    for (const r of rows) {
      if (!r.lease) noLease += 1
      else if (r.lease.status === "active") active += 1
      else if (r.lease.status === "draft" || r.lease.status === "pending_tenant")
        drafting += 1
    }
    return { active, drafting, noLease, total: rows.length }
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .filter((r) => {
        if (tab === "active") return r.lease?.status === "active"
        if (tab === "drafting")
          return (
            r.lease?.status === "draft" ||
            r.lease?.status === "pending_tenant"
          )
        if (tab === "no_lease") return !r.lease
        return true
      })
      .filter((r) => {
        if (!q) return true
        const hay = [
          r.tenant.name,
          r.tenant.email,
          r.tenant.phone,
          r.lease?.property?.name,
          r.lease?.unit?.unit_number,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => {
        // Drafting first (action needed), then active, then no-lease.
        const rank = (r) => {
          if (
            r.lease?.status === "draft" ||
            r.lease?.status === "pending_tenant"
          )
            return 0
          if (!r.lease) return 1
          if (r.lease?.status === "active") return 2
          return 3
        }
        const ra = rank(a)
        const rb = rank(b)
        if (ra !== rb) return ra - rb
        const ad = new Date(
          a.lease?.created_at || a.invite?.created_at || 0,
        ).getTime()
        const bd = new Date(
          b.lease?.created_at || b.invite?.created_at || 0,
        ).getTime()
        return bd - ad
      })
  }, [rows, query, tab])

  function handleInvited({ user: invitedUser, temp_password, invite }) {
    setLastInvite({ user: invitedUser, temp_password })
    if (invite) setInvites((list) => [...list, invite])
    if (invitedUser) {
      setUsers((list) => {
        if (list.find((u) => u.user_id === invitedUser.user_id)) return list
        return [...list, invitedUser]
      })
    }
    toast.success(
      "Tenant invited",
      `${invitedUser?.name || "New tenant"} can sign in with their temp password.`,
    )
  }

  function handleLeaseCreated(lease) {
    setLeases((list) => [lease, ...list])
    toast.success(
      "Lease drafted",
      lease.status === "pending_tenant"
        ? "Sent to the tenant for signature."
        : "Saved as a draft.",
    )
  }

  function copyTempPassword(pw) {
    if (!pw) return
    navigator.clipboard?.writeText(pw)
    toast.info("Copied", "Temp password copied to clipboard.")
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Property manager"
        title="Tenants"
        description="Invite new renters, draft their lease, and track signing status."
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <Plus /> Invite tenant
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Couldn&apos;t load tenants</AlertTitle>
          <AlertDescription>
            {error.message || "Try refreshing."}
          </AlertDescription>
        </Alert>
      )}

      {lastInvite && (
        <Alert>
          <Sparkles className="size-4" />
          <AlertTitle>
            Invited {lastInvite.user?.name || "tenant"}
          </AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap items-center gap-2">
              Share this temp password so they can sign in:
              <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                {lastInvite.temp_password}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyTempPassword(lastInvite.temp_password)}
              >
                <ClipboardCopy /> Copy
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setLastInvite(null)}
              >
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Tenants"
          value={loading ? "" : stats.total}
          icon={Users}
          loading={loading}
        />
        <StatCard
          label="Active leases"
          value={loading ? "" : stats.active}
          icon={UserCheck}
          tone="success"
          loading={loading}
        />
        <StatCard
          label="Drafting"
          value={loading ? "" : stats.drafting}
          icon={PenLine}
          tone={stats.drafting ? "warning" : "muted"}
          loading={loading}
        />
        <StatCard
          label="No lease yet"
          value={loading ? "" : stats.noLease}
          icon={FileSignature}
          tone={stats.noLease ? "warning" : "muted"}
          loading={loading}
        />
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Roster</CardTitle>
              <CardDescription>
                Everyone you&apos;ve invited or are leasing to.
              </CardDescription>
            </div>
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email, or unit…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => {
              const active = tab === t.id
              const count =
                t.id === "all"
                  ? rows.length
                  : t.id === "active"
                    ? stats.active
                    : t.id === "drafting"
                      ? stats.drafting
                      : stats.noLease
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-accent",
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      "ml-1 rounded-full px-1.5 text-[11px]",
                      active
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 w-full animate-pulse rounded bg-muted"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <Users className="size-8 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium">No tenants in this view</p>
                <p className="text-sm text-muted-foreground">
                  Invite a new renter to get started.
                </p>
              </div>
              <Button onClick={() => setInviteOpen(true)}>
                <Plus /> Invite tenant
              </Button>
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((r) => (
                <TenantRow
                  key={r.tenant.user_id}
                  row={r}
                  onDraft={() => setDraftFor(r.tenant)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <InviteTenantDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={handleInvited}
      />
      <CreateLeaseDialog
        open={!!draftFor}
        tenant={draftFor}
        onOpenChange={(v) => !v && setDraftFor(null)}
        onCreated={(lease) => {
          handleLeaseCreated(lease)
          setDraftFor(null)
        }}
      />
    </div>
  )
}

function TenantRow({ row, onDraft }) {
  const { tenant, lease } = row
  const meta = lease ? LEASE_BADGE[lease.status] : null
  const Icon = meta?.icon
  return (
    <li className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{tenant.name}</span>
          {meta && (
            <Badge variant={meta.variant}>
              {Icon && <Icon className="size-3" />} {meta.label}
            </Badge>
          )}
          {!lease && <Badge variant="muted">No lease</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <a
            href={`mailto:${tenant.email}`}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <Mail className="size-3.5" />
            {tenant.email}
          </a>
          {tenant.phone && (
            <a
              href={`tel:${tenant.phone}`}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Phone className="size-3.5" />
              {tenant.phone}
            </a>
          )}
          {lease && (
            <span>
              {lease.property?.name || "Property"} • Unit{" "}
              {lease.unit?.unit_number || "—"}
            </span>
          )}
          {lease && (
            <span>
              {formatCurrency(lease.monthly_rent)}/mo •{" "}
              {formatDate(lease.start_date)} → {formatDate(lease.end_date)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!lease && (
          <Button onClick={onDraft} size="sm">
            <FileSignature /> Draft lease
          </Button>
        )}
        {lease &&
          (lease.status === "draft" || lease.status === "pending_tenant") && (
            <Button asChild size="sm" variant="outline">
              <Link to={`/manager/leases/${lease.lease_id}`}>
                <PenLine /> Review &amp; sign
              </Link>
            </Button>
          )}
        {lease && lease.status === "active" && (
          <Button asChild size="sm" variant="ghost">
            <Link to={`/manager/leases/${lease.lease_id}`}>
              View <ArrowRight />
            </Link>
          </Button>
        )}
        {lease &&
          !["draft", "pending_tenant", "active"].includes(lease.status) && (
            <span className="text-xs text-muted-foreground">
              {titleCase(lease.status)}
            </span>
          )}
      </div>
    </li>
  )
}
