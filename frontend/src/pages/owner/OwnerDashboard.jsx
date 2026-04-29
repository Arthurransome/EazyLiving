import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BedDouble,
  Building2,
  CalendarClock,
  CircleDollarSign,
  Home,
  TrendingUp,
  Wrench,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

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
import { listProperties } from "@/api/properties"
import { listLeases } from "@/api/leases"
import { listPayments } from "@/api/payments"
import { listMaintenance } from "@/api/maintenance"
import { ACTIVE_STATUSES } from "@/lib/maintenance"
import {
  formatCurrency,
  formatDate,
  daysFromNow,
  titleCase,
} from "@/lib/format"

// Tailwind/oklch-aligned chart palette. We can't import the CSS vars into
// SVGs from Recharts directly, so map to concrete hex values that match
// the slate-based shadcn palette.
const COLORS = {
  primary: "#0f172a", // slate-900
  primaryMuted: "#334155", // slate-700
  success: "#16a34a", // green-600
  warning: "#f59e0b", // amber-500
  destructive: "#dc2626", // red-600
  info: "#2563eb", // blue-600
  neutral: "#94a3b8", // slate-400
  surface: "#e2e8f0", // slate-200
}

const STATUS_COLORS = {
  paid: COLORS.success,
  pending: COLORS.info,
  overdue: COLORS.destructive,
  partial: COLORS.warning,
}

const MAINT_STATUS_COLORS = {
  submitted: COLORS.info,
  assigned: COLORS.warning,
  in_progress: COLORS.warning,
  completed: COLORS.success,
  closed: COLORS.neutral,
  cancelled: COLORS.surface,
}

// Build the last N month buckets keyed YYYY-MM, paired with a printable
// label. We always include the current month even if empty.
function lastNMonths(n) {
  const now = new Date()
  const buckets = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const label = d.toLocaleString(undefined, { month: "short" })
    buckets.push({ key, label, year: d.getFullYear() })
  }
  return buckets
}

export default function OwnerDashboard() {
  const { user } = useAuth()
  const [data, setData] = useState({
    properties: [],
    leases: [],
    payments: [],
    requests: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [properties, leases, payments, requests] = await Promise.all([
          listProperties(),
          listLeases(),
          listPayments(),
          listMaintenance(),
        ])
        if (cancelled) return
        setData({ properties, leases, payments, requests })
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

  const portfolio = useMemo(() => {
    const totalUnits = data.properties.reduce(
      (s, p) => s + (p.unit_count || 0),
      0,
    )
    const occupied = data.properties.reduce(
      (s, p) => s + (p.occupied_count || 0),
      0,
    )
    const occupancyPct =
      totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0

    // Monthly recurring revenue from active leases.
    const mrr = data.leases
      .filter((l) => l.status === "active")
      .reduce((s, l) => s + Number(l.monthly_rent || 0), 0)

    // YTD revenue from paid payments dated this calendar year.
    const yearStart = new Date(new Date().getFullYear(), 0, 1)
    const ytd = data.payments
      .filter(
        (p) =>
          p.status === "paid" &&
          p.payment_date &&
          new Date(p.payment_date) >= yearStart,
      )
      .reduce((s, p) => s + Number(p.amount || 0), 0)

    const overdue = data.payments.filter((p) => p.status === "overdue")
    const overdueAmount = overdue.reduce(
      (s, p) => s + Number(p.amount || 0) + Number(p.late_fee || 0),
      0,
    )
    const openRequests = data.requests.filter((r) =>
      ACTIVE_STATUSES.has(r.status),
    ).length
    const escalated = data.requests.filter(
      (r) => r.escalated && ACTIVE_STATUSES.has(r.status),
    ).length

    return {
      totalUnits,
      occupied,
      vacant: totalUnits - occupied,
      occupancyPct,
      mrr,
      ytd,
      overdueCount: overdue.length,
      overdueAmount,
      openRequests,
      escalated,
    }
  }, [data])

  // --- chart data ---------------------------------------------------------

  // Revenue trend: paid payments grouped by payment_date month.
  const revenueTrend = useMemo(() => {
    const buckets = lastNMonths(6)
    const map = new Map(buckets.map((b) => [b.key, { ...b, revenue: 0 }]))
    for (const p of data.payments) {
      if (p.status !== "paid" || !p.payment_date) continue
      const d = new Date(p.payment_date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const row = map.get(key)
      if (row) row.revenue += Number(p.amount || 0)
    }
    return Array.from(map.values())
  }, [data.payments])

  // Occupancy by property: stacked occupied + vacant.
  const occupancyByProperty = useMemo(
    () =>
      data.properties.map((p) => ({
        name:
          p.name.length > 14 ? `${p.name.slice(0, 13)}…` : p.name,
        property_id: p.property_id,
        occupied: p.occupied_count || 0,
        vacant: (p.unit_count || 0) - (p.occupied_count || 0),
      })),
    [data.properties],
  )

  // Payment status mix.
  const paymentMix = useMemo(() => {
    const counts = { paid: 0, pending: 0, overdue: 0, partial: 0 }
    for (const p of data.payments) {
      counts[p.status] = (counts[p.status] || 0) + 1
    }
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([status, count]) => ({
        name: titleCase(status),
        status,
        count,
      }))
  }, [data.payments])

  // Maintenance by status — only non-cancelled (cancelled is noisy).
  const maintenanceMix = useMemo(() => {
    const counts = {}
    for (const r of data.requests) {
      if (r.status === "cancelled") continue
      counts[r.status] = (counts[r.status] || 0) + 1
    }
    return Object.entries(counts).map(([status, count]) => ({
      name: titleCase(status),
      status,
      count,
    }))
  }, [data.requests])

  // Leases ending in the next 90 days.
  const expiringLeases = useMemo(() => {
    return data.leases
      .filter((l) => l.status === "active")
      .map((l) => ({ ...l, days: daysFromNow(l.end_date) }))
      .filter((l) => l.days != null && l.days <= 90 && l.days >= 0)
      .sort((a, b) => a.days - b.days)
      .slice(0, 5)
  }, [data.leases])

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 w-full animate-pulse rounded-xl bg-muted"
            />
          ))}
        </div>
        <div className="h-72 w-full animate-pulse rounded-xl bg-muted" />
        <div className="h-72 w-full animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Owner"
        title={`Welcome back, ${user?.name?.split(" ")[0] || "Owner"}`}
        description="A snapshot of how your portfolio is performing this month."
        actions={
          <Button asChild variant="outline">
            <Link to="/owner/properties">
              View portfolio <ArrowRight />
            </Link>
          </Button>
        }
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

      {portfolio.escalated > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>
            {portfolio.escalated} escalated maintenance{" "}
            {portfolio.escalated === 1 ? "request" : "requests"}
          </AlertTitle>
          <AlertDescription>
            Your property manager flagged {portfolio.escalated === 1 ? "one" : "these"} for
            urgent attention. Coordinate with them as needed.
          </AlertDescription>
        </Alert>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Properties"
          value={data.properties.length}
          helper={
            data.properties.length === 1
              ? "1 building owned"
              : `${data.properties.length} buildings owned`
          }
          icon={Building2}
        />
        <StatCard
          label="Occupancy"
          value={`${portfolio.occupancyPct}%`}
          helper={`${portfolio.occupied} of ${portfolio.totalUnits} units`}
          icon={Home}
          tone={
            portfolio.occupancyPct >= 90
              ? "success"
              : portfolio.occupancyPct >= 70
                ? "default"
                : "warning"
          }
        />
        <StatCard
          label="Monthly revenue"
          value={formatCurrency(portfolio.mrr)}
          helper="From active leases"
          icon={CircleDollarSign}
          tone="success"
        />
        <StatCard
          label="YTD revenue"
          value={formatCurrency(portfolio.ytd)}
          helper={`${new Date().getFullYear()} year-to-date`}
          icon={TrendingUp}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Vacant units"
          value={portfolio.vacant}
          helper={
            portfolio.vacant === 0 ? "Fully booked" : "Lost rent each month"
          }
          icon={BedDouble}
          tone={portfolio.vacant === 0 ? "muted" : "warning"}
        />
        <StatCard
          label="Overdue rent"
          value={portfolio.overdueCount}
          helper={
            portfolio.overdueAmount > 0
              ? formatCurrency(portfolio.overdueAmount)
              : "Nothing past due"
          }
          icon={CalendarClock}
          tone={portfolio.overdueCount ? "destructive" : "muted"}
        />
        <StatCard
          label="Open maintenance"
          value={portfolio.openRequests}
          helper={
            portfolio.openRequests
              ? `${portfolio.openRequests} in flight`
              : "All clear"
          }
          icon={Wrench}
          tone={portfolio.openRequests ? "warning" : "muted"}
        />
        <StatCard
          label="Escalated"
          value={portfolio.escalated}
          helper={
            portfolio.escalated
              ? "Needs immediate attention"
              : "No fires today"
          }
          icon={AlertTriangle}
          tone={portfolio.escalated ? "destructive" : "muted"}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue (last 6 months)</CardTitle>
            <CardDescription>
              Paid rent payments grouped by month.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartFrame>
              <LineChart
                data={revenueTrend}
                margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.surface} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: COLORS.primaryMuted }}
                  tickLine={false}
                  axisLine={{ stroke: COLORS.surface }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: COLORS.primaryMuted }}
                  tickLine={false}
                  axisLine={{ stroke: COLORS.surface }}
                  tickFormatter={(v) =>
                    v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
                  }
                />
                <Tooltip
                  formatter={(v) => formatCurrency(v)}
                  labelStyle={{ color: COLORS.primary }}
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: COLORS.surface,
                    fontSize: 13,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke={COLORS.primary}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: COLORS.primary }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ChartFrame>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment mix</CardTitle>
            <CardDescription>Status breakdown of every invoice.</CardDescription>
          </CardHeader>
          <CardContent>
            {paymentMix.length === 0 ? (
              <EmptyMini message="No invoices yet" />
            ) : (
              <ChartFrame height={240}>
                <PieChart>
                  <Pie
                    data={paymentMix}
                    dataKey="count"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {paymentMix.map((slice) => (
                      <Cell
                        key={slice.status}
                        fill={STATUS_COLORS[slice.status] || COLORS.neutral}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => `${v} invoice${v === 1 ? "" : "s"}`}
                    contentStyle={{
                      borderRadius: 8,
                      borderColor: COLORS.surface,
                      fontSize: 13,
                    }}
                  />
                  <Legend
                    iconType="circle"
                    verticalAlign="bottom"
                    height={28}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ChartFrame>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Occupancy by property</CardTitle>
            <CardDescription>
              Occupied vs. vacant units across your portfolio.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {occupancyByProperty.length === 0 ? (
              <EmptyMini message="You don't own any properties yet." />
            ) : (
              <ChartFrame>
                <BarChart
                  data={occupancyByProperty}
                  margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={COLORS.surface}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: COLORS.primaryMuted }}
                    tickLine={false}
                    axisLine={{ stroke: COLORS.surface }}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: COLORS.primaryMuted }}
                    tickLine={false}
                    axisLine={{ stroke: COLORS.surface }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      borderColor: COLORS.surface,
                      fontSize: 13,
                    }}
                  />
                  <Legend
                    iconType="circle"
                    verticalAlign="top"
                    height={28}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Bar
                    dataKey="occupied"
                    stackId="units"
                    fill={COLORS.success}
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="vacant"
                    stackId="units"
                    fill={COLORS.warning}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartFrame>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Maintenance pipeline</CardTitle>
            <CardDescription>
              Where every active request stands.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {maintenanceMix.length === 0 ? (
              <EmptyMini message="No maintenance requests on file." />
            ) : (
              <ChartFrame height={240}>
                <BarChart
                  data={maintenanceMix}
                  layout="vertical"
                  margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={COLORS.surface}
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12, fill: COLORS.primaryMuted }}
                    tickLine={false}
                    axisLine={{ stroke: COLORS.surface }}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={84}
                    tick={{ fontSize: 12, fill: COLORS.primaryMuted }}
                    tickLine={false}
                    axisLine={{ stroke: COLORS.surface }}
                  />
                  <Tooltip
                    formatter={(v) =>
                      `${v} request${v === 1 ? "" : "s"}`
                    }
                    contentStyle={{
                      borderRadius: 8,
                      borderColor: COLORS.surface,
                      fontSize: 13,
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {maintenanceMix.map((row) => (
                      <Cell
                        key={row.status}
                        fill={MAINT_STATUS_COLORS[row.status] || COLORS.neutral}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartFrame>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Leases ending soon */}
      <Card>
        <CardHeader>
          <CardTitle>Leases ending soon</CardTitle>
          <CardDescription>
            Active leases that wrap in the next 90 days. Plan renewals or
            relistings now.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {expiringLeases.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              No leases are ending in the next 90 days.
            </div>
          ) : (
            <ul className="divide-y">
              {expiringLeases.map((l) => (
                <li
                  key={l.lease_id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <div className="font-medium">
                      {l.property?.name || "Property"} • Unit{" "}
                      {l.unit?.unit_number || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Tenant: {l.tenant?.name || "—"} • Rent{" "}
                      {formatCurrency(l.monthly_rent)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Badge
                      variant={
                        l.days <= 30
                          ? "destructive"
                          : l.days <= 60
                            ? "warning"
                            : "info"
                      }
                    >
                      in {l.days} day{l.days === 1 ? "" : "s"}
                    </Badge>
                    <span className="text-muted-foreground">
                      Ends {formatDate(l.end_date)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Recharts requires its parent to have an explicit height. Wrapping in
 * ResponsiveContainer + a fixed-height div keeps the chart behaving
 * inside our card layout.
 */
function ChartFrame({ children, height = 280 }) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  )
}

function EmptyMini({ message }) {
  return (
    <div className="flex h-48 items-center justify-center text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}
