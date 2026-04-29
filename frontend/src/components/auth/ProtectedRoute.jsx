import { Loader2 } from "lucide-react"
import { Navigate, Outlet, useLocation } from "react-router-dom"

import { AuthStatus, useAuth, landingPathFor } from "@/contexts/AuthContext"

function FullPageSpinner({ label = "Loading…" }) {
  return (
    <div className="min-h-screen grid place-items-center bg-muted/40">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-sm">{label}</p>
      </div>
    </div>
  )
}

/**
 * Wraps routes that require authentication.
 *
 * Behavior:
 *   - while the auth status is "loading", render a full-page spinner so we
 *     don't flash the login page on hard refresh of a deep link
 *   - if unauthenticated, redirect to /login and remember the requested URL
 *     in router state so we can return there post-login
 *   - if authenticated but the user's role is not in `allowedRoles`,
 *     redirect to /forbidden
 *   - otherwise render the nested route
 */
export function ProtectedRoute({ allowedRoles }) {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === AuthStatus.LOADING) {
    return <FullPageSpinner />
  }
  if (status !== AuthStatus.AUTHENTICATED) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/forbidden" replace />
  }
  return <Outlet />
}

/**
 * Wraps /login and /register so a signed-in user gets bounced to their
 * landing page instead of seeing the auth forms again.
 */
export function PublicOnlyRoute() {
  const { status, user } = useAuth()
  if (status === AuthStatus.LOADING) {
    return <FullPageSpinner />
  }
  if (status === AuthStatus.AUTHENTICATED) {
    return <Navigate to={landingPathFor(user)} replace />
  }
  return <Outlet />
}
