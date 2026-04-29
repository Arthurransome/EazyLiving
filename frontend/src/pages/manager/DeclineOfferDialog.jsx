import { useEffect, useState } from "react"
import { AlertCircle, Loader2, XCircle } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

import { declineOffer } from "@/api/offers"
import { useToast } from "@/contexts/ToastContext"

export function DeclineOfferDialog({ offer, open, onOpenChange, onDeclined }) {
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()

  useEffect(() => {
    if (open) {
      setReason("")
      setError(null)
      setSubmitting(false)
    }
  }, [open, offer?.offer_id])

  async function handleDecline(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const updated = await declineOffer(
        offer.offer_id,
        reason.trim() || null,
      )
      toast.info("Offer declined", offer.property?.name)
      onDeclined?.(updated)
      onOpenChange(false)
    } catch (err) {
      setError(err)
      toast.error("Couldn't decline", err.message || "Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline this offer</DialogTitle>
          <DialogDescription>
            The owner will see your reason if you provide one.
          </DialogDescription>
        </DialogHeader>
        {offer && (
          <form onSubmit={handleDecline} className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="font-medium">{offer.property?.name}</div>
              <div className="text-xs text-muted-foreground">
                From {offer.owner?.name}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dec-reason">Reason (optional)</Label>
              <Textarea
                id="dec-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                placeholder="Bandwidth, area, terms, etc."
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Couldn&apos;t decline</AlertTitle>
                <AlertDescription>
                  {error.message || "Try again."}
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
              <Button type="submit" variant="destructive" disabled={submitting}>
                {submitting ? <Loader2 className="animate-spin" /> : <XCircle />}
                Decline offer
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
