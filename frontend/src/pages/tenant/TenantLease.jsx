import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarDays,
  Download,
  FileText,
  Mail,
  Phone,
  ReceiptText,
  ShieldCheck,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { PageHeader } from "@/components/shared/PageHeader"

import { listLeases } from "@/api/leases"
import { listPayments } from "@/api/payments"
import {
  formatCurrency,
  formatDate,
  daysFromNow,
  titleCase,
} from "@/lib/format"
import { cn } from "@/lib/utils"

const STATUS_BADGE = {
  active: "success",
  draft: "muted",
  expiring_soon: "warning",
  expired: "destructive",
  renewed: "info",
  terminated: "destructive",
}

/**
 * Tenant lease detail page. Pulls the user's lease (the API already
 * scopes /leases to the current tenant) plus their recent paid invoices
 * to surface receipts.
 */
export default function TenantLease() {
  const [lease, setLease] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [leases, pays] = await Promise.all([
          listLeases(),
          listPayments(),
        ])
        if (cancelled) return
        const active =
          leases.find((l) => l.status === "active") || leases[0] || null
        setLease(active)
        setPayments(pays)
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const termInfo = useMemo(() => {
    if (!lease) return null
    const start = new Date(lease.start_date).getTime()
    const end = new Date(lease.end_date).getTime()
    const today = Date.now()
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null
    const total = end - start
    const elapsed = Math.max(0, Math.min(today - start, total))
    return {
      pct: Math.round((elapsed / total) * 100),
      daysLeft: daysFromNow(lease.end_date),
      totalDays: Math.round(total / 86_400_000),
    }
  }, [lease])

  const paidReceipts = useMemo(
    () =>
      payments
        .filter((p) => p.status === "paid" && p.receipt_ref)
        .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date))
        .slice(0, 5),
    [payments],
  )

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Tenant"
        title="My Lease"
        description="Your current lease, term progress, and lease documents."
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Couldn&apos;t load your lease</AlertTitle>
          <AlertDescription>
            {error.message || "Please try refreshing the page."}
          </AlertDescription>
        </Alert>
      )}

      {!loading && !lease && !error && <NoLeaseCard />}

      {(loading || lease) && (
        <>
          {/* Top: summary + term progress */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="size-4 text-muted-foreground" />
                    {loading
                      ? "Loading…"
                      : lease?.property?.name || "Your residence"}
                  </CardTitle>
                  <CardDescription>
                    {loading ? (
                      <span className="inline-block h-4 w-40 animate-pulse rounded bg-muted" />
                    ) : lease?.property ? (
                      <>
                        {lease.property.address}, {lease.property.city},{" "}
                        {lease.property.state} {lease.property.zip_code}
                      </>
                    ) : (
                      "—"
                    )}
                  </CardDescription>
                </div>
                {lease && (
                  <Badge variant={STATUS_BADGE[lease.status] || "secondary"}>
                    {titleCase(lease.status)}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <KV
                    label="Unit"
                    value={lease?.unit?.unit_number || "—"}
                    loading={loading}
                  />
                  <KV
                    label="Bedrooms"
                    value={lease?.unit?.bedrooms ?? "—"}
                    loading={loading}
                  />
                  <KV
                    label="Bathrooms"
                    value={lease?.unit?.bathrooms ?? "—"}
                    loading={loading}
                  />
                  <KV
                    label="Square feet"
                    value={lease?.unit?.square_feet ?? "—"}
                    loading={loading}
                  />
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <KV
                    label="Start date"
                    value={lease ? formatDate(lease.start_date) : "—"}
                    loading={loading}
                  />
                  <KV
                    label="End date"
                    value={lease ? formatDate(lease.end_date) : "—"}
                    loading={loading}
                  />
                  <KV
                    label="Monthly rent"
                    value={
                      lease ? formatCurrency(lease.monthly_rent) : "—"
                    }
                    loading={loading}
                  />
                  <KV
                    label="Security deposit"
                    value={
                      lease ? formatCurrency(lease.security_deposit) : "—"
                    }
                    loading={loading}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-muted-foreground" />
                  Term progress
                </CardTitle>
                <CardDescription>How far you are into your lease</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading || !termInfo ? (
                  <div className="space-y-2">
                    <div className="h-2 w-full animate-pulse rounded bg-muted" />
                    <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{termInfo.pct}% elapsed</span>
                        <span className="text-muted-foreground">
                          {termInfo.totalDays} day term
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${termInfo.pct}%` }}
                        />
                      </div>
                    </div>
                    <p
                      className={cn(
                        "text-sm",
                        termInfo.daysLeft != null && termInfo.daysLeft < 30
                          ? "text-amber-700"
                          : "text-muted-foreground",
                      )}
                    >
                      {termInfo.daysLeft > 0
                        ? `${termInfo.daysLeft} days remaining (ends ${formatDate(lease.end_date)})`
                        : termInfo.daysLeft === 0
                          ? "Your lease ends today."
                          : `Lease ended ${Math.abs(termInfo.daysLeft)} days ago.`}
                    </p>
                    {termInfo.daysLeft != null && termInfo.daysLeft <= 60 && termInfo.daysLeft > 0 && (
                      <Alert>
                        <ShieldCheck className="size-4" />
                        <AlertTitle>Renewal window open</AlertTitle>
                        <AlertDescription>
                          Reach out to your property manager to discuss a
                          renewal.
                        </AlertDescription>
                      </Alert>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                Documents
              </CardTitle>
              <CardDescription>
                Lease paperwork and supporting files. Keep copies for your
                records.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-14 w-full animate-pulse rounded-md bg-muted"
                    />
                  ))}
                </div>
              ) : (
                <DocumentList lease={lease} />
              )}
            </CardContent>
          </Card>

          {/* Bottom row: tenant info + receipts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="size-4 text-muted-foreground" />
                  Tenant on file
                </CardTitle>
                <CardDescription>
                  Make sure your contact info is current.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <div className="space-y-2">
                    <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-56 animate-pulse rounded bg-muted" />
                  </div>
                ) : lease?.tenant ? (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="size-4 text-muted-foreground" />
                      <a
                        href={`mailto:${lease.tenant.email}`}
                        className="hover:underline"
                      >
                        {lease.tenant.email}
                      </a>
                    </div>
                    {lease.tenant.phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="size-4 text-muted-foreground" />
                        <a
                          href={`tel:${lease.tenant.phone}`}
                          className="hover:underline"
                        >
                          {lease.tenant.phone}
                        </a>
                      </div>
                    )}
                    <Button asChild variant="outline" size="sm">
                      <Link to="/profile">Update profile</Link>
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ReceiptText className="size-4 text-muted-foreground" />
                    Recent receipts
                  </CardTitle>
                  <CardDescription>
                    Your last few rent payments
                  </CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/tenant/payments">
                    All <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-10 w-full animate-pulse rounded bg-muted"
                      />
                    ))}
                  </div>
                ) : paidReceipts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No payment receipts yet.
                  </p>
                ) : (
                  <ul className="divide-y -my-3">
                    {paidReceipts.map((p) => (
                      <li
                        key={p.payment_id}
                        className="flex items-center justify-between gap-3 py-3 text-sm"
                      >
                        <div>
                          <div className="font-medium">
                            {formatCurrency(p.amount)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Paid {formatDate(p.payment_date)} •{" "}
                            {titleCase(p.method || "—")}
                          </div>
                        </div>
                        <Badge variant="success">Paid</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Builds a small set of documents for the active lease and renders a
 * "download" button per row. The lease agreement is reconstructed from
 * the lease object (the real backend would stream a stored PDF — here we
 * fake it with a text blob so the button does something useful).
 */
function DocumentList({ lease }) {
  const docs = lease
    ? [
        {
          id: "agreement",
          title: "Lease agreement",
          description: lease.document_ref
            ? `Reference: ${lease.document_ref}`
            : "Signed agreement and rental terms",
          filename: `lease-${lease.lease_id?.slice(0, 8) || "agreement"}.txt`,
          builder: () => buildLeaseSummary(lease),
        },
        {
          id: "movein",
          title: "Move-in checklist",
          description: "Condition checklist completed at move-in",
          filename: `move-in-${lease.lease_id?.slice(0, 8) || "checklist"}.txt`,
          builder: () => buildMoveInChecklist(lease),
        },
        {
          id: "rules",
          title: "House rules & addendum",
          description: "Building policies and lease addendum",
          filename: "house-rules.txt",
          builder: () => buildHouseRules(lease),
        },
      ]
    : []

  if (!docs.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No documents available yet.
      </p>
    )
  }

  return (
    <ul className="divide-y -my-3">
      {docs.map((doc) => (
        <li
          key={doc.id}
          className="flex items-center justify-between gap-3 py-3"
        >
          <div className="min-w-0">
            <div className="font-medium">{doc.title}</div>
            <div className="text-xs text-muted-foreground">
              {doc.description}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadText(doc.filename, doc.builder())}
          >
            <Download /> Download
          </Button>
        </li>
      ))}
    </ul>
  )
}

function NoLeaseCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No active lease</CardTitle>
        <CardDescription>
          We couldn&apos;t find a lease attached to your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          If you believe this is a mistake, please contact your property
          manager. Once your lease is active you&apos;ll see the term, rent,
          and document downloads here.
        </p>
      </CardContent>
    </Card>
  )
}

function KV({ label, value, loading }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {loading ? (
        <div className="h-5 w-20 animate-pulse rounded bg-muted" />
      ) : (
        <div className="text-sm font-medium">{value ?? "—"}</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mocked document content + download
// ---------------------------------------------------------------------------
function buildLeaseSummary(lease) {
  const lines = [
    "EAZYLIVING — RESIDENTIAL LEASE AGREEMENT (SUMMARY)",
    "===================================================",
    "",
    `Lease ID:           ${lease.lease_id}`,
    `Status:             ${titleCase(lease.status)}`,
    "",
    "PROPERTY",
    `  Name:             ${lease.property?.name || "—"}`,
    `  Address:          ${
      lease.property
        ? `${lease.property.address}, ${lease.property.city}, ${lease.property.state} ${lease.property.zip_code}`
        : "—"
    }`,
    `  Unit:             ${lease.unit?.unit_number || "—"}`,
    "",
    "TENANT",
    `  Name:             ${lease.tenant?.name || "—"}`,
    `  Email:            ${lease.tenant?.email || "—"}`,
    `  Phone:            ${lease.tenant?.phone || "—"}`,
    "",
    "TERMS",
    `  Start date:       ${formatDate(lease.start_date)}`,
    `  End date:         ${formatDate(lease.end_date)}`,
    `  Monthly rent:     ${formatCurrency(lease.monthly_rent)}`,
    `  Security deposit: ${formatCurrency(lease.security_deposit)}`,
    "",
    `Document reference: ${lease.document_ref || "—"}`,
  ]
  return lines.join("\n")
}

function buildMoveInChecklist(lease) {
  return [
    "EAZYLIVING — MOVE-IN CONDITION CHECKLIST",
    "==========================================",
    "",
    `Unit:    ${lease.property?.name || "—"} • ${lease.unit?.unit_number || "—"}`,
    `Tenant:  ${lease.tenant?.name || "—"}`,
    `Date:    ${formatDate(lease.start_date)}`,
    "",
    "[ ] Walls & paint                 — condition: __________",
    "[ ] Flooring                      — condition: __________",
    "[ ] Windows & screens             — condition: __________",
    "[ ] Appliances (fridge, stove)    — condition: __________",
    "[ ] Plumbing fixtures             — condition: __________",
    "[ ] Smoke / CO detectors          — tested: __________",
    "[ ] Locks & keys received         — count:    __________",
    "",
    "Notes:",
    "________________________________________________________",
  ].join("\n")
}

function buildHouseRules() {
  return [
    "EAZYLIVING — HOUSE RULES & ADDENDUM",
    "=====================================",
    "",
    "1. Quiet hours are 10:00 PM – 7:00 AM daily.",
    "2. No smoking inside the unit or common areas.",
    "3. Pets are allowed with prior written approval and pet deposit.",
    "4. Trash and recycling must be sorted per building signage.",
    "5. Maintenance requests should be submitted via the EazyLiving app.",
    "6. Subletting is not permitted without manager approval.",
    "",
    "By signing the lease agreement, the tenant acknowledges these rules.",
  ].join("\n")
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Defer revocation to give the browser time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
