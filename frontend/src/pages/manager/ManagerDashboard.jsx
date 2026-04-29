import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BedDouble,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Hammer,
  Home,
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
import {
  PriorityBadge,
  StatusBadge,
} from "@/components/maintenance/StatusBadge"

import { useAuth } from "@/contexts/AuthContext"
import { listProperties } from "@/api/properties"
import { listLeases } from "@/api/leases"
import { listPayments } from "@/api/payments"
import { listMaintenance } from "@/api/maintenance"
import { listOffers } from "@/api/offers"
import { ACTIVE_STATUSES } from "@/lib/maintenance"
import {
  formatCurrency,
  formatDate,
  daysFromNow,
  relativeDays,
  titleCase,
} from "@/lib/format"
import { cn } from "@/lib/utils"

const PRIORITY_ORDER = { emergency: 0, high: 1, medium: 2, low: 3 }

export default function ManagerDashboard() {
  const { user } = useAuth()
  const [data, setData] = useState({
    properties: [],
    leases: [],
    payments: [],
    requests: [],
    offers: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [properties, leases, payments, requests, offers] = await Promise.all([
          listProperties(),
          listLeases(),
          listPayments(),
          listMaintenance(),
          listOffers().catch(() => []),
        ])
        if (cancelled) return
        setData({ properties, leases, payments, requests, offers })
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

  const kpis = useMemo(() => {
    const propertyCount = data.properties.length
    const totalUnits = data.properties.reduce(
      (sum, p) => sum + (p.unit_count || 0),
      0,
    )
    const occupiedUnits = data.properties.reduce(
      (sum, p) => sum + (p.occupied_count || 0),
      0,
    )
    const occupancyPct =
      totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0
    const openRequests = data.requests.filter((r) =>
      ACTIVE_STATUSES.has(r.status),
    )
    const escalatedCount = openRequests.filter((r) => r.escalated).length
    const overduePayments = data.payments.filter(
      (p) => p.status === "overdue",
    )
    const overdueTotal = overduePayments.reduce(
      (sum, p) => sum + Number(p.amount) + Number(p.late_fee || 0),
      0,
    )
    return {
      propertyCount,
      totalUnits,
      occupiedUnits,
      occupancyPct,
      openRequests,
      escalatedCount,
      overduePayments,
      overdueTotal,
    }
  }, [data])

  // Maintenance queue: open requests sorted by priority then recency.
  const queue = useMemo(() => {
    return [...kpis.openRequests]
      .sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 99
        const pb = PRIORITY_ORDER[b.priority] ?? 99
        if (pa !== pb) return pa - pb
        return new Date(b.updated_at || b.created_at) -
          new Date(a.updated_at || a.created_at)
      })
      .slice(0, 5)
  }, [kpis.openRequests])

  // Payments queue: overdue first, then pending due soonest.
  const paymentsQueue = useMemo(() => {
    const open = data.payments.filter((p) => p.status !== "paid")
    return [...open]
      .sort((a, b) => {
        if (a.status !== b.status) {
          if (a.status === "overdue") return -1
          if (b.status === "overdue") return 1
        }
        return new Date(a.due_date) - new Date(b.due_date)
      })
      .slice(0, 5)
  }, [data.payments])

  const expiringSoon = useMemo(() => {
    return data.leases
      .filter((l) => l.status === "active")
      .map((l) => ({ ...l, daysLeft: daysFromNow(l.end_date) }))
      .filter((l) => l.daysLeft != null && l.daysLeft <= 60)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 4)
  }, [data.leases])

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Property manager"
        title={`Hi${user?.name ? `, ${user.name.split(" ")[0]}` : ""} — here's the day`}
        description="Operational summary across your portfolio."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/manager/maintenance">
              Maintenance queue <ArrowRight />
            </Link>
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Couldn&apos;t load the dashboard</AlertTitle>
          <AlertDescription>
            {error.message || "Please try refreshing the page."}
          </AlertDescription>
        </Alert>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Properties"
          value={loading ? "" : kpis.propertyCount}
          helper={
            kpis.propertyCount === 1
              ? "1 building"
              : `${kpis.propertyCount} buildings`
          }
          icon={Building2}
          tone="default"
          loading={loading}
        />
        <StatCard
          label="Units"
          value={loading ? "" : kpis.totalUnits}
          helper={`${kpis.occupiedUnits} of ${kpis.totalUnits} occupied`}
          icon={BedDouble}
          tone="default"
          loading={loading}
        />
        <StatCard
          label="Occupancy"
          value={loading ? "" : `${kpis.occupancyPct}%`}
          helper={
            kpis.occupancyPct >= 90
              ? "Healthy"
              : kpis.occupancyPct >= 70
                ? "On track"
                : "Below target"
          }
          icon={Home}
          tone={
            kpis.occupancyPct >= 90
              ? "success"
              : kpis.occupancyPct >= 70
                ? "default"
                : "warning"
          }
          loading={loading}
        />
        <StatCard
          label="Open maintenance"
          value={loading ? "" : kpis.openRequests.length}
          helper={
            kpis.escalatedCount
              ? `${kpis.escalatedCount} escalated`
              : "Sorted by priority"
          }
          icon={Wrench}
          tone={
            kpis.escalatedCount
              ? "destructive"
              : kpis.openRequests.length
                ? "warning"
                : "muted"
          }
          loading={loading}
        />
      </div>

      {/* Pending offers banner — shows the manager when an owner is waiting */}
      {!loading &&
        (() => {
          const pending = (data.offers || []).filter(
            (o) => o.status === "pending",
          )
          if (pending.length === 0) return null
          return (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertTitle>
                {pending.length} management offer
                {pending.length === 1 ? "" : "s"} waiting for your response
              </AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-2">
                <span>
                  {pending
                    .map((o) => o.property?.name)
                    .filter(Boolean)
                    .join(", ")}
                </span>
                <Button asChild size="sm" variant="outline">
                  <Link to="/manager/offers">Review offers</Link>
                </Button>
              </AlertDescription>
            </Alert>
          )
        })()}

      {/* Escalation banner */}
      {!loading && kpis.escalatedCount > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>
            {kpis.escalatedCount} escalated request
            {kpis.escalatedCount === 1 ? "" : "s"} need attention
          </AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>
              Emergency or high-priority requests have been escalated and are
              waiting for assignment or progress.
            </span>
            <Button asChild size="sm" variant="outline">
              <Link to="/manager/maintenance">Review queue</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Maintenance queue */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Hammer className="size-4 text-muted-foreground" />
                Maintenance queue
              </CardTitle>
              <CardDescription>
                Top open requests, sorted by priority.
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/manager/maintenance">
                Open queue <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <SkeletonRows rows={4} />
            ) : queue.length === 0 ? (
              <Empty
                title="Inbox zero"
                hint="No open maintenance requests right now."
              />
            ) : (
              <ul className="divide-y">
                {queue.map((r) => (
                  <li key={r.request_id}>
                    <Link
                      to="/manager/maintenance"
                      className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {r.title}
                          </span>
                          {r.escalated && (
                            <span className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                              Escalated
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.property?.name
                            ? `${r.property.name} • Unit ${r.unit?.unit_number}`
                            : "—"}{" "}
                          • {r.tenant?.name || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Updated {relativeDays(r.updated_at || r.created_at)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <PriorityBadge priority={r.priority} />
                        <StatusBadge status={r.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Payments queue */}
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CircleDollarSign className="size-4 text-muted-foreground" />
                Payments at risk
              </CardTitle>
              <CardDescription>
                {kpis.overduePayments.length > 0
                  ? `${formatCurrency(kpis.overdueTotal)} overdue`
                  : "Nothing overdue right now"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <SkeletonRows rows={3} />
            ) : paymentsQueue.length === 0 ? (
              <Empty
                title="All paid up"
                hint="No outstanding invoices in your portfolio."
              />
            ) : (
              <ul className="divide-y">
                {paymentsQueue.map((p) => {
                  const total = Number(p.amount) + Number(p.late_fee || 0)
                  return (
                    <li
                      key={p.payment_id}
                      className="flex items-center justify-between gap-3 px-5 py-3"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {p.tenant?.name || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {p.property?.name
                            ? `${p.property.name} • Unit ${p.unit?.unit_number}`
                            : "—"}
                        </div>
                        <div
                          className={cn(
                            "text-xs",
                            p.status === "overdue"
                              ? "text-destructive font-medium"
                              : "text-muted-foreground",
                          )}
                        >
                          Due {formatDate(p.due_date)} (
                          {relativeDays(p.due_date)})
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">
                          {formatCurrency(total)}
                        </div>
                        <Badge
                          variant={
                            p.status === "overdue"
                              ? "destructive"
                              : p.status === "partial"
                                ? "warning"
                                : "info"
                          }
                        >
                          {titleCase(p.status)}
                        </Badge>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Properties snapshot */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-4 text-muted-foreground" />
                Properties
              </CardTitle>
              <CardDescription>Occupancy across your portfolio.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/manager/properties">
                Manage <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <SkeletonRows rows={2} />
            ) : data.properties.length === 0 ? (
              <Empty
                title="No properties yet"
                hint="Create your first property to get started."
              />
            ) : (
              <ul className="divide-y">
                {data.properties.map((p) => {
                  const pct =
                    p.unit_count > 0
                      ? Math.round((p.occupied_count / p.unit_count) * 100)
                      : 0
                  return (
                    <li
                      key={p.property_id}
                      className="flex items-center justify-between gap-3 px-5 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {p.address}, {p.city}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {p.occupied_count}/{p.unit_count} occupied
                          </span>
                        </div>
                      </div>
                      <Badge variant={pct >= 90 ? "success" : "muted"}>
                        {pct}%
                      </Badge>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Expiring leases */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-4 text-muted-foreground" />
              Leases ending soon
            </CardTitle>
            <CardDescription>Within the next 60 days.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <SkeletonRows rows={2} />
            ) : expiringSoon.length === 0 ? (
              <Empty
                title="Nothing coming up"
                hint="All active leases run beyond the next 60 days."
              />
            ) : (
              <ul className="divide-y">
                {expiringSoon.map((l) => (
                  <li
                    key={l.lease_id}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {l.tenant?.name || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {l.property?.name} • Unit {l.unit?.unit_number}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {formatDate(l.end_date)}
                      </div>
                      <div
                        className={cn(
                          "text-xs",
                          l.daysLeft <= 14
                            ? "text-destructive font-medium"
                            : l.daysLeft <= 30
                              ? "text-amber-700"
                              : "text-muted-foreground",
                        )}
                      >
                        in {l.daysLeft} day{l.daysLeft === 1 ? "" : "s"}
                      </div>
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

function SkeletonRows({ rows = 3 }) {
  return (
    <ul className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="h-12 w-full animate-pulse rounded bg-muted" />
      ))}
    </ul>
  )
}

function Empty({ title, hint }) {
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
