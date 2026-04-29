import { useEffect, useState } from "react"
import { AlertCircle, Loader2 } from "lucide-react"

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

import { createUnit } from "@/api/properties"

const EMPTY = {
  unit_number: "",
  bedrooms: "",
  bathrooms: "",
  square_feet: "",
  monthly_rent: "",
}

/**
 * Modal for creating a unit inside a specific property.
 * `propertyId` is required; without it the dialog won't render its form.
 */
export function NewUnitDialog({ open, propertyId, onOpenChange, onCreated }) {
  const [form, setForm] = useState(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (open) {
      setForm(EMPTY)
      setError(null)
      setSubmitting(false)
    }
  }, [open])

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const canSubmit =
    form.unit_number.trim().length > 0 &&
    Number(form.monthly_rent) > 0 &&
    !submitting

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit || !propertyId) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await createUnit(propertyId, {
        unit_number: form.unit_number.trim(),
        bedrooms: form.bedrooms === "" ? null : Number(form.bedrooms),
        bathrooms: form.bathrooms === "" ? null : Number(form.bathrooms),
        square_feet:
          form.square_feet === "" ? null : Number(form.square_feet),
        // Send rent as a string so it matches the existing decimal shape.
        monthly_rent: Number(form.monthly_rent).toFixed(2),
      })
      onCreated?.(created)
      onOpenChange(false)
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a unit</DialogTitle>
          <DialogDescription>
            Units are individual rentals inside a property. New units start
            unoccupied — link a tenant by creating a lease.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="unit-number">Unit number</Label>
              <Input
                id="unit-number"
                value={form.unit_number}
                onChange={(e) => setField("unit_number", e.target.value)}
                placeholder="101"
                autoFocus
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-rent">Monthly rent (USD)</Label>
              <Input
                id="unit-rent"
                inputMode="decimal"
                value={form.monthly_rent}
                onChange={(e) => setField("monthly_rent", e.target.value)}
                placeholder="1800"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-bed">Bedrooms</Label>
              <Input
                id="unit-bed"
                type="number"
                min="0"
                value={form.bedrooms}
                onChange={(e) => setField("bedrooms", e.target.value)}
                placeholder="2"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-bath">Bathrooms</Label>
              <Input
                id="unit-bath"
                type="number"
                min="0"
                step="0.5"
                value={form.bathrooms}
                onChange={(e) => setField("bathrooms", e.target.value)}
                placeholder="1"
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="unit-sqft">Square feet</Label>
              <Input
                id="unit-sqft"
                type="number"
                min="0"
                value={form.square_feet}
                onChange={(e) => setField("square_feet", e.target.value)}
                placeholder="820"
              />
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Couldn&apos;t create unit</AlertTitle>
              <AlertDescription>
                {error.message || "Please check the fields and try again."}
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
              {submitting && <Loader2 className="animate-spin" />}
              Create unit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
