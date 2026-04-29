import {
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock,
  Hammer,
  XCircle,
} from "lucide-react"

/**
 * Maintenance request metadata shared across tenant + manager views.
 *
 * - LIFECYCLE_STEPS: the linear state machine path (cancellation is a
 *   parallel terminal state, not part of the timeline).
 * - STATUS_META: per-status label, badge variant, icon, tone — drives
 *   timeline rendering and badges everywhere.
 * - PRIORITY_META: same idea for priority.
 * - EVENT_TO_LABEL: human label for each transition event.
 *
 * The backend handler returns `valid_transitions` on every expanded
 * request — components should source action availability from that
 * field rather than hardcoding it.
 */

export const LIFECYCLE_STEPS = [
  "submitted",
  "assigned",
  "in_progress",
  "completed",
  "closed",
]

export const STATUS_META = {
  submitted: {
    label: "Submitted",
    badge: "info",
    icon: CircleDot,
    description: "Waiting for the property manager to triage.",
  },
  assigned: {
    label: "Assigned",
    badge: "warning",
    icon: Clock,
    description: "A technician has been assigned. Work hasn't started yet.",
  },
  in_progress: {
    label: "In progress",
    badge: "warning",
    icon: Hammer,
    description: "Work is underway.",
  },
  completed: {
    label: "Completed",
    badge: "success",
    icon: CheckCircle2,
    description: "Work is done — pending close-out.",
  },
  closed: {
    label: "Closed",
    badge: "muted",
    icon: CheckCircle2,
    description: "Request is fully resolved.",
  },
  cancelled: {
    label: "Cancelled",
    badge: "muted",
    icon: XCircle,
    description: "This request was cancelled.",
  },
}

export const PRIORITY_META = {
  low: { label: "Low", badge: "muted" },
  medium: { label: "Medium", badge: "info" },
  high: { label: "High", badge: "warning" },
  emergency: { label: "Emergency", badge: "destructive" },
}

export const PRIORITY_OPTIONS = [
  { value: "low", label: "Low — minor / cosmetic" },
  { value: "medium", label: "Medium — needs attention this week" },
  { value: "high", label: "High — significant impact" },
  { value: "emergency", label: "Emergency — safety / no-heat / no-water" },
]

export const EVENT_TO_LABEL = {
  assign: "Assign",
  start: "Start work",
  complete: "Mark completed",
  close: "Close request",
  cancel: "Cancel request",
}

const STATUS_TO_EVENT = {
  assigned: "assign",
  in_progress: "start",
  completed: "complete",
  closed: "close",
  cancelled: "cancel",
}

/**
 * Translate one of the API's `valid_transitions` (target status strings)
 * into the matching event the PUT endpoint expects, plus a human label.
 */
export function transitionsForRequest(req) {
  return (req?.valid_transitions || []).map((target) => ({
    target,
    event: STATUS_TO_EVENT[target] || target,
    label: STATUS_META[target]?.label || target,
  }))
}

export function isTerminal(status) {
  return status === "closed" || status === "cancelled"
}

/** Step index used to draw the lifecycle timeline. */
export function statusStepIndex(status) {
  if (status === "cancelled") return -1
  const idx = LIFECYCLE_STEPS.indexOf(status)
  return idx === -1 ? 0 : idx
}

/** "open" = anything in flight (not closed/cancelled). */
export function isOpen(status) {
  return !isTerminal(status)
}

/** Active steps shown on dashboards (non-terminal, non-completed). */
export const ACTIVE_STATUSES = new Set(["submitted", "assigned", "in_progress"])

export function fallbackStatusMeta(status) {
  return (
    STATUS_META[status] || {
      label: status,
      badge: "secondary",
      icon: CircleDashed,
      description: "",
    }
  )
}
