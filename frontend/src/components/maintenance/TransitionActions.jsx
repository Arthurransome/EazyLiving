import { useState } from "react"
import {
  CheckCircle2,
  Hammer,
  Loader2,
  PlayCircle,
  UserCheck,
  XCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"

import { transitionsForRequest } from "@/lib/maintenance"
import { updateMaintenance } from "@/api/maintenance"
import { useToast } from "@/contexts/ToastContext"

/**
 * Maps a target status (the API's `valid_transitions` entries) to the
 * button rendering: variant + icon. Order in this map also drives the
 * preferred ordering in the UI when multiple transitions are valid.
 */
const TARGET_RENDER = {
  assigned: { variant: "default", icon: UserCheck, label: "Assign" },
  in_progress: { variant: "default", icon: PlayCircle, label: "Start work" },
  completed: { variant: "default", icon: Hammer, label: "Mark completed" },
  closed: { variant: "secondary", icon: CheckCircle2, label: "Close" },
  cancelled: { variant: "ghost", icon: XCircle, label: "Cancel" },
}

const TARGET_ORDER = [
  "assigned",
  "in_progress",
  "completed",
  "closed",
  "cancelled",
]

/**
 * Renders the action buttons for a maintenance request based on its
 * `valid_transitions`. Assignment is special — it requires picking an
 * assignee, so we delegate to the parent via `onAssign(request)` instead
 * of firing the request directly.
 *
 * Props:
 * - request: expanded maintenance request from the API
 * - size: "sm" | "default" — passed through to <Button>
 * - layout: "row" (default, horizontal) | "stack" (vertical buttons)
 * - onUpdated: (updated) => void — called when a transition succeeds
 * - onAssign: (request) => void — called when "Assign" is clicked
 * - hideCancel: boolean — managers usually don't need the cancel button
 *   in queue rows (it would be confusing next to "Close")
 */
export function TransitionActions({
  request,
  size = "sm",
  layout = "row",
  onUpdated,
  onAssign,
  hideCancel = false,
}) {
  const [pending, setPending] = useState(null)
  const [error, setError] = useState(null)
  const toast = useToast()

  const transitions = transitionsForRequest(request)
    .filter((t) => !(hideCancel && t.target === "cancelled"))
    .sort(
      (a, b) =>
        TARGET_ORDER.indexOf(a.target) - TARGET_ORDER.indexOf(b.target),
    )

  if (transitions.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        No actions available
      </span>
    )
  }

  async function handleClick(target, event) {
    if (target === "assigned") {
      onAssign?.(request)
      return
    }
    setPending(target)
    setError(null)
    try {
      const updated = await updateMaintenance(request.request_id, { event })
      onUpdated?.(updated)
      const meta = TARGET_RENDER[target]
      toast.success(
        `Request "${request.title}" → ${meta?.label || target}`,
      )
    } catch (err) {
      setError(err)
      toast.error(
        "Couldn't update request",
        err.message || "Please try again.",
      )
    } finally {
      setPending(null)
    }
  }

  return (
    <div
      className={
        layout === "stack"
          ? "flex flex-col items-stretch gap-2"
          : "flex flex-wrap items-center gap-2"
      }
    >
      {transitions.map((t) => {
        const meta = TARGET_RENDER[t.target] || {
          variant: "outline",
          icon: PlayCircle,
          label: t.label,
        }
        const Icon = meta.icon
        const busy = pending === t.target
        return (
          <Button
            key={t.target}
            variant={meta.variant}
            size={size}
            disabled={busy || (pending !== null && pending !== t.target)}
            onClick={() => handleClick(t.target, t.event)}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Icon />}
            {meta.label}
          </Button>
        )
      })}
      {error && (
        <span className="text-xs text-destructive">
          {error.message || "Action failed"}
        </span>
      )}
    </div>
  )
}
