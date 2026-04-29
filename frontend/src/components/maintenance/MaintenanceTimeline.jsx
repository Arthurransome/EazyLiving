import { Check } from "lucide-react"

import {
  LIFECYCLE_STEPS,
  STATUS_META,
  statusStepIndex,
} from "@/lib/maintenance"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * Vertical timeline rendering the State pattern lifecycle.
 *
 *   Submitted ──> Assigned ──> In progress ──> Completed ──> Closed
 *
 * If the request was cancelled, the timeline freezes at the last
 * non-cancelled state and shows a dedicated "Cancelled" entry below.
 *
 * `updatedAt` is shown next to the active step — we don't have full
 * per-transition history yet, so this is the best we can do without
 * faking timestamps.
 */
export function MaintenanceTimeline({ status, updatedAt }) {
  const cancelled = status === "cancelled"
  const currentIdx = cancelled
    ? -1
    : statusStepIndex(status === "cancelled" ? "submitted" : status)

  return (
    <ol className="relative space-y-5">
      {LIFECYCLE_STEPS.map((step, idx) => {
        const meta = STATUS_META[step]
        const Icon = meta.icon
        const reached = !cancelled && idx <= currentIdx
        const active = !cancelled && idx === currentIdx
        const isLast = idx === LIFECYCLE_STEPS.length - 1
        return (
          <li
            key={step}
            className={cn("relative flex items-start gap-3", !isLast && "pb-1")}
          >
            {/* Connector line */}
            {!isLast && (
              <span
                className={cn(
                  "absolute left-3 top-7 h-full w-px",
                  reached && idx < currentIdx
                    ? "bg-primary"
                    : "bg-border",
                )}
                aria-hidden
              />
            )}
            {/* Step dot */}
            <span
              className={cn(
                "relative z-10 grid size-6 shrink-0 place-items-center rounded-full border-2",
                reached
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground",
                active && "ring-4 ring-primary/15",
              )}
            >
              {reached ? (
                idx < currentIdx ? (
                  <Check className="size-3" />
                ) : (
                  <Icon className="size-3" />
                )
              ) : (
                <Icon className="size-3" />
              )}
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span
                  className={cn(
                    "text-sm font-medium",
                    reached ? "text-foreground" : "text-muted-foreground",
                    active && "text-primary",
                  )}
                >
                  {meta.label}
                </span>
                {active && updatedAt && (
                  <span className="text-xs text-muted-foreground">
                    Updated {formatDateTime(updatedAt)}
                  </span>
                )}
              </div>
              {(active || (cancelled && idx === 0)) && (
                <p className="text-xs text-muted-foreground">
                  {meta.description}
                </p>
              )}
            </div>
          </li>
        )
      })}

      {cancelled && (
        <li className="flex items-start gap-3 border-t pt-4">
          <span className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-destructive/40 bg-destructive/10 text-destructive">
            <STATUS_META.cancelled.icon className="size-3" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium text-destructive">
                Cancelled
              </span>
              {updatedAt && (
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(updatedAt)}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {STATUS_META.cancelled.description}
            </p>
          </div>
        </li>
      )}
    </ol>
  )
}
