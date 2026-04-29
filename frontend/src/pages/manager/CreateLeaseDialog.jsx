import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  FileSignature,
  Loader2,
  PenLine,
} from "lucide-react"

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
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"

import { listProperties, listUnits } from "@/api/properties"
import { createLease, signLease } from "@/api/leases"
import { useAuth } from "@/contexts/AuthContext"
import { useToast } from "@/contexts/ToastContext"
import { formatCurrency } from "@/lib/format"

const DEFAULT_TERMS = `Standard 12-month residential lease.

• Rent is due on the 1st of each month.
• A security deposit equal to one month's rent is required at signing.
• Tenant is responsible for utilities unless explicitly noted.
• 30 days written notice is required to terminate at end of term.
`

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function plusYearISO() {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Manager-side dialog: pick a vacant unit, set lease terms, optionally
 * counter-sign on the spot, and send the lease to the tenant for their
 * signature. Only properties this manager manages show up.
 */
export function CreateLeaseDialog({ open, tenant, onOpenChange, onCreated }) {
  const { user } = useAuth()
  const toast = useToast()

  const [properties, setProperties] = useState([])
  const [units, setUnits] = useState([])
  const [propertyId, setPropertyId] = useState("")
  const [unitId, setUnitId] = useState("")

  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState(plusYearISO())
  const [monthlyRent, setMonthlyRent] = useState("")
  const [securityDeposit, setSecurityDeposit] = useState("")
  const [terms, setTerms] = useState(DEFAULT_TERMS)

  const [signNow, setSignNow] = useState(true)
  const [signature, setSignature] = useState("")

  const [loadingProps, setLoadingProps] = useState(false)
  const [loadingUnits, setLoadingUnits] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Reset everything whenever the dialog (re)opens.
  useEffect(() => {
    if (!open) return
    setPropertyId("")
    setUnitId("")
    setUnits([])
    setStartDate(todayISO())
    setEndDate(plusYearISO())
    setMonthlyRent("")
    setSecurityDeposit("")
    setTerms(DEFAULT_TERMS)
    setSignNow(true)
    setSignature(user?.name || "")
    setError(null)
    setSubmitting(false)

    let cancelled = false
    setLoadingProps(true)
    listProperties()
      .then((list) => {
        if (cancelled) return
        // Only properties this manager actually manages.
        const mine = list.filter(
          (p) => p.manager_id && p.manager_id === user?.user_id,
        )
        setProperties(mine)
      })
      .catch(() => {
        // Non-fatal — the user just sees an empty list.
      })
      .finally(() => {
        if (!cancelled) setLoadingProps(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, user?.user_id, user?.name])

  // Load units when a property is picked.
  useEffect(() => {
    if (!propertyId) {
      setUnits([])
      setUnitId("")
      return
    }
    let cancelled = false
    setLoadingUnits(true)
    listUnits(propertyId)
      .then((list) => {
        if (cancelled) return
        setUnits(list)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingUnits(false)
      })
    return () => {
      cancelled = true
    }
  }, [propertyId])

  // Auto-suggest rent + deposit from the chosen unit.
  useEffect(() => {
    if (!unitId) return
    const u = units.find((u) => u.unit_id === unitId)
    if (!u) return
    if (!monthlyRent) setMonthlyRent(String(u.monthly_rent ?? ""))
    if (!securityDeposit && u.monthly_rent) {
      setSecurityDeposit(String(u.monthly_rent))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId])

  const vacantUnits = useMemo(
    () => units.filter((u) => !u.is_occupied),
    [units],
  )

  const validRent =
    monthlyRent !== "" && !Number.isNaN(Number(monthlyRent)) && Number(monthlyRent) > 0
  const validDeposit =
    securityDeposit === "" ||
    (!Number.isNaN(Number(securityDeposit)) && Number(securityDeposit) >= 0)
  const validDates =
    !!startDate && !!endDate && new Date(endDate) > new Date(startDate)
  const validSignature = !signNow || signature.trim().length > 1

  const canSubmit =
    !!tenant &&
    !!unitId &&
    validRent &&
    validDeposit &&
    validDates &&
    validSignature &&
    !submitting

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const lease = await createLease({
        unit_id: unitId,
        tenant_id: tenant.user_id,
        start_date: startDate,
        end_date: endDate,
        monthly_rent: monthlyRent,
        security_deposit: securityDeposit || "0.00",
        terms: terms.trim() || DEFAULT_TERMS,
        status: "draft",
      })
      let final = lease
      if (signNow) {
        final = await signLease(lease.lease_id, signature.trim())
      }
      onCreated?.(final)
      toast.success(
        signNow ? "Lease drafted and signed" : "Lease drafted",
        signNow
          ? "Tenant has been notified to counter-sign."
          : "You can sign it later from the lease page.",
      )
      onOpenChange(false)
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Draft a lease</DialogTitle>
          <DialogDescription>
            {tenant ? (
              <>
                Putting <span className="font-medium">{tenant.name}</span> on a
                lease. Pick a vacant unit, set terms, and optionally
                counter-sign now.
              </>
            ) : (
              "Pick a tenant first."
            )}
          </DialogDescription>
        </DialogHeader>

        {tenant && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="lease-property">Property</Label>
              <Select
                value={propertyId}
                onValueChange={(v) => {
                  setPropertyId(v)
                  setUnitId("")
                  setMonthlyRent("")
                  setSecurityDeposit("")
                }}
                disabled={loadingProps}
              >
                <SelectTrigger id="lease-property">
                  <SelectValue
                    placeholder={
                      loadingProps
                        ? "Loading properties…"
                        : properties.length === 0
                          ? "No properties under management"
                          : "Choose a property"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.property_id} value={p.property_id}>
                      {p.name} — {p.city}, {p.state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!loadingProps && properties.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Accept a management offer first to take on a property.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lease-unit">Unit</Label>
              <Select
                value={unitId}
                onValueChange={setUnitId}
                disabled={!propertyId || loadingUnits}
              >
                <SelectTrigger id="lease-unit">
                  <SelectValue
                    placeholder={
                      !propertyId
                        ? "Pick a property first"
                        : loadingUnits
                          ? "Loading units…"
                          : vacantUnits.length === 0
                            ? "No vacant units in this property"
                            : "Choose a vacant unit"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {vacantUnits.map((u) => (
                    <SelectItem key={u.unit_id} value={u.unit_id}>
                      Unit {u.unit_number} • {u.bedrooms ?? "—"}bd/
                      {u.bathrooms ?? "—"}ba •{" "}
                      {formatCurrency(u.monthly_rent)}/mo
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lease-start">Start date</Label>
                <Input
                  id="lease-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lease-end">End date</Label>
                <Input
                  id="lease-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
            </div>
            {!validDates && (
              <p className="-mt-2 text-xs text-destructive">
                End date must be after the start date.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lease-rent">Monthly rent</Label>
                <Input
                  id="lease-rent"
                  inputMode="decimal"
                  value={monthlyRent}
                  onChange={(e) => setMonthlyRent(e.target.value)}
                  placeholder="e.g. 2100"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lease-deposit">Security deposit</Label>
                <Input
                  id="lease-deposit"
                  inputMode="decimal"
                  value={securityDeposit}
                  onChange={(e) => setSecurityDeposit(e.target.value)}
                  placeholder="e.g. 2100"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lease-terms">Lease terms</Label>
              <Textarea
                id="lease-terms"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                rows={5}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Plain text — tenant will see this verbatim before signing.
              </p>
            </div>

            <Separator />

            <label className="flex items-start gap-2 rounded-md border border-dashed p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={signNow}
                onChange={(e) => setSignNow(e.target.checked)}
              />
              <span>
                <span className="font-medium">Counter-sign now</span> and send
                to the tenant for their signature. Otherwise it stays a
                draft you can finish later.
              </span>
            </label>

            {signNow && (
              <div className="space-y-1.5">
                <Label htmlFor="lease-sig" className="flex items-center gap-1.5">
                  <PenLine className="size-3.5" /> Type your signature
                </Label>
                <Input
                  id="lease-sig"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="Your full name"
                  className="font-serif italic"
                />
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Couldn&apos;t draft lease</AlertTitle>
                <AlertDescription>
                  {error.message ||
                    "Please double-check the fields and try again."}
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
                ) : signNow ? (
                  <CheckCircle2 />
                ) : (
                  <FileSignature />
                )}
                {signNow ? "Sign & send" : "Save draft"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
