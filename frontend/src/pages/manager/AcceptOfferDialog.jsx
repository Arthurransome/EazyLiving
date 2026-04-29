import { useEffect, useMemo, useState } from "react"
import { AlertCircle, CheckCircle2, Loader2, PenLine } from "lucide-react"

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
import { Separator } from "@/components/ui/separator"

import { acceptOffer } from "@/api/offers"
import { useAuth } from "@/contexts/AuthContext"
import { useToast } from "@/contexts/ToastContext"
import { formatCurrency } from "@/lib/format"

/**
 * Modal for the manager to accept a pending offer.
 *
 * Captures the management_fee_percent + onboarding_fee + typed signature.
 * On submit: PUT /management-offers/:id { event: "accept", ... }
 */
export function AcceptOfferDialog({ offer, open, onOpenChange, onAccepted }) {
  const { user } = useAuth()
  const toast = useToast()
  const [feePercent, setFeePercent] = useState("")
  const [onboardingFee, setOnboardingFee] = useState("500.00")
  const [signature, setSignature] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setFeePercent("")
    setOnboardingFee("500.00")
    setSignature(user?.name || "")
    setAgreed(false)
    setError(null)
    setSubmitting(false)
  }, [open, user?.name, offer?.offer_id])

  const feeNum = Number(feePercent)
  const validFee = !Number.isNaN(feeNum) && feeNum > 0 && feeNum <= 50
  const validOnboarding =
    onboardingFee === "" || !Number.isNaN(Number(onboardingFee))

  const canSubmit =
    validFee &&
    validOnboarding &&
    signature.trim().length > 1 &&
    agreed &&
    !submitting

  const expectedRent = useMemo(() => {
    // Sum monthly_rent across the property's units (visible on the offer).
    return 0
  }, [])

  async function handleAccept(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const updated = await acceptOffer(offer.offer_id, {
        management_fee_percent: feeNum,
        onboarding_fee: onboardingFee || "0.00",
        signature: signature.trim(),
      })
      toast.success(
        "Offer accepted",
        `${offer.property?.name || "Property"} is now in your portfolio.`,
      )
      onAccepted?.(updated)
      onOpenChange(false)
    } catch (err) {
      setError(err)
      toast.error("Couldn't accept offer", err.message || "Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accept management offer</DialogTitle>
          <DialogDescription>
            Set your management fee and counter-sign to take this property on.
          </DialogDescription>
        </DialogHeader>

        {offer && (
          <form onSubmit={handleAccept} className="space-y-4">
            {/* Property summary */}
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="font-medium">{offer.property?.name}</div>
              <div className="text-xs text-muted-foreground">
                {offer.property?.address}, {offer.property?.city}
              </div>
              <Separator className="my-2" />
              <div className="text-xs text-muted-foreground">
                From <span className="font-medium">{offer.owner?.name}</span>
              </div>
            </div>

            {/* Pricing */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="acc-fee">Management fee (%)</Label>
                <Input
                  id="acc-fee"
                  inputMode="decimal"
                  value={feePercent}
                  onChange={(e) => setFeePercent(e.target.value)}
                  placeholder="e.g. 7.5"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Charged on monthly rent collected.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acc-onboarding">Onboarding fee</Label>
                <Input
                  id="acc-onboarding"
                  inputMode="decimal"
                  value={onboardingFee}
                  onChange={(e) => setOnboardingFee(e.target.value)}
                  placeholder="e.g. 500.00"
                />
                <p className="text-xs text-muted-foreground">
                  One-time setup fee.
                </p>
              </div>
            </div>

            {/* Signature */}
            <div className="space-y-1.5">
              <Label htmlFor="acc-sig" className="flex items-center gap-1.5">
                <PenLine className="size-3.5" /> Type your signature
              </Label>
              <Input
                id="acc-sig"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder="Your full name"
                className="font-serif italic"
              />
            </div>

            <label className="flex items-start gap-2 rounded-md border border-dashed p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                <span className="font-medium">I agree</span> to manage{" "}
                {offer.property?.name || "this property"} at the rates above
                and acknowledge this counter-signs the management agreement.
              </span>
            </label>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Couldn&apos;t accept</AlertTitle>
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
                ) : (
                  <CheckCircle2 />
                )}
                Accept & sign
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
