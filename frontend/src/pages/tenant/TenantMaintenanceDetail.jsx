import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarDays,
  Hammer,
  Loader2,
  UserRound,
  XCircle,
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
import { Separator } from "@/components/ui/separator"
import { PageHeader } from "@/components/shared/PageHeader"
import {
  StatusBadge,
  PriorityBadge,
} from "@/components/maintenance/StatusBadge"
import { MaintenanceTimeline } from "@/components/maintenance/MaintenanceTimeline"

import { getMaintenance, updateMaintenance } from "@/api/maintenance"
import { transitionsForRequest } from "@/lib/maintenance"
import { formatDateTime, relativeDays } from "@/lib/format"

export default function TenantMaintenanceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [request, setRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const r = await getMaintenance(id)
        if (!cancelled) {
          setRequest(r)
          setError(null)
        }
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

  // The tenant can only meaningfully cancel — managers handle the rest.
  const tenantCanCancel = (request?.valid_transitions || []).includes(
    "cancelled",
  )

  async function handleCancel() {
    if (!request || !tenantCanCancel) return
    if (!window.confirm("Cancel this maintenance request? This can't be undone.")) {
      return
    }
    setActing(true)
    setActionError(null)
    try {
      const updated = await updateMaintenance(request.request_id, {
        event: "cancel",
      })
      setRequest(updated)
    } catch (err) {
      setActionError(err)
    } finally {
      setActing(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="h-32 w-full animate-pulse rounded bg-muted" />
        <div className="h-64 w-full animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link to="/tenant/maintenance">
            <ArrowLeft /> Back to maintenance
          </Link>
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>
            {error.status === 404
              ? "Request not found"
              : "Couldn't load this request"}
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

  if (!request) return null

  // Future-proofing: if managers ever route through here, surface their
  // available state machine actions. For tenants the only valid transition
  // is `cancelled`, so the row stays empty unless we expand permissions.
  const transitions = transitionsForRequest(request).filter(
    (t) => t.target !== "cancelled",
  )

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/tenant/maintenance">
          <ArrowLeft /> Back to maintenance
        </Link>
      </Button>

      <PageHeader
        eyebrow="Maintenance request"
        title={request.title}
        description={
          request.escalated
            ? "This request has been escalated to building management."
            : "Track progress and stay in the loop."
        }
        actions={
          <div className="flex items-center gap-2">
            <PriorityBadge priority={request.priority} />
            <StatusBadge status={request.status} />
          </div>
        }
      />

      {actionError && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Couldn&apos;t update this request</AlertTitle>
          <AlertDescription>
            {actionError.message || "Please try again."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              What you submitted — visible to your manager and assigned
              technician.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-wrap text-sm">
              {request.description || (
                <span className="text-muted-foreground">
                  No description provided.
                </span>
              )}
            </p>
            <Separator />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <KV
                icon={Building2}
                label="Property"
                value={
                  request.property?.name
                    ? `${request.property.name} • Unit ${request.unit?.unit_number || "—"}`
                    : "—"
                }
              />
              <KV
                icon={UserRound}
                label="Assigned to"
                value={
                  request.assignee
                    ? request.assignee.name
                    : "Not yet assigned"
                }
              />
              <KV
                icon={CalendarDays}
                label="Submitted"
                value={formatDateTime(request.created_at)}
              />
              <KV
                icon={CalendarDays}
                label="Last updated"
                value={`${formatDateTime(request.updated_at)} (${relativeDays(request.updated_at)})`}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hammer className="size-4 text-muted-foreground" />
              Lifecycle
            </CardTitle>
            <CardDescription>
              Where this request is in the workflow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MaintenanceTimeline
              status={request.status}
              updatedAt={request.updated_at}
            />
          </CardContent>
        </Card>
      </div>

      {/* Action row */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actions</CardTitle>
          <CardDescription>
            What you can do with this request right now.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {tenantCanCancel ? (
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={acting}
            >
              {acting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <XCircle />
              )}
              Cancel request
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              No tenant actions available — this request is{" "}
              <strong>{request.status.replace("_", " ")}</strong>. Reach out to
              your property manager if you have questions.
            </p>
          )}
          {transitions.length > 0 && (
            <p className="ml-auto text-xs text-muted-foreground">
              Manager actions: {transitions.map((t) => t.label).join(", ")}
            </p>
          )}
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={() => navigate("/tenant/maintenance")}
          >
            Back to list
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function KV({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 grid size-8 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  )
}
