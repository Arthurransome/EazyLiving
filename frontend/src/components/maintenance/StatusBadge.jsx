import { Badge } from "@/components/ui/badge"
import { fallbackStatusMeta, PRIORITY_META } from "@/lib/maintenance"

/**
 * Small, label-aware wrappers around <Badge> so callers don't have to
 * keep the status/priority -> tone mapping in their heads.
 */

export function StatusBadge({ status, className }) {
  const meta = fallbackStatusMeta(status)
  return (
    <Badge variant={meta.badge} className={className}>
      {meta.label}
    </Badge>
  )
}

export function PriorityBadge({ priority, className }) {
  const meta = PRIORITY_META[priority] || { label: priority, badge: "secondary" }
  return (
    <Badge variant={meta.badge} className={className}>
      {meta.label}
    </Badge>
  )
}
