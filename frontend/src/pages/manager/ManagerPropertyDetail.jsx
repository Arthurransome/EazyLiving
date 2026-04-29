import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import {
  AlertCircle,
  ArrowLeft,
  BedDouble,
  Building2,
  CheckCircle2,
  CircleSlash,
  Mail,
  MapPin,
  Plus,
  UserRound,
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

import { getProperty, listUnits } from "@/api/properties"
import { listLeases } from "@/api/leases"
import {
  formatCurrency,
  formatDate,
  daysFromNow,
} from "@/lib/format"
import { cn } from "@/lib/utils"
import { NewUnitDialog } from "@/pages/manager/NewUnitDialog"

export default function ManagerPropertyDetail() {
  const { id } = useParams()
  const [property, setProperty] = useState(null)
  const [units, setUnits] = useState([])
  const [leases, setLeases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [unitDialogOpen, setUnitDialogOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [prop, unitList, leaseList] = await Promise.all([
          getProperty(id),
          listUnits(id),
          listLeases(),
        ])
        if (cancelled) return
        setProperty(prop)
        setUnits(unitList)
        setLeases(leaseList)
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (id) load()
    return () => {
      cancelled = true
    }
  }, [id])

  // Index active leases by unit_id so we can join client-side. We only
  // care about the most recent active lease per unit.
  const leasesByUnit = useMemo(() => {
    const map = new Map()
    for (const l of leases) {
      if (l.status !== "active") continue
      const existing = map.get(l.unit_id)
      if (
        !existing ||
        new Date(l.created_at) > new Date(existing.created_at)
      ) {
        map.set(l.unit_id, l)
      }
    }
    return map
  }, [leases])

  const stats = useMemo(() => {
    const total = units.length
    const occupied = units.filter((u) => u.is_occupied).length
    const monthlyRevenue = units.reduce((sum, u) => {
      if (!u.is_occupied) return sum
      return sum + Number(u.monthly_rent || 0)
    }, 0)
    return {
      total,
      occupied,
      vacant: total - occupied,
      occupancyPct: total > 0 ? Math.round((occupied / total) * 100) : 0,
      monthlyRevenue,
    }
  }, [units])

  function handleUnitCreated(unit) {
    setUnits((prev) => [...prev, unit])
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="h-32 w-full animate-pulse rounded bg-muted" />
        <div className="h-64 w-full animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link to="/manager/properties">
            <ArrowLeft /> Back to properties
          </Link>
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>
            {error.status === 404
              ? "Property not found"
              : "Couldn't load this property"}
          </AlertTitle>
          <AlertDescription>
            {error.status === 404
              ? "It may have been removed, or the link is incorrect."
              : error.message}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!property) return null

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/manager/properties">
          <ArrowLeft /> Back to properties
        </Link>
      </Button>

      <PageHeader
        eyebrow="Property"
        title={property.name}
        description={`${property.address}, ${property.city}, ${property.state} ${property.zip_code}`}
        actions={
          <Button onClick={() => setUnitDialogOpen(true)}>
            <Plus /> Add unit
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Units"
          value={stats.total}
          helper={
            stats.total === 1 ? "1 rental" : `${stats.total} rentals`
          }
          icon={BedDouble}
        />
        <StatCard
          label="Occupied"
          value={`${stats.occupied}/${stats.total}`}
          helper={`${stats.occupancyPct}% occupancy`}
          icon={CheckCircle2}
          tone={stats.occupancyPct >= 90 ? "success" : "default"}
        />
        <StatCard
          label="Vacant"
          value={stats.vacant}
          helper={
            stats.vacant === 0 ? "Fully booked" : "Available to lease"
          }
          icon={CircleSlash}
          tone={stats.vacant === 0 ? "muted" : "warning"}
        />
        <StatCard
          label="Monthly revenue"
          value={formatCurrency(stats.monthlyRevenue)}
          helper="From occupied units"
          icon={Building2}
          tone="success"
        />
      </div>

      {/* Owner */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Owner</CardTitle>
          <CardDescription>The investor of record on this building.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <UserRound className="size-4 text-muted-foreground" />
            <span className="font-medium">
              {property.owner?.name || "—"}
            </span>
          </div>
          {property.owner?.email && (
            <a
              href={`mailto:${property.owner.email}`}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Mail className="size-4" />
              {property.owner.email}
            </a>
          )}
          <div className="ml-auto text-xs text-muted-foreground">
            <MapPin className="inline size-3.5 -translate-y-px" />{" "}
            Property since {formatDate(property.created_at)}
          </div>
        </CardContent>
      </Card>

      {/* Units */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle>Units</CardTitle>
            <CardDescription>
              All rentals in this property and their current tenant, if any.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setUnitDialogOpen(true)}
          >
            <Plus /> Add unit
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {units.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <BedDouble className="size-8 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium">No units yet</p>
                <p className="text-sm text-muted-foreground">
                  Add the first unit so you can sign leases and collect rent.
                </p>
              </div>
              <Button onClick={() => setUnitDialogOpen(true)}>
                <Plus /> Add unit
              </Button>
            </div>
          ) : (
            <UnitsTable units={units} leasesByUnit={leasesByUnit} />
          )}
        </CardContent>
      </Card>

      <NewUnitDialog
        open={unitDialogOpen}
        propertyId={id}
        onOpenChange={setUnitDialogOpen}
        onCreated={handleUnitCreated}
      />
    </div>
  )
}

function UnitsTable({ units, leasesByUnit }) {
  // Sort units by their numeric component when possible, fall back to string.
  const sorted = [...units].sort((a, b) => {
    const an = Number(a.unit_number)
    const bn = Number(b.unit_number)
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn
    return String(a.unit_number).localeCompare(String(b.unit_number))
  })

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead className="border-y bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-2 font-medium">Unit</th>
              <th className="px-5 py-2 font-medium">Layout</th>
              <th className="px-5 py-2 font-medium">Rent</th>
              <th className="px-5 py-2 font-medium">Status</th>
              <th className="px-5 py-2 font-medium">Tenant</th>
              <th className="px-5 py-2 font-medium">Lease ends</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((u) => {
              const lease = leasesByUnit.get(u.unit_id)
              const daysLeft = lease ? daysFromNow(lease.end_date) : null
              const expiringSoon =
                daysLeft != null && daysLeft >= 0 && daysLeft <= 60
              return (
                <tr key={u.unit_id} className="hover:bg-muted/30">
                  <td className="px-5 py-3 font-medium">
                    Unit {u.unit_number}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {u.bedrooms ?? "—"}bd / {u.bathrooms ?? "—"}ba
                    {u.square_feet ? ` • ${u.square_feet} sqft` : ""}
                  </td>
                  <td className="px-5 py-3">
                    {formatCurrency(u.monthly_rent)}
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={u.is_occupied ? "success" : "muted"}>
                      {u.is_occupied ? "Occupied" : "Vacant"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {lease?.tenant?.name || "—"}
                  </td>
                  <td className="px-5 py-3">
                    {lease ? (
                      <div className={cn("text-xs", expiringSoon && "text-amber-700 font-medium")}>
                        {formatDate(lease.end_date)}
                        {daysLeft != null && daysLeft >= 0 && (
                          <span className="block text-muted-foreground">
                            in {daysLeft} days
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="md:hidden divide-y">
        {sorted.map((u) => {
          const lease = leasesByUnit.get(u.unit_id)
          return (
            <li key={u.unit_id} className="space-y-2 px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Unit {u.unit_number}</div>
                <Badge variant={u.is_occupied ? "success" : "muted"}>
                  {u.is_occupied ? "Occupied" : "Vacant"}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {u.bedrooms ?? "—"}bd / {u.bathrooms ?? "—"}ba
                {u.square_feet ? ` • ${u.square_feet} sqft` : ""} •{" "}
                {formatCurrency(u.monthly_rent)}
              </div>
              {lease && (
                <div className="text-xs text-muted-foreground">
                  Tenant: {lease.tenant?.name || "—"} • ends{" "}
                  {formatDate(lease.end_date)}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
