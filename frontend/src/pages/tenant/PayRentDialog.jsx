import { useEffect, useState } from "react"
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

import { processPayment } from "@/api/payments"
import { PAYMENT_STRATEGIES, getStrategy } from "@/lib/payment-strategies"
import {
  formatCurrency,
  formatDate,
  relativeDays,
  titleCase,
} from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * Modal for paying a single invoice.
 *
 * Lets the tenant pick a Strategy (credit card / bank transfer / account
 * balance), fills in the strategy-specific fields, optionally simulates a
 * processor failure, and POSTs to /payments/:id/process. On success the
 * parent gets the updated payment record via `onPaid`.
 */
export function PayRentDialog({ open, payment, onOpenChange, onPaid }) {
  const [methodId, setMethodId] = useState("credit_card")
  const [fields, setFields] = useState({})
  const [simulateFailure, setSimulateFailure] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Reset everything when the dialog re-opens for a different invoice.
  useEffect(() => {
    if (open) {
      setMethodId("credit_card")
      setFields({})
      setSimulateFailure(false)
      setSubmitting(false)
      setError(null)
      setSuccess(null)
    }
  }, [open, payment?.payment_id])

  const strategy = getStrategy(methodId)
  const lateFee = Number(payment?.late_fee || 0)
  const baseAmount = Number(payment?.amount || 0)
  const total = baseAmount + lateFee

  async function handleSubmit(e) {
    e.preventDefault()
    if (!payment) return
    setSubmitting(true)
    setError(null)
    try {
      const updated = await processPayment(payment.payment_id, {
        method: methodId,
        simulate_failure: simulateFailure,
      })
      setSuccess(updated)
      onPaid?.(updated)
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Pay rent</DialogTitle>
          <DialogDescription>
            {payment ? (
              <>
                Invoice for {formatCurrency(payment.amount)} due{" "}
                {formatDate(payment.due_date)} ({relativeDays(payment.due_date)})
              </>
            ) : (
              "Select an invoice to pay."
            )}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <SuccessView payment={success} onClose={() => onOpenChange(false)} />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Amount summary */}
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Rent</span>
                <span>{formatCurrency(baseAmount)}</span>
              </div>
              {lateFee > 0 && (
                <div className="mt-1 flex items-center justify-between text-destructive">
                  <span>Late fee</span>
                  <span>{formatCurrency(lateFee)}</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex items-center justify-between font-semibold">
                <span>Total due</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>

            {/* Strategy picker */}
            <div className="space-y-2">
              <Label>Payment method</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {PAYMENT_STRATEGIES.map((s) => {
                  const Icon = s.icon
                  const active = methodId === s.id
                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => setMethodId(s.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors",
                        active
                          ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                          : "border-input hover:bg-accent",
                      )}
                    >
                      <div className="flex w-full items-center justify-between">
                        <Icon className="size-4 text-muted-foreground" />
                        {active && (
                          <CheckCircle2 className="size-4 text-primary" />
                        )}
                      </div>
                      <div className="text-sm font-medium">{s.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.description}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Strategy-specific fields */}
            {strategy && strategy.fields.length > 0 && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {strategy.fields.map((f) => (
                    <div
                      key={f.name}
                      className={cn(
                        "space-y-1.5",
                        f.width === "half" ? "col-span-1" : "col-span-2",
                      )}
                    >
                      <Label htmlFor={`pay-${f.name}`}>{f.label}</Label>
                      <Input
                        id={`pay-${f.name}`}
                        placeholder={f.placeholder}
                        value={fields[f.name] || ""}
                        onChange={(e) =>
                          setFields((prev) => ({
                            ...prev,
                            [f.name]: e.target.value,
                          }))
                        }
                        autoComplete="off"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Demo only — these fields are not validated or stored.
                </p>
              </div>
            )}

            {/* Simulate failure toggle */}
            {strategy?.canSimulateFailure && (
              <label className="flex items-start gap-2 rounded-md border border-dashed p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={simulateFailure}
                  onChange={(e) => setSimulateFailure(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Simulate processor failure</span>
                  <span className="block text-xs text-muted-foreground">
                    Useful for testing the error path — the API will return 402.
                  </span>
                </span>
              </label>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Payment failed</AlertTitle>
                <AlertDescription>
                  {error.message || "Something went wrong. Please try again."}
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
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="animate-spin" />}
                Pay {formatCurrency(total)}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SuccessView({ payment, onClose }) {
  return (
    <div className="space-y-4">
      <Alert>
        <CheckCircle2 className="size-4" />
        <AlertTitle>Payment received</AlertTitle>
        <AlertDescription>
          Thanks — your receipt is ready below.
        </AlertDescription>
      </Alert>
      <div className="rounded-md border p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Amount paid</span>
          <span className="font-semibold">{formatCurrency(payment.amount)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-muted-foreground">Method</span>
          <Badge variant="muted">{titleCase(payment.method || "—")}</Badge>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-muted-foreground">Date</span>
          <span>{formatDate(payment.payment_date)}</span>
        </div>
        {payment.receipt_ref && (
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Receipt</span>
            <span className="font-mono">{payment.receipt_ref}</span>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </div>
  )
}
