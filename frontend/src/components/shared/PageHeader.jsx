import { cn } from "@/lib/utils"

/**
 * Standard page header — title, optional eyebrow + description on the left,
 * action slot on the right. Used across role pages so spacing and tone
 * stay consistent.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="space-y-1">
        {eyebrow && (
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </div>
        )}
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
