import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarDays,
  Hammer,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { PageHeader } from "@/components/shared/PageHeader"
import {
  StatusBadge,
  PriorityBadge,
} from "@/components/maintenance/StatusBadge"
import { MaintenanceTimeline } from "@/components/maintenance/MaintenanceTimeline"
import { TransitionActions } from "@/components/maintenance/TransitionActions"

import { getMaintenance } from "@/api/maintenance"
import { formatDateTime, relativeDays } from "@/lib/format"
import { AssignMaintenanceDialog } from "@/pages/manager/AssignMaintenanceDialog"

export default function ManagerMaintenanceDetail() {
  const { id } = useParams()
  const [request, setRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [assignOpen, setAssignOpen] = useState(false)

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

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="h-32 w-full animate-pulse rounded bg-muted" />
        <div className="h-64 w-full animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link to="/manager/maintenance">
            <ArrowLeft /> Back to queue
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

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/manager/maintenance">
          <ArrowLeft /> Back to queue
        </Link>
      </Button>

      <PageHeader
        eyebrow="Maintenance request"
        title={request.title}
        description={
          request.escalated
            ? "This request has been escalated — please prioritize."
            : `Submitted by ${request.tenant?.name || "tenant"}.`
        }
        actions={
          <div className="flex items-center gap-2">
            <PriorityBadge priority={request.priority} />
            <StatusBadge status={request.status} />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              Tenant-submitted information about this issue.
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
                label="Tenant"
                value={
                  request.tenant
                    ? `${request.tenant.name} • ${request.tenant.email}`
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

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base">Actions</CardTitle>
            <CardDescription>
              Move this request through the workflow. Buttons reflect the
              valid transitions for the current state.
            </CardDescription>
          </div>
          {request.assignee && request.status !== "closed" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAssignOpen(true)}
            >
              <UserRound /> Reassign
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <TransitionActions
            request={request}
            size="default"
            onUpdated={setRequest}
            onAssign={() => setAssignOpen(true)}
          />
        </CardContent>
      </Card>

      <AssignMaintenanceDialog
        open={assignOpen}
        request={request}
        onOpenChange={setAssignOpen}
        onUpdated={setRequest}
      />
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
