import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Hammer,
  Plus,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatCard } from "@/components/shared/StatCard"
import {
  StatusBadge,
  PriorityBadge,
} from "@/components/maintenance/StatusBadge"

import { listMaintenance } from "@/api/maintenance"
import { ACTIVE_STATUSES, isOpen } from "@/lib/maintenance"
import { formatDate, relativeDays } from "@/lib/format"
import { cn } from "@/lib/utils"

const TABS = [
  { id: "open", label: "Open" },
  { id: "all", label: "All" },
  { id: "closed", label: "Closed" },
]

export default function TenantMaintenance() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState("open")

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const list = await listMaintenance()
        if (!cancelled) {
          setRequests(list)
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
    let open = 0
    let inProgress = 0
    let resolved = 0
    for (const r of requests) {
      if (ACTIVE_STATUSES.has(r.status)) open += 1
      if (r.status === "in_progress") inProgress += 1
      if (r.status === "completed" || r.status === "closed") resolved += 1
    }
    return { open, inProgress, resolved }
  }, [requests])

  const filtered = useMemo(() => {
    const sorted = [...requests].sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at) -
        new Date(a.updated_at || a.created_at),
    )
    if (tab === "all") return sorted
    if (tab === "open") return sorted.filter((r) => isOpen(r.status))
    if (tab === "closed") return sorted.filter((r) => !isOpen(r.status))
    return sorted
  }, [requests, tab])

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Tenant"
        title="Maintenance"
        description="Submit a new request or check on the status of an existing one."
        actions={
          <Button asChild>
            <Link to="/tenant/maintenance/new">
              <Plus /> New request
            </Link>
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Couldn&apos;t load your requests</AlertTitle>
          <AlertDescription>
            {error.message || "Please try refreshing the page."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Open requests"
          value={loading ? "" : stats.open}
          helper={
            stats.open
              ? `${stats.open} in flight`
              : "Nothing waiting on you"
          }
          icon={Wrench}
          tone={stats.open ? "warning" : "muted"}
          loading={loading}
        />
        <StatCard
          label="In progress"
          value={loading ? "" : stats.inProgress}
          helper="Assigned to a technician"
          icon={Hammer}
          tone={stats.inProgress ? "default" : "muted"}
          loading={loading}
        />
        <StatCard
          label="Resolved"
          value={loading ? "" : stats.resolved}
          helper="Completed or closed"
          icon={CheckCircle2}
          tone="success"
          loading={loading}
        />
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div>
            <CardTitle>Your requests</CardTitle>
            <CardDescription>
              Tap a row to view full details and the lifecycle timeline.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 rounded-md bg-muted p-1 w-fit">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-sm px-3 py-1 text-sm font-medium transition-colors",
                  tab === t.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 w-full animate-pulse rounded bg-muted"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            <ul className="divide-y">
              {filtered.map((r) => (
                <li key={r.request_id}>
                  <Link
                    to={`/tenant/maintenance/${r.request_id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-muted/40 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium truncate">{r.title}</span>
                        {r.escalated && (
                          <span className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                            Escalated
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {r.description || "No description provided."}
                      </p>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Updated {relativeDays(r.updated_at || r.created_at)} •
                        Submitted {formatDate(r.created_at)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <PriorityBadge priority={r.priority} />
                      <StatusBadge status={r.status} />
                      <ArrowRight className="size-4 text-muted-foreground" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function EmptyState({ tab }) {
  const messages = {
    open: "No open requests. If something needs attention, submit a new request.",
    closed: "Nothing closed yet — your historical requests will live here.",
    all: "You haven't submitted any maintenance requests yet.",
  }
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-sm text-muted-foreground">{messages[tab]}</p>
      <Button asChild size="sm">
        <Link to="/tenant/maintenance/new">
          <Plus /> Submit a request
        </Link>
      </Button>
    </div>
  )
}
