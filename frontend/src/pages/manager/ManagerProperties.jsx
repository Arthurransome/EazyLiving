import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  AlertCircle,
  ArrowRight,
  BedDouble,
  Building2,
  Home,
  MapPin,
  Plus,
  Search,
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

import { listProperties } from "@/api/properties"
import { NewPropertyDialog } from "@/pages/manager/NewPropertyDialog"

export default function ManagerProperties() {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const list = await listProperties()
        if (!cancelled) {
          setProperties(list)
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
    return {
      properties: properties.length,
      totalUnits,
      occupied,
      occupancyPct,
    }
  }, [properties])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return properties
    return properties.filter((p) => {
      const haystack = [p.name, p.address, p.city, p.state, p.zip_code]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [properties, query])

  function handleCreated(created) {
    setProperties((prev) => [...prev, created])
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Property manager"
        title="Properties"
        description="Buildings and houses you manage."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus /> New property
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Couldn&apos;t load properties</AlertTitle>
          <AlertDescription>
            {error.message || "Please try refreshing the page."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label="Properties"
          value={loading ? "" : stats.properties}
          helper={
            stats.properties === 1
              ? "1 building under management"
              : `${stats.properties} buildings`
          }
          icon={Building2}
          loading={loading}
        />
        <StatCard
          label="Units"
          value={loading ? "" : stats.totalUnits}
          helper={`${stats.occupied} occupied`}
          icon={BedDouble}
          loading={loading}
        />
        <StatCard
          label="Portfolio occupancy"
          value={loading ? "" : `${stats.occupancyPct}%`}
          helper={
            stats.occupancyPct >= 90
              ? "Healthy"
              : stats.occupancyPct >= 70
                ? "On track"
                : "Below target"
          }
          icon={Home}
          tone={
            stats.occupancyPct >= 90
              ? "success"
              : stats.occupancyPct >= 70
                ? "default"
                : "warning"
          }
          loading={loading}
          className="col-span-2 lg:col-span-1"
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
        <EmptyState
          query={query}
          onAdd={() => setDialogOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((p) => (
            <PropertyCard key={p.property_id} property={p} />
          ))}
        </div>
      )}

      <NewPropertyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
      />
    </div>
  )
}

function PropertyCard({ property: p }) {
  const total = p.unit_count || 0
  const occupied = p.occupied_count || 0
  const pct = total > 0 ? Math.round((occupied / total) * 100) : 0

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
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Units" value={total} />
          <Stat label="Occupied" value={`${occupied}/${total}`} />
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Owner: {p.owner?.name || "—"}</span>
          <Button asChild size="sm" variant="ghost">
            <Link to={`/manager/properties/${p.property_id}`}>
              Manage <ArrowRight />
            </Link>
          </Button>
        </div>
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
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}

function EmptyState({ query, onAdd }) {
  if (query) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No properties match &ldquo;{query}&rdquo;.
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <Building2 className="size-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">No properties yet</p>
          <p className="text-sm text-muted-foreground">
            Add your first property to start managing units and leases.
          </p>
        </div>
        <Button onClick={onAdd}>
          <Plus /> New property
        </Button>
      </CardContent>
    </Card>
  )
}
