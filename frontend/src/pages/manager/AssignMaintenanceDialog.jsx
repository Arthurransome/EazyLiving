import { useEffect, useMemo, useState } from "react"
import { AlertCircle, Loader2, UserCheck } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

import { listUsers } from "@/api/users"
import { updateMaintenance } from "@/api/maintenance"

/**
 * Assignment dialog — sends `{ event: "assign", assigned_to }` for a
 * submitted request, or `{ assigned_to }` (no transition) for a request
 * that's already been assigned and just needs a different owner.
 *
 * Assignees are pulled from /users filtered to managers + admins. The
 * seeded "technician" fixture is also a manager-role user, so this list
 * includes everyone who can hold a maintenance ticket.
 */
export function AssignMaintenanceDialog({
  open,
  request,
  onOpenChange,
  onUpdated,
}) {
  const [assignees, setAssignees] = useState([])
  const [loadingAssignees, setLoadingAssignees] = useState(false)
  const [selected, setSelected] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Re-load assignees + reset state every time the dialog opens.
  useEffect(() => {
    if (!open) return
    setError(null)
    setSubmitting(false)
    setSelected(request?.assigned_to || "")
    let cancelled = false
    setLoadingAssignees(true)
    listUsers()
      .then((list) => {
        if (cancelled) return
        setAssignees(
          list.filter((u) => u.role === "manager" || u.role === "admin"),
        )
      })
      .catch(() => {
        // Non-fatal — picker just stays empty.
      })
      .finally(() => {
        if (!cancelled) setLoadingAssignees(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, request?.assigned_to])

  const isReassigning = request?.status && request.status !== "submitted"

  const canSubmit = useMemo(
    () => Boolean(selected) && !submitting,
    [selected, submitting],
  )

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit || !request) return
    setSubmitting(true)
    setError(null)
    try {
      // For a new assignment we transition state with `event: "assign"`.
      // For a reassignment we just patch `assigned_to` without a status
      // change — the backend allows this.
      const body = isReassigning
        ? { assigned_to: selected }
        : { event: "assign", assigned_to: selected }
      const updated = await updateMaintenance(request.request_id, body)
      onUpdated?.(updated)
      onOpenChange(false)
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isReassigning ? "Reassign request" : "Assign request"}
          </DialogTitle>
          <DialogDescription>
            {request ? (
              <>
                Pick the manager or technician who will own{" "}
                <strong>{request.title}</strong>.
              </>
            ) : (
              "Pick the manager or technician who will own this request."
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="assignee">Assignee</Label>
            <Select
              value={selected}
              onValueChange={setSelected}
              disabled={loadingAssignees}
            >
              <SelectTrigger id="assignee">
                <SelectValue
                  placeholder={
                    loadingAssignees ? "Loading…" : "Select an assignee"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {assignees.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.name} • {u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Couldn&apos;t update assignment</AlertTitle>
              <AlertDescription>
                {error.message || "Please try again."}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <UserCheck />
              )}
              {isReassigning ? "Reassign" : "Assign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
