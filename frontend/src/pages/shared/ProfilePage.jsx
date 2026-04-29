import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  LogOut,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react"
import { useNavigate } from "react-router-dom"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PageHeader } from "@/components/shared/PageHeader"

import { useAuth } from "@/contexts/AuthContext"
import { useToast } from "@/contexts/ToastContext"
import { updateUser } from "@/api/users"
import { formatDate, titleCase } from "@/lib/format"

const ROLE_DESCRIPTIONS = {
  tenant: "You can view your lease, pay rent, and submit maintenance requests.",
  manager:
    "You can manage properties, units, leases, and the maintenance queue across the portfolio.",
  owner:
    "You can review portfolio performance and see every lease, payment, and request on your buildings.",
  admin: "Full access — you can see and edit everything.",
}

function initials(name) {
  if (!name) return "?"
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("")
}

export default function ProfilePage() {
  const { user, refreshUser, logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [signingOut, setSigningOut] = useState(false)

  // Hydrate the form from the current user. We re-sync any time the
  // user object changes (e.g. after a successful save).
  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || "",
        email: user.email || "",
        phone: user.phone || "",
      })
    }
  }, [user])

  const dirty = useMemo(() => {
    if (!user) return false
    return (
      form.name.trim() !== (user.name || "") ||
      form.email.trim() !== (user.email || "") ||
      (form.phone || "").trim() !== (user.phone || "")
    )
  }, [form, user])

  const canSubmit =
    dirty &&
    form.name.trim().length > 0 &&
    form.email.trim().length > 0 &&
    !submitting

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit || !user) return
    setSubmitting(true)
    setError(null)
    try {
      await updateUser(user.user_id, {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
      })
      await refreshUser()
      toast.success("Profile updated", "Your changes are live.")
    } catch (err) {
      setError(err)
      toast.error("Couldn't save profile", err.message || "Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await logout()
      toast.info("Signed out")
      navigate("/login", { replace: true })
    } catch (err) {
      toast.error("Couldn't sign out", err.message || "Please try again.")
      setSigningOut(false)
    }
  }

  if (!user) return null

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Account"
        title="Profile & settings"
        description="Update your contact info and review your account."
      />

      <Card>
        <CardHeader className="flex-row items-start gap-4 space-y-0">
          <Avatar className="size-14">
            <AvatarFallback className="text-lg">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="truncate">{user.name}</CardTitle>
              <Badge variant="info" className="capitalize">
                {user.role}
              </Badge>
              {user.is_active && (
                <Badge variant="success">
                  <CheckCircle2 className="size-3" /> Active
                </Badge>
              )}
            </div>
            <CardDescription className="mt-1">
              {ROLE_DESCRIPTIONS[user.role] || "Welcome to EazyLiving."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <KV icon={Mail} label="Email" value={user.email} />
          <KV
            icon={Phone}
            label="Phone"
            value={user.phone || "Not provided"}
          />
          <KV
            icon={ShieldCheck}
            label="Role"
            value={titleCase(user.role)}
          />
          <KV
            icon={UserRound}
            label="Member since"
            value={formatDate(user.created_at)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Edit profile</CardTitle>
          <CardDescription>
            Changes save instantly. Email is used to sign in, so update it
            carefully.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  placeholder="+1-555-0100"
                />
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Couldn&apos;t save your profile</AlertTitle>
                <AlertDescription>
                  {error.message || "Please check the fields and try again."}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setForm({
                    name: user.name || "",
                    email: user.email || "",
                    phone: user.phone || "",
                  })
                }
                disabled={!dirty || submitting}
              >
                Discard changes
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {submitting && <Loader2 className="animate-spin" />}
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>
            Manage how you sign in and end your session.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
            Password change isn&apos;t available in this preview build.
            Contact an administrator if you need to rotate your credentials.
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium text-sm">Sign out everywhere</div>
              <p className="text-xs text-muted-foreground">
                Ends your current session and clears your access token.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? (
                <Loader2 className="animate-spin" />
              ) : (
                <LogOut />
              )}
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function KV({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 grid size-8 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="text-sm font-medium break-words">{value}</div>
      </div>
    </div>
  )
}
