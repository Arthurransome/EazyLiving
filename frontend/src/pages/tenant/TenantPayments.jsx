import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Coins,
  Download,
  Receipt,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatCard } from "@/components/shared/StatCard"

import { listPayments } from "@/api/payments"
import {
  formatCurrency,
  formatDate,
  relativeDays,
  titleCase,
} from "@/lib/format"
import { cn } from "@/lib/utils"
import { PayRentDialog } from "@/pages/tenant/PayRentDialog"

const STATUS_BADGE = {
  paid: "success",
  pending: "info",
  partial: "warning",
  overdue: "destructive",
}

const STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "due", label: "Due" },
  { id: "paid", label: "Paid" },
]

export default function TenantPayments() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState("all")

  const [payTarget, setPayTarget] = useState(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const list = await listPayments()
        if (!cancelled) {
          setPayments(list)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const sorted = useMemo(
    () =>
      [...payments].sort(
        (a, b) => new Date(b.due_date) - new Date(a.due_date),
      ),
    [payments],
  )

  const filtered = useMemo(() => {
    if (tab === "all") return sorted
    if (tab === "paid") return sorted.filter((p) => p.status === "paid")
    if (tab === "due") return sorted.filter((p) => p.status !== "paid")
    return sorted
  }, [sorted, tab])

  // Aggregates for the KPI row.
  const stats = useMemo(() => {
    let totalPaidYTD = 0
    let dueAmount = 0
    let overdueCount = 0
    const thisYear = new Date().getFullYear()
    for (const p of payments) {
      const amt = Number(p.amount) || 0
      const fee = Number(p.late_fee) || 0
      if (p.status === "paid") {
        const paidAt = p.payment_date ? new Date(p.payment_date) : null
        if (paidAt && paidAt.getFullYear() === thisYear) {
          totalPaidYTD += amt
        }
      } else {
        dueAmount += amt + fee
        if (p.status === "overdue") overdueCount += 1
      }
    }
    return { totalPaidYTD, dueAmount, overdueCount }
  }, [payments])

  // Earliest unpaid invoice — the obvious "Pay rent" target.
  const nextDue = useMemo(() => {
    const open = payments
      .filter((p) => p.status !== "paid")
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    return open[0] || null
  }, [payments])

  function openPay(payment) {
    setPayTarget(payment)
    setDialogOpen(true)
  }

  function handlePaid(updated) {
    setPayments((prev) =>
      prev.map((p) => (p.payment_id === updated.payment_id ? updated : p)),
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Tenant"
        title="Payments"
        description="Pay your rent and review past invoices."
        actions={
          nextDue ? (
            <Button onClick={() => openPay(nextDue)}>Pay rent</Button>
          ) : null
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Couldn&apos;t load your payments</AlertTitle>
          <AlertDescription>
            {error.message || "Please try refreshing the page."}
          </AlertDescription>
        </Alert>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Currently due"
          value={formatCurrency(stats.dueAmount)}
          helper={
            stats.overdueCount > 0
              ? `${stats.overdueCount} overdue invoice${stats.overdueCount === 1 ? "" : "s"}`
              : "Includes any pending invoices"
          }
          icon={CalendarClock}
          tone={
            stats.overdueCount > 0
              ? "destructive"
              : stats.dueAmount > 0
                ? "warning"
                : "muted"
          }
          loading={loading}
        />
        <StatCard
          label={`Paid in ${new Date().getFullYear()}`}
          value={formatCurrency(stats.totalPaidYTD)}
          helper="Year-to-date rent paid"
          icon={CheckCircle2}
          tone="success"
          loading={loading}
        />
        <StatCard
          label="Total invoices"
          value={loading ? "" : payments.length}
          helper={`${payments.filter((p) => p.status === "paid").length} settled`}
          icon={Coins}
          tone="default"
          loading={loading}
        />
      </div>

      {/* Next due callout — only when something is owed */}
      {nextDue && !loading && (
        <Card
          className={cn(
            "border-l-4",
            nextDue.status === "overdue"
              ? "border-l-destructive"
              : "border-l-primary",
          )}
        >
          <CardContent className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_BADGE[nextDue.status] || "default"}>
                  {titleCase(nextDue.status)}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Due {formatDate(nextDue.due_date)} (
                  {relativeDays(nextDue.due_date)})
                </span>
              </div>
              <div className="text-2xl font-semibold">
                {formatCurrency(
                  Number(nextDue.amount) + Number(nextDue.late_fee || 0),
                )}
              </div>
              {Number(nextDue.late_fee) > 0 && (
                <p className="text-xs text-destructive">
                  Includes {formatCurrency(nextDue.late_fee)} late fee
                </p>
              )}
            </div>
            <Button onClick={() => openPay(nextDue)} size="lg">
              Pay rent now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader className="space-y-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-4 text-muted-foreground" />
              Payment history
            </CardTitle>
            <CardDescription>
              Recent invoices and receipts. Newest first.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 rounded-md bg-muted p-1 w-fit">
            {STATUS_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-sm px-3 py-1 text-sm font-medium transition-colors",
                  tab === t.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 w-full animate-pulse rounded bg-muted"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              {tab === "due"
                ? "No outstanding invoices. Nice work."
                : tab === "paid"
                  ? "No paid invoices yet."
                  : "No payments yet."}
            </div>
          ) : (
            <PaymentTable rows={filtered} onPay={openPay} />
          )}
        </CardContent>
      </Card>

      <PayRentDialog
        open={dialogOpen}
        payment={payTarget}
        onOpenChange={setDialogOpen}
        onPaid={handlePaid}
      />
    </div>
  )
}

function PaymentTable({ rows, onPay }) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead className="border-y bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-2 font-medium">Due date</th>
              <th className="px-5 py-2 font-medium">Amount</th>
              <th className="px-5 py-2 font-medium">Status</th>
              <th className="px-5 py-2 font-medium">Method</th>
              <th className="px-5 py-2 font-medium">Receipt</th>
              <th className="px-5 py-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((p) => (
              <tr key={p.payment_id} className="hover:bg-muted/30">
                <td className="px-5 py-3">
                  <div className="font-medium">{formatDate(p.due_date)}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.status === "paid"
                      ? `Paid ${formatDate(p.payment_date)}`
                      : relativeDays(p.due_date)}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div className="font-medium">{formatCurrency(p.amount)}</div>
                  {Number(p.late_fee) > 0 && (
                    <div className="text-xs text-destructive">
                      + {formatCurrency(p.late_fee)} fee
                    </div>
                  )}
                </td>
                <td className="px-5 py-3">
                  <Badge variant={STATUS_BADGE[p.status] || "secondary"}>
                    {titleCase(p.status)}
                  </Badge>
                </td>
                <td className="px-5 py-3 text-muted-foreground">
                  {p.method ? titleCase(p.method) : "—"}
                </td>
                <td className="px-5 py-3 text-muted-foreground">
                  {p.receipt_ref ? (
                    <button
                      type="button"
                      onClick={() => downloadReceipt(p)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      <Download className="size-3" /> Receipt
                    </button>
                  ) : (
                    <span>—</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  {p.status !== "paid" ? (
                    <Button size="sm" onClick={() => onPay(p)}>
                      Pay
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <ul className="md:hidden divide-y">
        {rows.map((p) => (
          <li key={p.payment_id} className="space-y-2 px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{formatCurrency(p.amount)}</div>
              <Badge variant={STATUS_BADGE[p.status] || "secondary"}>
                {titleCase(p.status)}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              Due {formatDate(p.due_date)} ·{" "}
              {p.status === "paid"
                ? `Paid ${formatDate(p.payment_date)}`
                : relativeDays(p.due_date)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {p.method ? titleCase(p.method) : "—"}
              </span>
              {p.status !== "paid" ? (
                <Button size="sm" onClick={() => onPay(p)}>
                  Pay
                </Button>
              ) : p.receipt_ref ? (
                <button
                  type="button"
                  onClick={() => downloadReceipt(p)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Download className="size-3" /> Receipt
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

function downloadReceipt(p) {
  const lines = [
    "EAZYLIVING — RENT PAYMENT RECEIPT",
    "===================================",
    "",
    `Receipt:      ${p.receipt_ref}`,
    `Payment ID:   ${p.payment_id}`,
    `Date paid:    ${formatDate(p.payment_date)}`,
    `Amount:       ${formatCurrency(p.amount)}`,
    `Late fee:     ${formatCurrency(p.late_fee || 0)}`,
    `Method:       ${titleCase(p.method || "—")}`,
    `Status:       ${titleCase(p.status)}`,
    "",
    "Thank you for your payment.",
  ].join("\n")
  const blob = new Blob([lines], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `receipt-${p.payment_id}.txt`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
