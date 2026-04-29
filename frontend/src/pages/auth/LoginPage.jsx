import { useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { AlertCircle, Building2, Loader2 } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth, landingPathFor } from "@/contexts/AuthContext"

const DEMO_ACCOUNTS = [
  { role: "Tenant", email: "tenant@eazy.com", password: "password" },
  { role: "Manager", email: "manager@eazy.com", password: "password" },
  { role: "Owner", email: "owner@eazy.com", password: "password" },
]

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // If a ProtectedRoute redirected us here, return the user to where they
  // were trying to go after login. Otherwise pick a sensible landing route.
  const intended = location.state?.from?.pathname

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const user = await login({ email, password })
      navigate(intended || landingPathFor(user), { replace: true })
    } catch (err) {
      setError(err.message || "Could not sign in.")
    } finally {
      setSubmitting(false)
    }
  }

  function fillDemo(account) {
    setEmail(account.email)
    setPassword(account.password)
    setError(null)
  }

  return (
    <div className="min-h-screen grid place-items-center bg-muted/40 p-6">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="size-9 rounded-md bg-primary grid place-items-center text-primary-foreground">
            <Building2 className="size-5" />
          </div>
          <span className="text-xl font-semibold tracking-tight">EazyLiving</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>
              Sign in to manage your properties, leases, and rent.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit} noValidate>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>Sign in failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3 items-stretch">
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting && <Loader2 className="animate-spin" />}
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                Don't have an account?{" "}
                <Link to="/register" className="text-primary hover:underline">
                  Create one
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
