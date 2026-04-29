import { useEffect, useState } from "react"
import { AlertCircle, Loader2, UserPlus } from "lucide-react"

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

import { inviteTenant } from "@/api/invites"

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  note: "",
}

/**
 * Manager-facing dialog to invite a new tenant. Creates an actual user
 * account on the mock backend (with a temp password) and returns the
 * generated credentials so the manager can hand them off offline.
 */
export function InviteTenantDialog({ open, onOpenChange, onInvited }) {
  const [form, setForm] = useState(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setForm(EMPTY)
    setError(null)
    setSubmitting(false)
  }, [open])

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
  const canSubmit =
    form.name.trim().length > 1 && validEmail && !submitting

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await inviteTenant({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        note: form.note.trim() || null,
      })
      onInvited?.(result)
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
          <DialogTitle>Invite a tenant</DialogTitle>
          <DialogDescription>
            We&apos;ll create their account and hand you a temp password to
            share. They can sign in immediately and review their lease when
            you draft it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="inv-name">Full name</Label>
            <Input
              id="inv-name"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Jordan Rivera"
              autoFocus
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-email">Email</Label>
            <Input
              id="inv-email"
              type="email"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              placeholder="jordan@example.com"
              required
            />
            {form.email && !validEmail && (
              <p className="text-xs text-destructive">
                That doesn&apos;t look like a valid email.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-phone">Phone (optional)</Label>
            <Input
              id="inv-phone"
              value={form.phone}
              onChange={(e) => setField("phone", e.target.value)}
              placeholder="555-555-1234"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-note">Note (optional)</Label>
            <Textarea
              id="inv-note"
              value={form.note}
              onChange={(e) => setField("note", e.target.value)}
              rows={2}
              placeholder="Move-in target, anything we should remember…"
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Couldn&apos;t send invite</AlertTitle>
              <AlertDescription>
                {error.message ||
                  "If this email is already in use, ask the tenant to log in instead."}
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
                <UserPlus />
              )}
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
