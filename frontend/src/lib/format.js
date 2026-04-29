/**
 * Tiny formatting helpers. The backend returns money as a stringified
 * decimal (e.g. "1800.00") and dates as ISO strings — both need a touch
 * of polish before going on screen.
 */

export function formatCurrency(value, { currency = "USD" } = {}) {
  const num = typeof value === "number" ? value : Number(value)
  if (Number.isNaN(num)) return "—"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(num)
}

export function formatDate(input, opts = { month: "short", day: "numeric", year: "numeric" }) {
  if (!input) return "—"
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-US", opts)
}

export function formatDateTime(input) {
  if (!input) return "—"
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/**
 * Whole-day delta between `target` and now. Negative means the target
 * is in the past. Useful for "in 3 days" / "7 days ago" style copy.
 */
export function daysFromNow(target) {
  if (!target) return null
  const t = target instanceof Date ? target : new Date(target)
  if (Number.isNaN(t.getTime())) return null
  const startOfDay = (d) => {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
  }
  const diffMs = startOfDay(t).getTime() - startOfDay(new Date()).getTime()
  return Math.round(diffMs / 86_400_000)
}

export function relativeDays(target) {
  const n = daysFromNow(target)
  if (n === null) return "—"
  if (n === 0) return "today"
  if (n === 1) return "tomorrow"
  if (n === -1) return "yesterday"
  if (n > 1) return `in ${n} days`
  return `${Math.abs(n)} days ago`
}

export function titleCase(input) {
  if (!input) return ""
  return String(input)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
