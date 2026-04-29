import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  CreditCard,
  FileSignature,
  KeyRound,
  Wrench,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatCard } from "@/components/shared/StatCard"

import { useAuth } from "@/contexts/AuthContext"
import { listLeases } from "@/api/leases"
import { listPayments } from "@/api/payments"
import { listMaintenance } from "@/api/maintenance"
import { useNotifications } from "@/hooks/useNotifications"
import {
  formatCurrency,
  formatDate,
  daysFromNow,
  relativeDays,
  titleCase,
} from "@/lib/format"
import { cn } from "@/lib/utils"

const ACTIVE_MAINT = new Set(["submitted", "assigned", "in_progress"])

const PAYMENT_BADGE = {
  paid: "success",
  pending: "info",
  partial: "warning",
  overdue: "destructive",
}

const MAINT_BADGE = {
  submitted: "info",
  assigned: "warning",
  in_progress: "warning",
  completed: "success",
  closed: "muted",
  cancelled: "muted",
}

/**
 * Tenant home — at-a-glance summary of lease, rent, maintenance, and
 * notifications. Each card links into the deeper page where the user can
 * actually act on the information.
 */
export default function TenantDashboard() {
  const { user } = useAuth()
  const [leases, setLeases] = useState([])
  const [payments, setPayments] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const { notifications, unreadCount } = useNotifications()

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [l, p, m] = await Promise.all([
          listLeases(),
          listPayments(),
          listMaintenance(),
        ])
        if (cancelled) return
        setLeases(l)
        setPayments(p)
        setRequests(m)
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // The active lease (or, failing that, the most recent one).
  const lease = useMemo(() => {
    if (!leases.length) return null
    return leases.find((l) => l.status === "active") || leases[0]
  }, [leases])

  // A lease drafted by the manager that's waiting on the tenant's signature.
  const pendingLease = useMemo(
    () => leases.find((l) => l.status === "pending_tenant"),
    [leases],
  )

  // Next unpaid invoice — earliest due date among pending/overdue/partial.
  const nextDue = useMemo(() => {
    const open = payments
      .filter((p) => p.status !== "paid")
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    return open[0] || null
  }, [payments])

  const openRequests = requests.filter((r) => ACTIVE_MAINT.has(r.status))
  const recentRequests = useMemo(
    () =>
      [...requests]
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
        .slice(0, 3),
    [requests],
  )
  const recentNotifications = notifications.slice(0, 4)

  const dueLabel = nextDue ? relativeDays(nextDue.due_date) : null
  const dueTone =
    nextDue?.status === "overdue"
      ? "destructive"
      : nextDue && daysFromNow(nextDue.due_date) <= 5
        ? "warning"
        : "default"

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Tenant"
        title={`Welcome back${user?.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        description="Here's a quick look at your lease, rent, and maintenance."
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Couldn&apos;t load your dashboard</AlertTitle>
          <AlertDescription>
            {error.message || "Please try refreshing the page."}
          </AlertDescription>
        </Alert>
      )}

      {pendingLease && (
        <Alert className="border-amber-300 bg-amber-50">
          <FileSignature className="size-4 text-amber-700" />
          <AlertTitle className="text-amber-900">
            Your lease is ready to sign
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-amber-900">
              {pendingLease.property?.name || "Your manager"} signed the lease
              for Unit {pendingLease.unit?.unit_number || "—"}. Add your
              signature to activate it.
            </span>
            <Button asChild size="sm">
              <Link to="/tenant/lease">
                Review &amp; sign <ArrowRight />
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Lease status"
          value={lease ? titleCase(lease.status) : "No active lease"}
          helper={
            lease
              ? `Ends ${formatDate(lease.end_date)}`
              : "Reach out to your manager"
          }
          icon={KeyRound}
          tone={lease?.status === "active" ? "success" : "muted"}
          loading={loading}
        />
        <StatCard
          label="Next rent due"
          value={
            nextDue ? formatCurrency(nextDue.amount) : loading ? "" : "All paid"
          }
          helper={
            nextDue
              ? `${titleCase(nextDue.status)} • ${dueLabel}`
              : "You're all caught up"
          }
          icon={CreditCard}
          tone={dueTone}
          loading={loading}
        />
        <StatCard
          label="Open maintenance"
          value={loading ? "" : openRequests.length}
          helper={
            openRequests.length
              ? `${openRequests.length} active request${openRequests.length === 1 ? "" : "s"}`
              : "Nothing in flight"
          }
          icon={Wrench}
          tone={openRequests.length ? "warning" : "muted"}
          loading={loading}
        />
        <StatCard
          label="Unread notifications"
          value={unreadCount}
          helper={
            unreadCount
              ? "New activity since you last checked"
              : "You're all caught up"
          }
          icon={Bell}
          tone={unreadCount ? "default" : "muted"}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Lease summary */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-4 text-muted-foreground" />
                My Lease
              </CardTitle>
              <CardDescription>
                {lease?.property?.name
                  ? `${lease.property.name} • Unit ${lease.unit?.unit_number || "—"}`
                  : "Lease details and documents"}
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/tenant/lease">
                View <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {!lease && !loading ? (
              <p className="text-sm text-muted-foreground">
                You don&apos;t have an active lease yet. Contact your property
                manager if this seems wrong.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <LeaseStat
                  label="Monthly rent"
                  value={lease ? formatCurrency(lease.monthly_rent) : "—"}
                  loading={loading}
                />
                <LeaseStat
                  label="Start date"
                  value={lease ? formatDate(lease.start_date) : "—"}
                  loading={loading}
                />
                <LeaseStat
                  label="End date"
                  value={lease ? formatDate(lease.end_date) : "—"}
                  loading={loading}
                />
                <LeaseStat
                  label="Address"
                  value={
                    lease?.property
                      ? `${lease.property.address}, ${lease.property.city}`
                      : "—"
                  }
                  loading={loading}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rent due */}
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="size-4 text-muted-foreground" />
                Rent
              </CardTitle>
              <CardDescription>Your next invoice</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/tenant/payments">
                Pay <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="space-y-2">
                <div className="h-7 w-24 animate-pulse rounded bg-muted" />
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              </div>
            ) : nextDue ? (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-2xl font-semibold">
                    {formatCurrency(nextDue.amount)}
                  </div>
                  <Badge variant={PAYMENT_BADGE[nextDue.status] || "default"}>
                    {titleCase(nextDue.status)}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  Due {formatDate(nextDue.due_date)}
                  <span
                    className={cn(
                      "ml-1",
                      nextDue.status === "overdue" && "text-destructive font-medium",
                    )}
                  >
                    ({dueLabel})
                  </span>
                </div>
                {Number(nextDue.late_fee) > 0 && (
                  <div className="text-xs text-destructive">
                    Late fee: {formatCurrency(nextDue.late_fee)}
                  </div>
                )}
                <Button asChild className="w-full">
                  <Link to="/tenant/payments">Pay rent</Link>
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No outstanding invoices. Nice work.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Maintenance */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="size-4 text-muted-foreground" />
                Recent maintenance
              </CardTitle>
              <CardDescription>
                Latest activity on your requests
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/tenant/maintenance">
                Open <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <SkeletonRows rows={3} />
            ) : recentRequests.length === 0 ? (
              <EmptyMessage
                title="No maintenance requests yet"
                action={
                  <Button asChild size="sm">
                    <Link to="/tenant/maintenance">Submit a request</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y -my-3">
                {recentRequests.map((r) => (
                  <li
                    key={r.request_id}
                    className="flex items-start justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.title}</div>
                      <div className="text-xs text-muted-foreground">
                        Updated {relativeDays(r.updated_at || r.created_at)} •{" "}
                        {titleCase(r.priority)} priority
                      </div>
                    </div>
                    <Badge variant={MAINT_BADGE[r.status] || "secondary"}>
                      {titleCase(r.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="size-4 text-muted-foreground" />
                Notifications
              </CardTitle>
              <CardDescription>
                {unreadCount > 0
                  ? `${unreadCount} unread`
                  : "You're all caught up"}
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/notifications">
                All <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentNotifications.length === 0 ? (
              <EmptyMessage title="No notifications yet" />
            ) : (
              <ul className="space-y-3 -my-1">
                {recentNotifications.map((n) => (
                  <li
                    key={n.notification_id}
                    className="flex items-start gap-2"
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        n.is_read ? "bg-muted" : "bg-primary",
                      )}
                    />
                    <div className="min-w-0 text-sm">
                      <div className="font-medium capitalize">
                        {String(n.event_type || "").replaceAll("_", " ")}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {n.message}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function LeaseStat({ label, value, loading }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {loading ? (
        <div className="h-5 w-20 animate-pulse rounded bg-muted" />
      ) : (
        <div className="text-sm font-medium">{value}</div>
      )}
    </div>
  )
}

function SkeletonRows({ rows = 3 }) {
  return (
    <ul className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="flex items-center justify-between gap-3 py-1"
        >
          <div className="space-y-1">
            <div className="h-4 w-44 animate-pulse rounded bg-muted" />
            <div className="h-3 w-32 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-5 w-16 animate-pulse rounded bg-muted" />
        </li>
      ))}
    </ul>
  )
}

function EmptyMessage({ title, action }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <p className="text-sm text-muted-foreground">{title}</p>
      {action}
    </div>
  )
}
