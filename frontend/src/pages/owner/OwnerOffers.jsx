import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  Hourglass,
  Loader2,
  Star,
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

import { listOffers, withdrawOffer } from "@/api/offers"
import { useToast } from "@/contexts/ToastContext"
import { formatCurrency, formatDate } from "@/lib/format"

const STATUS_META = {
  pending: { label: "Pending", icon: Hourglass, variant: "warning" },
  accepted: { label: "Accepted", icon: CheckCircle2, variant: "success" },
  declined: { label: "Declined", icon: XCircle, variant: "destructive" },
  withdrawn: { label: "Withdrawn", icon: XCircle, variant: "muted" },
}

export default function OwnerOffers() {
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [withdrawing, setWithdrawing] = useState(null)
  const toast = useToast()

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

  async function handleWithdraw(offer) {
    setWithdrawing(offer.offer_id)
    try {
      await withdrawOffer(offer.offer_id)
      toast.success("Offer withdrawn", `${offer.property?.name || "Property"}`)
      await load()
    } catch (err) {
      toast.error("Couldn't withdraw", err.message || "Try again.")
    } finally {
      setWithdrawing(null)
    }
  }

  const sorted = useMemo(() => {
    const order = { pending: 0, accepted: 1, declined: 2, withdrawn: 3 }
    return [...offers].sort(
      (a, b) =>
        (order[a.status] ?? 9) - (order[b.status] ?? 9) ||
        (a.created_at < b.created_at ? 1 : -1),
    )
  }, [offers])

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Owner"
        title="Management offers"
        description="Track every offer you've sent to a property manager."
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Couldn&apos;t load offers</AlertTitle>
          <AlertDescription>
            {error.message || "Please try refreshing the page."}
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
          tone={counts.declined > 0 ? "warning" : "muted"}
          loading={loading}
        />
        <StatCard
          label="Withdrawn"
          value={loading ? "" : counts.withdrawn}
          icon={XCircle}
          tone="muted"
          loading={loading}
        />
      </div>

      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-40 w-full animate-pulse rounded-xl bg-muted"
            />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            You haven&apos;t sent any management offers yet. Visit{" "}
            <span className="font-medium">Properties</span> and click{" "}
            <span className="font-medium">List a property</span> to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sorted.map((o) => (
            <OfferCard
              key={o.offer_id}
              offer={o}
              onWithdraw={handleWithdraw}
              withdrawing={withdrawing === o.offer_id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function OfferCard({ offer: o, onWithdraw, withdrawing }) {
  const meta = STATUS_META[o.status] || STATUS_META.pending
  const Icon = meta.icon
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            {o.property?.name || "Property"}
          </CardTitle>
          <CardDescription>
            {o.property?.address}, {o.property?.city} • Sent{" "}
            {formatDate(o.created_at)}
          </CardDescription>
        </div>
        <Badge variant={meta.variant} className="gap-1">
          <Icon className="size-3.5" /> {meta.label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Manager
            </div>
            <div className="mt-1 font-medium">
              {o.manager?.name || "Unknown"}
            </div>
            <div className="text-xs text-muted-foreground">
              {o.manager?.email}
            </div>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Terms
            </div>
            {o.status === "accepted" ? (
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="success">
                  {o.management_fee_percent}% fee
                </Badge>
                <span className="text-xs text-muted-foreground">
                  + {formatCurrency(o.onboarding_fee || 0)} onboarding
                </span>
              </div>
            ) : (
              <div className="mt-1 text-xs text-muted-foreground">
                Awaiting manager&apos;s counter-offer.
              </div>
            )}
          </div>
        </div>

        {o.proposed_message && (
          <>
            <Separator />
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Message
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
            <AlertTitle>Decline reason</AlertTitle>
            <AlertDescription>{o.decline_reason}</AlertDescription>
          </Alert>
        )}

        {o.status === "accepted" && o.manager_signed_at && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <div className="flex items-center gap-1.5">
              <Star className="size-3.5 fill-emerald-600 text-emerald-600" />
              <span className="font-medium">Counter-signed</span>
            </div>
            <div className="mt-1">
              {o.manager_signature} • {formatDate(o.manager_signed_at)}
            </div>
          </div>
        )}

        {o.status === "pending" && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onWithdraw(o)}
              disabled={withdrawing}
            >
              {withdrawing ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Clock />
              )}
              Withdraw offer
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
