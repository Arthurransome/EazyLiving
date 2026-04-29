import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Search,
  Send,
  Sparkles,
  Star,
  Users,
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
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"

import { createProperty } from "@/api/properties"
import { listManagers } from "@/api/managers"
import { createOffer } from "@/api/offers"
import { useToast } from "@/contexts/ToastContext"
import { cn } from "@/lib/utils"

const EMPTY_DETAILS = {
  name: "",
  address: "",
  city: "",
  state: "",
  zip_code: "",
}

/**
 * Owner-side flow for listing a new property.
 *
 * Walks through three steps:
 *   1. Property details
 *   2. Manager directory — pick a manager (with their ratings + stats)
 *   3. Review & send the management offer (with an optional message)
 *
 * On finish: creates the property, creates a pending management offer to the
 * selected manager, and fires `onCompleted({ property, offer })` so the
 * caller can refresh.
 */
export function OwnerAddPropertyDialog({ open, onOpenChange, onCompleted }) {
  const [step, setStep] = useState(1)
  const [details, setDetails] = useState(EMPTY_DETAILS)
  const [managers, setManagers] = useState([])
  const [loadingManagers, setLoadingManagers] = useState(false)
  const [selectedManagerId, setSelectedManagerId] = useState("")
  const [message, setMessage] = useState("")
  const [managerQuery, setManagerQuery] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()

  // Reset whenever the dialog reopens.
  useEffect(() => {
    if (!open) return
    setStep(1)
    setDetails(EMPTY_DETAILS)
    setSelectedManagerId("")
    setMessage("")
    setManagerQuery("")
    setError(null)
    setSubmitting(false)
    let cancelled = false
    setLoadingManagers(true)
    listManagers()
      .then((list) => {
        if (cancelled) return
        setManagers(list)
      })
      .catch(() => {
        // Non-fatal; the picker just stays empty.
      })
      .finally(() => {
        if (!cancelled) setLoadingManagers(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const detailsValid =
    details.name.trim() &&
    details.address.trim() &&
    details.city.trim() &&
    details.state.trim() &&
    details.zip_code.trim()

  const filteredManagers = useMemo(() => {
    const q = managerQuery.trim().toLowerCase()
    if (!q) return managers
    return managers.filter((m) => {
      const hay = [
        m.user?.name,
        m.user?.email,
        m.headline,
        m.service_area,
        ...(m.specialties || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return hay.includes(q)
    })
  }, [managers, managerQuery])

  const selectedManager = managers.find(
    (m) => m.manager_id === selectedManagerId,
  )

  function setField(name, value) {
    setDetails((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit() {
    if (!detailsValid || !selectedManagerId) return
    setSubmitting(true)
    setError(null)
    try {
      const property = await createProperty({
        name: details.name.trim(),
        address: details.address.trim(),
        city: details.city.trim(),
        state: details.state.trim(),
        zip_code: details.zip_code.trim(),
      })
      const offer = await createOffer({
        property_id: property.property_id,
        manager_id: selectedManagerId,
        proposed_message: message.trim(),
      })
      toast.success(
        "Property listed",
        `Offer sent to ${selectedManager?.user?.name || "manager"}.`,
      )
      onCompleted?.({ property, offer })
      onOpenChange(false)
    } catch (err) {
      setError(err)
      toast.error(
        "Couldn't send offer",
        err.message || "Please try again.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>List a new property</DialogTitle>
          <DialogDescription>
            Add the building details, pick a manager, and send them an offer
            to manage your property.
          </DialogDescription>
        </DialogHeader>

        <Stepper step={step} />

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="own-prop-name">Property name</Label>
              <Input
                id="own-prop-name"
                value={details.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="e.g. Cedar Court"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="own-prop-address">Street address</Label>
              <Input
                id="own-prop-address"
                value={details.address}
                onChange={(e) => setField("address", e.target.value)}
                placeholder="789 Cedar Lane"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-1">
                <Label htmlFor="own-prop-city">City</Label>
                <Input
                  id="own-prop-city"
                  value={details.city}
                  onChange={(e) => setField("city", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="own-prop-state">State / Province</Label>
                <Input
                  id="own-prop-state"
                  value={details.state}
                  onChange={(e) => setField("state", e.target.value)}
                  placeholder="ON"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="own-prop-zip">Postal code</Label>
                <Input
                  id="own-prop-zip"
                  value={details.zip_code}
                  onChange={(e) => setField("zip_code", e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={managerQuery}
                onChange={(e) => setManagerQuery(e.target.value)}
                placeholder="Search managers by name, area, or specialty…"
                className="pl-9"
              />
            </div>
            <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {loadingManagers ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-32 w-full animate-pulse rounded-xl bg-muted"
                  />
                ))
              ) : filteredManagers.length === 0 ? (
                <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No managers match your search.
                </p>
              ) : (
                filteredManagers.map((m) => (
                  <ManagerCard
                    key={m.manager_id}
                    manager={m}
                    selected={selectedManagerId === m.manager_id}
                    onSelect={() => setSelectedManagerId(m.manager_id)}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {step === 3 && selectedManager && (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-4 text-sm">
              <div className="font-medium">Property</div>
              <div className="mt-1 text-muted-foreground">
                {details.name} — {details.address}, {details.city},{" "}
                {details.state} {details.zip_code}
              </div>
              <Separator className="my-3" />
              <div className="font-medium">Manager</div>
              <div className="mt-1 flex items-start justify-between gap-3">
                <div>
                  <div>{selectedManager.user?.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {selectedManager.headline}
                  </div>
                </div>
                <Badge variant="muted">
                  Starting at {selectedManager.starting_fee_percent}%
                </Badge>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-message">
                Message to {selectedManager.user?.name?.split(" ")[0]} (optional)
              </Label>
              <Textarea
                id="offer-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Quick context about the property, expectations, or anything you'd like them to know."
                rows={5}
              />
              <p className="text-xs text-muted-foreground">
                The manager will see this in their offers inbox. They can
                accept (and counter-sign with their fee), or decline.
              </p>
            </div>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Couldn&apos;t send offer</AlertTitle>
            <AlertDescription>
              {error.message ||
                "Something went wrong. Please check the fields and try again."}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (step === 1) onOpenChange(false)
              else setStep(step - 1)
            }}
            disabled={submitting}
          >
            {step === 1 ? "Cancel" : (
              <>
                <ArrowLeft /> Back
              </>
            )}
          </Button>
          {step < 3 ? (
            <Button
              type="button"
              onClick={() => setStep(step + 1)}
              disabled={
                (step === 1 && !detailsValid) ||
                (step === 2 && !selectedManagerId)
              }
            >
              Next <ArrowRight />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !selectedManagerId || !detailsValid}
            >
              {submitting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Send />
              )}
              Send offer
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stepper({ step }) {
  const steps = ["Property details", "Pick a manager", "Review & send"]
  return (
    <div className="flex items-center gap-2 text-xs">
      {steps.map((label, i) => {
        const idx = i + 1
        const active = idx === step
        const done = idx < step
        return (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                active && "border-primary bg-primary text-primary-foreground",
                done && "border-emerald-500 bg-emerald-500 text-white",
                !active && !done && "border-input text-muted-foreground",
              )}
            >
              {done ? <CheckCircle2 className="size-3.5" /> : idx}
            </div>
            <span
              className={cn(
                "truncate",
                active ? "font-medium" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {idx < steps.length && (
              <div className="ml-1 h-px flex-1 bg-border" />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function ManagerCard({ manager: m, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "block w-full rounded-lg border p-4 text-left transition-colors",
        selected
          ? "border-primary ring-2 ring-primary/30 bg-primary/5"
          : "border-input hover:bg-accent",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{m.user?.name}</span>
            {selected && <CheckCircle2 className="size-4 text-primary" />}
          </div>
          <div className="text-xs text-muted-foreground">{m.headline}</div>
          <div className="flex flex-wrap items-center gap-1 pt-1">
            {(m.specialties || []).map((s) => (
              <Badge key={s} variant="muted">
                {s}
              </Badge>
            ))}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-center gap-1 text-sm font-semibold">
            <Star className="size-4 fill-amber-400 text-amber-400" />
            {m.rating?.toFixed(1)}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {m.review_count} reviews
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Pill icon={MapPin} label={m.service_area} />
        <Pill icon={Users} label={`${m.active_properties} active`} />
        <Pill icon={Clock} label={`~${m.response_time_hours}h response`} />
        <Pill icon={Sparkles} label={`${m.years_experience} yr exp`} />
      </div>
    </button>
  )
}

function Pill({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1 text-muted-foreground">
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  )
}
