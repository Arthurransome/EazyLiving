import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Hourglass,
  MapPin,
  XCircle,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatCard } from "@/components/shared/StatCard"

import { listOffers } from "@/api/offers"
import { formatCurrency, formatDate } from "@/lib/format"

import { AcceptOfferDialog } from "./AcceptOfferDialog"
import { DeclineOfferDialog } from "./DeclineOfferDialog"

const TABS = [
  { id: "pending", label: "Pending", icon: Hourglass },
  { id: "accepted", label: "Accepted", icon: CheckCircle2 },
  { id: "declined", label: "Declined", icon: XCircle },
  { id: "all", label: "All", icon: null },
]

const STATUS_BADGE = {
  pending: { variant: "warning", label: "Pending" },
  accepted: { variant: "success", label: "Accepted" },
  declined: { variant: "destructive", label: "Declined" },
  withdrawn: { variant: "muted", label: "Withdrawn by owner" },
}

export default function ManagerOffers() {
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState("pending")
  const [accepting, setAccepting] = useState(null)
  const [declining, setDeclining] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const list = await listOffers()
      setOffers(list)
      setError(null)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const counts = useMemo(() => {
    const c = { pending: 0, accepted: 0, declined: 0, withdrawn: 0 }
    for (const o of offers) c[o.status] = (c[o.status] || 0) + 1
    return c
  }, [offers])

  const filtered = useMemo(() => {
    if (tab === "all") return offers
    return offers.filter((o) => o.status === tab)
  }, [offers, tab])

  function applyUpdated(updated) {
    setOffers((list) =>
      list.map((o) => (o.offer_id === updated.offer_id ? updated : o)),
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Manager"
        title="Management offers"
        description="Owner offers to manage their properties — accept, decline, or review history."
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Couldn&apos;t load offers</AlertTitle>
          <AlertDescription>
            {error.message || "Try refreshing."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Pending"
          value={loading ? "" : counts.pending}
          icon={Hourglass}
          tone={counts.pending > 0 ? "warning" : "muted"}
          loading={loading}
        />
        <StatCard
          label="Accepted"
          value={loading ? "" : counts.accepted}
          icon={CheckCircle2}
          tone="success"
          loading={loading}
        />
        <StatCard
          label="Declined"
          value={loading ? "" : counts.declined}
          icon={XCircle}
          tone="muted"
          loading={loading}
        />
        <StatCard
          label="Total"
          value={loading ? "" : offers.length}
          icon={Building2}
          tone="default"
          loading={loading}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon
          const count =
            t.id === "all" ? offers.length : counts[t.id] || 0
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background hover:bg-accent"
              }`}
            >
              {Icon && <Icon className="size-3.5" />}
              {t.label}
              <span
                className={`ml-1 rounded-full px-1.5 text-[11px] ${
                  active
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-44 w-full animate-pulse rounded-xl bg-muted"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No offers in this view.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filtered.map((o) => (
            <OfferCard
              key={o.offer_id}
              offer={o}
              onAccept={() => setAccepting(o)}
              onDecline={() => setDeclining(o)}
            />
          ))}
        </div>
      )}

      <AcceptOfferDialog
        offer={accepting}
        open={!!accepting}
        onOpenChange={(v) => !v && setAccepting(null)}
        onAccepted={(updated) => {
          applyUpdated(updated)
          setAccepting(null)
        }}
      />
      <DeclineOfferDialog
        offer={declining}
        open={!!declining}
        onOpenChange={(v) => !v && setDeclining(null)}
        onDeclined={(updated) => {
          applyUpdated(updated)
          setDeclining(null)
        }}
      />
    </div>
  )
}

function OfferCard({ offer: o, onAccept, onDecline }) {
  const meta = STATUS_BADGE[o.status] || STATUS_BADGE.pending
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            {o.property?.name || "Property"}
          </CardTitle>
          <CardDescription className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">
              {o.property?.address}, {o.property?.city}, {o.property?.state}
            </span>
          </CardDescription>
        </div>
        <Badge variant={meta.variant}>{meta.label}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Owner
            </div>
            <div className="mt-1 font-medium">{o.owner?.name}</div>
            <div className="text-xs text-muted-foreground">
              {o.owner?.email}
            </div>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Sent
            </div>
            <div className="mt-1">{formatDate(o.created_at)}</div>
            {o.status === "accepted" && (
              <div className="mt-1 text-xs text-emerald-700">
                {o.management_fee_percent}% fee •{" "}
                {formatCurrency(o.onboarding_fee || 0)} onboarding
              </div>
            )}
          </div>
        </div>

        {o.proposed_message && (
          <>
            <Separator />
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Owner&apos;s message
              </div>
              <p className="text-sm whitespace-pre-wrap">
                {o.proposed_message}
              </p>
            </div>
          </>
        )}

        {o.decline_reason && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>You declined this offer</AlertTitle>
            <AlertDescription>{o.decline_reason}</AlertDescription>
          </Alert>
        )}

        {o.status === "pending" && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={onDecline}>
              <XCircle /> Decline
            </Button>
            <Button onClick={onAccept}>
              <CheckCircle2 /> Accept & sign
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
