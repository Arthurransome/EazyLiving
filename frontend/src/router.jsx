import { Navigate, Route, Routes } from "react-router-dom"

import { AppShell } from "@/components/layout/AppShell"
import { ProtectedRoute, PublicOnlyRoute } from "@/components/auth/ProtectedRoute"
import { useAuth, AuthStatus, landingPathFor } from "@/contexts/AuthContext"

import LoginPage from "@/pages/auth/LoginPage"
import RegisterPage from "@/pages/auth/RegisterPage"

import TenantDashboard from "@/pages/tenant/TenantDashboard"
import TenantLease from "@/pages/tenant/TenantLease"
import TenantPayments from "@/pages/tenant/TenantPayments"
import TenantMaintenance from "@/pages/tenant/TenantMaintenance"

import ManagerDashboard from "@/pages/manager/ManagerDashboard"
import ManagerProperties from "@/pages/manager/ManagerProperties"
import ManagerMaintenance from "@/pages/manager/ManagerMaintenance"

import OwnerDashboard from "@/pages/owner/OwnerDashboard"
import OwnerProperties from "@/pages/owner/OwnerProperties"

import NotificationsPage from "@/pages/shared/NotificationsPage"
import ProfilePage from "@/pages/shared/ProfilePage"

import NotFound from "@/pages/NotFound"
import Forbidden from "@/pages/Forbidden"

/**
 * Sends "/" to the right place based on auth state.
 * - Loading       -> render nothing (auth provider also paints a spinner on
 *                    protected routes; index hits are rare in practice)
 * - Authenticated -> role-aware landing
 * - Unauthed      -> /login
 */
function RootRedirect() {
  const { status, user } = useAuth()
  if (status === AuthStatus.LOADING) return null
  if (status === AuthStatus.AUTHENTICATED) {
    return <Navigate to={landingPathFor(user)} replace />
  }
  return <Navigate to="/login" replace />
}

export function AppRouter() {
  return (
    <Routes>
      <Route index element={<RootRedirect />} />

      {/* Auth pages — bounce away if already signed in */}
      <Route element={<PublicOnlyRoute />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
      </Route>

      {/* Authenticated pages — wrapped in AppShell */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="profile" element={<ProfilePage />} />
          <Route path="notifications" element={<NotificationsPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["tenant"]} />}>
        <Route element={<AppShell />}>
          <Route path="tenant">
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<TenantDashboard />} />
            <Route path="lease" element={<TenantLease />} />
            <Route path="payments" element={<TenantPayments />} />
            <Route path="maintenance" element={<TenantMaintenance />} />
          </Route>
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["manager", "admin"]} />}>
        <Route element={<AppShell />}>
          <Route path="manager">
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<ManagerDashboard />} />
            <Route path="properties" element={<ManagerProperties />} />
            <Route path="maintenance" element={<ManagerMaintenance />} />
          </Route>
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["owner", "admin"]} />}>
        <Route element={<AppShell />}>
          <Route path="owner">
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<OwnerDashboard />} />
            <Route path="properties" element={<OwnerProperties />} />
          </Route>
        </Route>
      </Route>

      {/* Standalone error pages — no shell, no auth required */}
      <Route path="forbidden" element={<Forbidden />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
