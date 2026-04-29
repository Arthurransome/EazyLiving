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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { createProperty } from "@/api/properties"
import { listUsers } from "@/api/users"

const EMPTY = {
  name: "",
  address: "",
  city: "",
  state: "",
  zip_code: "",
  owner_id: "",
}

/**
 * Modal for creating a property. Managers must pick an owner from the
 * existing user list — the backend assigns owners' own properties to
 * themselves automatically, but managers don't own buildings, so the
 * picker is required for them.
 */
export function NewPropertyDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState(EMPTY)
  const [owners, setOwners] = useState([])
  const [loadingOwners, setLoadingOwners] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setForm(EMPTY)
    setError(null)
    setSubmitting(false)
    let cancelled = false
    setLoadingOwners(true)
    listUsers()
      .then((list) => {
        if (cancelled) return
        setOwners(list.filter((u) => u.role === "owner"))
      })
      .catch(() => {
        // Non-fatal — picker just stays empty.
      })
      .finally(() => {
        if (!cancelled) setLoadingOwners(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const canSubmit =
    form.name.trim() &&
    form.address.trim() &&
    form.city.trim() &&
    form.state.trim() &&
    form.zip_code.trim() &&
    form.owner_id &&
    !submitting

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await createProperty({
        name: form.name.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        zip_code: form.zip_code.trim(),
        owner_id: form.owner_id,
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
          <DialogTitle>Add a property</DialogTitle>
          <DialogDescription>
            Properties are buildings or houses. You can add units to a
            property after it&apos;s created.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="prop-name">Property name</Label>
            <Input
              id="prop-name"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="e.g. Maple Heights"
              autoFocus
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prop-address">Street address</Label>
            <Input
              id="prop-address"
              value={form.address}
              onChange={(e) => setField("address", e.target.value)}
              placeholder="123 Maple Avenue"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="prop-city">City</Label>
              <Input
                id="prop-city"
                value={form.city}
                onChange={(e) => setField("city", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prop-state">State / Province</Label>
              <Input
                id="prop-state"
                value={form.state}
                onChange={(e) => setField("state", e.target.value)}
                placeholder="ON"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prop-zip">Postal code</Label>
              <Input
                id="prop-zip"
                value={form.zip_code}
                onChange={(e) => setField("zip_code", e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prop-owner">Owner</Label>
            <Select
              value={form.owner_id}
              onValueChange={(v) => setField("owner_id", v)}
              disabled={loadingOwners}
            >
              <SelectTrigger id="prop-owner">
                <SelectValue
                  placeholder={
                    loadingOwners ? "Loading owners…" : "Select an owner"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {owners.map((o) => (
                  <SelectItem key={o.user_id} value={o.user_id}>
                    {o.name} • {o.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Couldn&apos;t create property</AlertTitle>
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
              Create property
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
