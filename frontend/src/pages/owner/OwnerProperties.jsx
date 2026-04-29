import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  BedDouble,
  Building2,
  Home,
  MapPin,
  Search,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatCard } from "@/components/shared/StatCard"

import { listProperties } from "@/api/properties"
import { listLeases } from "@/api/leases"
import { formatCurrency, formatDate, daysFromNow } from "@/lib/format"

export default function OwnerProperties() {
  const [properties, setProperties] = useState([])
  const [leases, setLeases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState("")

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [props, ls] = await Promise.all([
          listProperties(),
          listLeases(),
        ])
        if (!cancelled) {
          setProperties(props)
          setLeases(ls)
          setError(null)
        }
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

  const stats = useMemo(() => {
    const totalUnits = properties.reduce(
      (s, p) => s + (p.unit_count || 0),
      0,
    )
    const occupied = properties.reduce(
      (s, p) => s + (p.occupied_count || 0),
      0,
    )
    const occupancyPct =
      totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0
    const mrr = leases
      .filter((l) => l.status === "active")
      .reduce((s, l) => s + Number(l.monthly_rent || 0), 0)
    return {
      properties: properties.length,
      totalUnits,
      occupied,
      occupancyPct,
      mrr,
    }
  }, [properties, leases])

  // Pre-bucket leases by property so per-card stats stay cheap.
  const leasesByProperty = useMemo(() => {
    const map = new Map()
    for (const l of leases) {
      if (!l.property?.property_id) continue
      const arr = map.get(l.property.property_id) || []
      arr.push(l)
      map.set(l.property.property_id, arr)
    }
    return map
  }, [leases])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return properties
    return properties.filter((p) => {
      const hay = [p.name, p.address, p.city, p.state, p.zip_code]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return hay.includes(q)
    })
  }, [properties, query])

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Owner"
        title="Portfolio"
        description="Every property you own, with occupancy and revenue at a glance."
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Couldn&apos;t load your portfolio</AlertTitle>
          <AlertDescription>
            {error.message || "Please try refreshing the page."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Properties"
          value={loading ? "" : stats.properties}
          helper={`${stats.totalUnits} total units`}
          icon={Building2}
          loading={loading}
        />
        <StatCard
          label="Occupied"
          value={loading ? "" : `${stats.occupied}/${stats.totalUnits}`}
          helper={`${stats.occupancyPct}% occupancy`}
          icon={Home}
          tone={
            stats.occupancyPct >= 90
              ? "success"
              : stats.occupancyPct >= 70
                ? "default"
                : "warning"
          }
          loading={loading}
        />
        <StatCard
          label="Vacant"
          value={loading ? "" : stats.totalUnits - stats.occupied}
          helper={
            stats.totalUnits - stats.occupied === 0
              ? "Fully booked"
              : "Available to lease"
          }
          icon={BedDouble}
          tone={
            stats.totalUnits - stats.occupied === 0 ? "muted" : "warning"
          }
          loading={loading}
        />
        <StatCard
          label="Monthly revenue"
          value={loading ? "" : formatCurrency(stats.mrr)}
          helper="From active leases"
          icon={Building2}
          tone="success"
          loading={loading}
        />
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, city, or address…"
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-44 w-full animate-pulse rounded-xl bg-muted"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {query
              ? `No properties match "${query}".`
              : "You don't own any properties yet. A manager can assign properties to you."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((p) => (
            <PropertyCard
              key={p.property_id}
              property={p}
              leases={leasesByProperty.get(p.property_id) || []}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PropertyCard({ property: p, leases }) {
  const total = p.unit_count || 0
  const occupied = p.occupied_count || 0
  const pct = total > 0 ? Math.round((occupied / total) * 100) : 0

  // Earliest upcoming lease end among active leases on this property.
  const nextEnd = leases
    .filter((l) => l.status === "active")
    .map((l) => ({ ...l, days: daysFromNow(l.end_date) }))
    .filter((l) => l.days != null && l.days >= 0)
    .sort((a, b) => a.days - b.days)[0]

  const mrr = leases
    .filter((l) => l.status === "active")
    .reduce((s, l) => s + Number(l.monthly_rent || 0), 0)

  return (
    <Card className="hover:border-primary/40 transition-colors">
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="truncate">{p.name}</CardTitle>
          <CardDescription className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">
              {p.address}, {p.city}, {p.state} {p.zip_code}
            </span>
          </CardDescription>
        </div>
        <Badge variant={pct >= 90 ? "success" : pct >= 70 ? "info" : "muted"}>
          {pct}% full
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Stat label="Units" value={total} />
          <Stat label="Occupied" value={`${occupied}/${total}`} />
          <Stat label="Monthly" value={formatCurrency(mrr)} />
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        {nextEnd ? (
          <p className="text-xs text-muted-foreground">
            Next lease ends {formatDate(nextEnd.end_date)} (in{" "}
            {nextEnd.days} day{nextEnd.days === 1 ? "" : "s"})
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            No active leases on this property.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Active leases: {leases.filter((l) => l.status === "active").length}
        </p>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  )
}
