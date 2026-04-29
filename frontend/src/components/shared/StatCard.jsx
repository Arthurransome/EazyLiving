import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * Compact KPI tile — used at the top of role dashboards.
 *
 *   ┌─────────────────────────────┐
 *   │ Label                  [icon] │
 *   │ 12                          │
 *   │ helper text                 │
 *   └─────────────────────────────┘
 */
export function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = "default",
  loading = false,
  className,
}) {
  const toneClass = {
    default: "bg-primary/10 text-primary",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    destructive: "bg-destructive/10 text-destructive",
    muted: "bg-muted text-muted-foreground",
  }[tone]

  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-2 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-medium text-muted-foreground">
            {label}
          </div>
          {Icon && (
            <div
              className={cn(
                "grid size-8 place-items-center rounded-md",
                toneClass,
              )}
            >
              <Icon className="size-4" />
            </div>
          )}
        </div>
        <div className="text-2xl font-semibold tracking-tight">
          {loading ? (
            <span className="inline-block h-7 w-16 animate-pulse rounded bg-muted" />
          ) : (
            value
          )}
        </div>
        {helper && (
          <div className="text-xs text-muted-foreground">{helper}</div>
        )}
      </CardContent>
    </Card>
  )
}
