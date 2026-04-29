import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClockAlert,
  FileSignature,
  Hourglass,
  Loader2,
  Mail,
  MapPin,
  PenLine,
  Phone,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { PageHeader } from "@/components/shared/PageHeader"

import { getLease, signLease } from "@/api/leases"
import { useAuth } from "@/contexts/AuthContext"
import { useToast } from "@/contexts/ToastContext"
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  titleCase,
} from "@/lib/format"

const STATUS_META = {
  draft: {
    variant: "muted",
    label: "Draft",
    helper: "Waiting for the manager to counter-sign.",
    icon: PenLine,
  },
  pending_tenant: {
    variant: "warning",
    label: "Pending tenant signature",
    helper: "You signed — tenant still needs to sign.",
    icon: Hourglass,
  },
  active: {
    variant: "success",
    label: "Active",
    helper: "Both parties have signed. Lease is in effect.",
    icon: ShieldCheck,
  },
  expired: {
    variant: "destructive",
    label: "Expired",
    helper: "Lease term has ended.",
    icon: ClockAlert,
  },
  terminated: {
    variant: "destructive",
    label: "Terminated",
    helper: "Ended early by mutual agreement or eviction.",
    icon: ClockAlert,
  },
  renewed: {
    variant: "info",
    label: "Renewed",
    helper: "Replaced by a renewal lease.",
    icon: ShieldCheck,
  },
}

/**
 * Manager view of a single lease — full terms, both signature blocks,
 * and a sign-as-manager flow when the lease is still in draft.
 */
export default function ManagerLeaseDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const [lease, setLease] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [signature, setSignature] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [signing, setSigning] = useState(false)
  const [signError, setSignError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const l = await getLease(id)
        if (cancelled) return
        setLease(l)
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (id) load()
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (lease?.status === "draft") {
      setSignature((s) => s || user?.name || "")
    }
  }, [lease?.status, user?.name])

  async function handleSign(e) {
    e.preventDefault()
    if (!agreed || signature.trim().length < 2) return
    setSigning(true)
    setSignError(null)
    try {
      const updated = await signLease(lease.lease_id, signature.trim())
      setLease(updated)
      toast.success(
        "Lease signed",
        "Tenant has been notified to counter-sign.",
      )
    } catch (err) {
      setSignError(err)
      toast.error("Couldn't sign", err.message || "Try again.")
    } finally {
      setSigning(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="h-32 w-full animate-pulse rounded bg-muted" />
        <div className="h-64 w-full animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link to="/manager/tenants">
            <ArrowLeft /> Back to tenants
          </Link>
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>
            {error.status === 404
              ? "Lease not found"
              : "Couldn't load this lease"}
          </AlertTitle>
          <AlertDescription>
            {error.status === 404
              ? "It may have been removed, or the link is incorrect."
              : error.message}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!lease) return null

  const meta = STATUS_META[lease.status] || STATUS_META.draft
  const StatusIcon = meta.icon

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/manager/tenants">
          <ArrowLeft /> Back to tenants
        </Link>
      </Button>

      <PageHeader
        eyebrow="Lease"
        title={`${lease.property?.name || "Lease"} • Unit ${
          lease.unit?.unit_number || "—"
        }`}
        description={
          lease.property
            ? `${lease.property.address}, ${lease.property.city}, ${lease.property.state}`
            : ""
        }
        actions={
          <Badge variant={meta.variant} className="gap-1">
            <StatusIcon className="size-3.5" />
            {meta.label}
          </Badge>
        }
      />

      <Alert>
        <StatusIcon className="size-4" />
        <AlertTitle>{titleCase(lease.status)}</AlertTitle>
        <AlertDescription>{meta.helper}</AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-4 text-muted-foreground" />
              Terms
            </CardTitle>
            <CardDescription>
              Money and dates baked into this agreement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KV label="Start date" value={formatDate(lease.start_date)} />
              <KV label="End date" value={formatDate(lease.end_date)} />
              <KV
                label="Monthly rent"
                value={formatCurrency(lease.monthly_rent)}
              />
              <KV
                label="Deposit"
                value={formatCurrency(lease.security_deposit)}
              />
            </div>
            <Separator />
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Lease text
              </div>
              <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-mono text-xs">
                {lease.terms || "Standard 12-month residential lease."}
              </pre>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="size-4 text-muted-foreground" />
              Tenant
            </CardTitle>
            <CardDescription>Renter on this lease.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="font-medium">{lease.tenant?.name || "—"}</div>
            {lease.tenant?.email && (
              <a
                href={`mailto:${lease.tenant.email}`}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <Mail className="size-4" /> {lease.tenant.email}
              </a>
            )}
            {lease.tenant?.phone && (
              <a
                href={`tel:${lease.tenant.phone}`}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <Phone className="size-4" /> {lease.tenant.phone}
              </a>
            )}
            <Separator />
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex items-center gap-2">
                <Building2 className="size-3.5" /> {lease.property?.name}
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="size-3.5" /> Unit{" "}
                {lease.unit?.unit_number || "—"}
              </div>
              <div className="flex items-center gap-2">
                <Wallet className="size-3.5" />{" "}
                {formatCurrency(lease.monthly_rent)} / month
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Signatures */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="size-4 text-muted-foreground" />
            Signatures
          </CardTitle>
          <CardDescription>
            Both parties must sign for the lease to take effect.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <SignatureBlock
              role="Manager"
              name={lease.manager?.name || user?.name}
              signature={lease.manager_signature}
              signedAt={lease.manager_signed_at}
            />
            <SignatureBlock
              role="Tenant"
              name={lease.tenant?.name}
              signature={lease.tenant_signature}
              signedAt={lease.tenant_signed_at}
            />
          </div>

          {lease.status === "draft" && (
            <form onSubmit={handleSign} className="space-y-4 rounded-md border bg-muted/30 p-4">
              <div className="space-y-1">
                <h3 className="font-medium">Counter-sign as manager</h3>
                <p className="text-xs text-muted-foreground">
                  Once you sign, the tenant gets a notification to add their
                  signature.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mgr-sig" className="flex items-center gap-1.5">
                  <PenLine className="size-3.5" /> Type your signature
                </Label>
                <Input
                  id="mgr-sig"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="Your full name"
                  className="font-serif italic"
                />
              </div>
              <label className="flex items-start gap-2 rounded-md border border-dashed bg-background p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  <span className="font-medium">I confirm</span> the terms
                  above and intend my typed name to act as my legal
                  signature on this lease.
                </span>
              </label>
              {signError && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertTitle>Couldn&apos;t sign</AlertTitle>
                  <AlertDescription>
                    {signError.message || "Try again."}
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={
                    !agreed || signature.trim().length < 2 || signing
                  }
                >
                  {signing ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                  Sign &amp; send to tenant
                </Button>
              </div>
            </form>
          )}

          {lease.status === "pending_tenant" && (
            <Alert>
              <Hourglass className="size-4" />
              <AlertTitle>Waiting on the tenant</AlertTitle>
              <AlertDescription>
                {lease.tenant?.name || "The tenant"} has been notified.
                You&apos;ll see this lease flip to active once they sign.
              </AlertDescription>
            </Alert>
          )}

          {lease.status === "active" && (
            <Alert>
              <ShieldCheck className="size-4" />
              <AlertTitle>Lease active</AlertTitle>
              <AlertDescription>
                Both signatures captured. The first rent invoice has been
                generated for {lease.tenant?.name || "the tenant"}.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SignatureBlock({ role, name, signature, signedAt }) {
  const signed = !!signature
  return (
    <div
      className={
        "rounded-md border p-4 " +
        (signed ? "border-emerald-200 bg-emerald-50/50" : "bg-muted/30")
      }
    >
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {role}
        </div>
        {signed ? (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="size-3" /> Signed
          </Badge>
        ) : (
          <Badge variant="muted" className="gap-1">
            <Hourglass className="size-3" /> Pending
          </Badge>
        )}
      </div>
      <div className="mt-3 min-h-12 border-b border-dashed pb-1">
        {signed ? (
          <span className="font-serif text-2xl italic text-foreground">
            {signature}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            (awaiting signature)
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{name || "—"}</span>
        <span>{signed && signedAt ? formatDateTime(signedAt) : ""}</span>
      </div>
    </div>
  )
}

function KV({ label, value }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium">{value ?? "—"}</div>
    </div>
  )
}
