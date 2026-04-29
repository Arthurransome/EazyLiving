import { useMemo, useState } from "react"
import {
  AlertCircle,
  BellOff,
  CheckCheck,
  CircleDot,
  Hammer,
  Inbox,
  RefreshCw,
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
import { PageHeader } from "@/components/shared/PageHeader"

import { useNotifications } from "@/hooks/useNotifications"
import { useToast } from "@/contexts/ToastContext"
import { formatDateTime, relativeDays } from "@/lib/format"
import { cn } from "@/lib/utils"

const TABS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "read", label: "Read" },
]

// Map known event_type values to a friendly label + icon. Anything we
// don't know about falls back to a default — this keeps us resilient to
// new event types added on the backend without code changes here.
const EVENT_META = {
  payment_received: {
    label: "Payment received",
    icon: Wallet,
    accent: "text-emerald-600",
  },
  payment_overdue: {
    label: "Payment overdue",
    icon: AlertCircle,
    accent: "text-destructive",
  },
  maintenance_status_changed: {
    label: "Maintenance update",
    icon: Hammer,
    accent: "text-amber-600",
  },
  maintenance_submitted: {
    label: "New maintenance request",
    icon: Hammer,
    accent: "text-blue-600",
  },
  lease_expiring: {
    label: "Lease expiring",
    icon: CircleDot,
    accent: "text-amber-600",
  },
}

function metaFor(eventType) {
  return (
    EVENT_META[eventType] || {
      label: String(eventType || "Notification")
        .replaceAll("_", " ")
        .replace(/^./, (c) => c.toUpperCase()),
      icon: Inbox,
      accent: "text-muted-foreground",
    }
  )
}

export default function NotificationsPage() {
  const { notifications, unreadCount, loading, error, refresh, markRead, markAllRead } =
    useNotifications({ pollMs: 60_000 })
  const toast = useToast()
  const [tab, setTab] = useState("all")

  const filtered = useMemo(() => {
    const sorted = [...notifications].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at),
    )
    if (tab === "unread") return sorted.filter((n) => !n.is_read)
    if (tab === "read") return sorted.filter((n) => n.is_read)
    return sorted
  }, [notifications, tab])

  async function handleMarkAll() {
    if (unreadCount === 0) return
    await markAllRead()
    toast.success(
      `Marked ${unreadCount} notification${unreadCount === 1 ? "" : "s"} as read.`,
    )
  }

  async function handleRefresh() {
    await refresh()
    toast.info("Notifications refreshed.")
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description={
          unreadCount
            ? `You have ${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}.`
            : "You're all caught up."
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw /> Refresh
            </Button>
            <Button
              size="sm"
              onClick={handleMarkAll}
              disabled={unreadCount === 0}
            >
              <CheckCheck /> Mark all read
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Couldn&apos;t load your notifications</AlertTitle>
          <AlertDescription>
            {error.message || "Please try refreshing the page."}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="space-y-3">
          <div>
            <CardTitle>All activity</CardTitle>
            <CardDescription>
              Updates from your leases, payments, and maintenance requests —
              wired through the backend Observer pattern.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 rounded-md bg-muted p-1 w-fit">
            {TABS.map((t) => {
              const count =
                t.id === "unread"
                  ? unreadCount
                  : t.id === "read"
                    ? notifications.length - unreadCount
                    : notifications.length
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "rounded-sm px-3 py-1 text-sm font-medium transition-colors",
                    tab === t.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                  {!loading && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 w-full animate-pulse rounded bg-muted"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            <ul className="divide-y">
              {filtered.map((n) => {
                const meta = metaFor(n.event_type)
                const Icon = meta.icon
                return (
                  <li
                    key={n.notification_id}
                    className={cn(
                      "flex items-start gap-3 px-5 py-4 transition-colors",
                      !n.is_read && "bg-accent/40",
                    )}
                  >
                    <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted">
                      <Icon className={cn("size-4", meta.accent)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{meta.label}</span>
                        {!n.is_read && (
                          <Badge variant="info" className="shrink-0">
                            New
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {n.message}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{relativeDays(n.created_at)}</span>
                        <span aria-hidden>•</span>
                        <span>{formatDateTime(n.created_at)}</span>
                      </div>
                    </div>
                    {!n.is_read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        onClick={() => markRead(n.notification_id)}
                      >
                        Mark read
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function EmptyState({ tab }) {
  const messages = {
    all: "No notifications yet — you'll see updates here as activity happens on your account.",
    unread: "No unread notifications. You're all caught up.",
    read: "Nothing read yet.",
  }
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <BellOff className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground max-w-sm">
        {messages[tab]}
      </p>
    </div>
  )
}
