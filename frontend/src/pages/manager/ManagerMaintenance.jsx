import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Hammer,
  Search,
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
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatCard } from "@/components/shared/StatCard"
import {
  StatusBadge,
  PriorityBadge,
} from "@/components/maintenance/StatusBadge"
import { TransitionActions } from "@/components/maintenance/TransitionActions"

import { listMaintenance } from "@/api/maintenance"
import { listProperties } from "@/api/properties"
import {
  ACTIVE_STATUSES,
  isOpen,
  isTerminal,
} from "@/lib/maintenance"
import { formatDate, relativeDays } from "@/lib/format"
import { cn } from "@/lib/utils"

import { AssignMaintenanceDialog } from "@/pages/manager/AssignMaintenanceDialog"

const TABS = [
  { id: "open", label: "Open" },
  { id: "escalated", label: "Escalated" },
  { id: "unassigned", label: "Unassigned" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
]

const PRIORITY_ORDER = { emergency: 0, high: 1, medium: 2, low: 3 }
const STATUS_ORDER = {
  submitted: 0,
  assigned: 1,
  in_progress: 2,
  completed: 3,
  closed: 4,
  cancelled: 5,
}

export default function ManagerMaintenance() {
  const [requests, setRequests] = useState([])
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [tab, setTab] = useState("open")
  const [query, setQuery] = useState("")
  const [propertyFilter, setPropertyFilter] = useState("all")
  const [priorityFilter, setPriorityFilter] = useState("all")

  const [assignTarget, setAssignTarget] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [reqs, props] = await Promise.all([
          listMaintenance(),
          listProperties(),
        ])
        if (!cancelled) {
          setRequests(reqs)
          setProperties(props)
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
    let escalated = 0
    let unassigned = 0
    let inProgress = 0
    for (const r of requests) {
      if (ACTIVE_STATUSES.has(r.status)) open += 1
      if (r.escalated && !isTerminal(r.status)) escalated += 1
      if (r.status === "submitted") unassigned += 1
      if (r.status === "in_progress") inProgress += 1
    }
    return { open, escalated, unassigned, inProgress }
  }, [requests])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = [...requests]

    // Tab-level filter.
    if (tab === "open") list = list.filter((r) => isOpen(r.status))
    if (tab === "closed") list = list.filter((r) => !isOpen(r.status))
    if (tab === "escalated")
      list = list.filter((r) => r.escalated && !isTerminal(r.status))
    if (tab === "unassigned")
      list = list.filter((r) => r.status === "submitted")

    // Secondary filters.
    if (propertyFilter !== "all") {
      list = list.filter((r) => r.property?.property_id === propertyFilter)
    }
    if (priorityFilter !== "all") {
      list = list.filter((r) => r.priority === priorityFilter)
    }
    if (q) {
      list = list.filter((r) => {
        const hay = [
          r.title,
          r.description,
          r.tenant?.name,
          r.tenant?.email,
          r.property?.name,
          r.unit?.unit_number,
          r.assignee?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return hay.includes(q)
      })
    }

    // Sort: escalated first, then by priority, then by status, then recency.
    list.sort((a, b) => {
      const escA = a.escalated && !isTerminal(a.status) ? 0 : 1
      const escB = b.escalated && !isTerminal(b.status) ? 0 : 1
      if (escA !== escB) return escA - escB
      const pa = PRIORITY_ORDER[a.priority] ?? 99
      const pb = PRIORITY_ORDER[b.priority] ?? 99
      if (pa !== pb) return pa - pb
      const sa = STATUS_ORDER[a.status] ?? 99
      const sb = STATUS_ORDER[b.status] ?? 99
      if (sa !== sb) return sa - sb
      return (
        new Date(b.updated_at || b.created_at) -
        new Date(a.updated_at || a.created_at)
      )
    })

    return list
  }, [requests, tab, query, propertyFilter, priorityFilter])

  // Replace one request in the list — used by inline transition actions
  // and the assign dialog. Both return the freshly-expanded request.
  function handleUpdated(updated) {
    setRequests((prev) =>
      prev.map((r) =>
        r.request_id === updated.request_id ? updated : r,
      ),
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Property manager"
        title="Maintenance queue"
        description="Triage incoming requests and move them through the workflow."
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Couldn&apos;t load the queue</AlertTitle>
          <AlertDescription>
            {error.message || "Please try refreshing the page."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Open"
          value={loading ? "" : stats.open}
          helper="Submitted, assigned, or in progress"
          icon={Wrench}
          tone={stats.open ? "warning" : "muted"}
          loading={loading}
        />
        <StatCard
          label="Escalated"
          value={loading ? "" : stats.escalated}
          helper={stats.escalated ? "Needs immediate attention" : "All clear"}
          icon={AlertTriangle}
          tone={stats.escalated ? "destructive" : "muted"}
          loading={loading}
        />
        <StatCard
          label="Unassigned"
          value={loading ? "" : stats.unassigned}
          helper="Waiting on triage"
          icon={ClipboardList}
          tone={stats.unassigned ? "warning" : "muted"}
          loading={loading}
        />
        <StatCard
          label="In progress"
          value={loading ? "" : stats.inProgress}
          helper="Work underway"
          icon={Hammer}
          tone={stats.inProgress ? "default" : "muted"}
          loading={loading}
        />
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div>
            <CardTitle>Queue</CardTitle>
            <CardDescription>
              Sorted by escalation, priority, and recency. Tap a row for
              the full timeline.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md bg-muted p-1">
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

            <div className="relative ml-auto w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, tenant, property…"
                className="pl-9"
              />
            </div>

            <Select value={propertyFilter} onValueChange={setPropertyFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Property" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All properties</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.property_id} value={p.property_id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 w-full animate-pulse rounded bg-muted"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <table className="w-full text-sm">
                  <thead className="border-y bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-5 py-2 font-medium">Request</th>
                      <th className="px-5 py-2 font-medium">Property</th>
                      <th className="px-5 py-2 font-medium">Priority</th>
                      <th className="px-5 py-2 font-medium">Status</th>
                      <th className="px-5 py-2 font-medium">Assignee</th>
                      <th className="px-5 py-2 font-medium">Updated</th>
                      <th className="px-5 py-2 font-medium text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((r) => (
                      <tr
                        key={r.request_id}
                        className={cn(
                          "hover:bg-muted/30",
                          r.escalated &&
                            !isTerminal(r.status) &&
                            "bg-destructive/5",
                        )}
                      >
                        <td className="px-5 py-3 align-top">
                          <Link
                            to={`/manager/maintenance/${r.request_id}`}
                            className="font-medium hover:underline"
                          >
                            {r.title}
                          </Link>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>
                              {r.tenant?.name || "Unknown tenant"}
                            </span>
                            {r.escalated && !isTerminal(r.status) && (
                              <span className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                                Escalated
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 align-top text-muted-foreground">
                          {r.property?.name || "—"}
                          <div className="text-xs">
                            Unit {r.unit?.unit_number || "—"}
                          </div>
                        </td>
                        <td className="px-5 py-3 align-top">
                          <PriorityBadge priority={r.priority} />
                        </td>
                        <td className="px-5 py-3 align-top">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-5 py-3 align-top text-muted-foreground">
                          {r.assignee?.name || (
                            <span className="italic">Unassigned</span>
                          )}
                        </td>
                        <td className="px-5 py-3 align-top text-xs text-muted-foreground">
                          {relativeDays(r.updated_at || r.created_at)}
                          <div>{formatDate(r.updated_at || r.created_at)}</div>
                        </td>
                        <td className="px-5 py-3 align-top">
                          <div className="flex items-center justify-end gap-2">
                            <TransitionActions
                              request={r}
                              hideCancel
                              onUpdated={handleUpdated}
                              onAssign={(req) => setAssignTarget(req)}
                            />
                            <Button
                              asChild
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground"
                            >
                              <Link
                                to={`/manager/maintenance/${r.request_id}`}
                              >
                                Open <ArrowRight />
                              </Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <ul className="md:hidden divide-y">
                {filtered.map((r) => (
                  <li key={r.request_id} className="space-y-3 px-5 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          to={`/manager/maintenance/${r.request_id}`}
                          className="font-medium hover:underline"
                        >
                          {r.title}
                        </Link>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {r.description || "No description provided."}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <PriorityBadge priority={r.priority} />
                        <StatusBadge status={r.status} />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{r.property?.name || "—"}</span>
                      <span>Unit {r.unit?.unit_number || "—"}</span>
                      <span>Tenant: {r.tenant?.name || "—"}</span>
                      <span>
                        Assignee: {r.assignee?.name || "Unassigned"}
                      </span>
                    </div>
                    <TransitionActions
                      request={r}
                      hideCancel
                      onUpdated={handleUpdated}
                      onAssign={(req) => setAssignTarget(req)}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <AssignMaintenanceDialog
        open={assignTarget !== null}
        request={assignTarget}
        onOpenChange={(open) => !open && setAssignTarget(null)}
        onUpdated={handleUpdated}
      />
    </div>
  )
}

function EmptyState({ tab }) {
  const messages = {
    open: "No open requests right now — quiet day.",
    escalated: "Nothing is escalated. Nice.",
    unassigned: "Every submitted request has been triaged.",
    closed: "No closed requests yet.",
    all: "No maintenance requests have been submitted yet.",
  }
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <CheckCircle2 className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{messages[tab]}</p>
    </div>
  )
}
