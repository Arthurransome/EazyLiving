import { Link, NavLink, Outlet, useNavigate } from "react-router-dom"
import { Building2, LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/AuthContext"
import { cn } from "@/lib/utils"

/**
 * Temporary authenticated shell.
 *
 * Lays out a topbar with a role-filtered nav + the current user + sign out.
 * Replaced by the full sidebar version in Task #5.
 */

const NAV_BY_ROLE = {
  tenant: [
    { to: "/tenant/dashboard", label: "Dashboard" },
    { to: "/tenant/lease", label: "My Lease" },
    { to: "/tenant/payments", label: "Payments" },
    { to: "/tenant/maintenance", label: "Maintenance" },
    { to: "/notifications", label: "Notifications" },
  ],
  manager: [
    { to: "/manager/dashboard", label: "Dashboard" },
    { to: "/manager/properties", label: "Properties" },
    { to: "/manager/maintenance", label: "Maintenance" },
    { to: "/notifications", label: "Notifications" },
  ],
  owner: [
    { to: "/owner/dashboard", label: "Dashboard" },
    { to: "/owner/properties", label: "Portfolio" },
    { to: "/notifications", label: "Notifications" },
  ],
  admin: [
    { to: "/manager/dashboard", label: "Dashboard" },
    { to: "/manager/properties", label: "Properties" },
    { to: "/manager/maintenance", label: "Maintenance" },
    { to: "/notifications", label: "Notifications" },
  ],
}

export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const navItems = NAV_BY_ROLE[user?.role] || []

  async function handleSignOut() {
    await logout()
    navigate("/login", { replace: true })
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/40">
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="flex h-14 items-center gap-6 px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <div className="size-7 rounded-md bg-primary grid place-items-center text-primary-foreground">
              <Building2 className="size-4" />
            </div>
            EazyLiving
          </Link>
          <nav className="flex items-center gap-1 text-sm overflow-x-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors whitespace-nowrap",
                    isActive && "bg-accent text-foreground",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {user && (
              <Link
                to="/profile"
                className="flex items-center gap-2 text-sm hover:bg-accent rounded-md px-2 py-1 transition-colors"
              >
                <div className="size-7 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-semibold">
                  {(user.name || user.email).slice(0, 1).toUpperCase()}
                </div>
                <div className="leading-tight text-left">
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {user.role}
                  </div>
                </div>
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
