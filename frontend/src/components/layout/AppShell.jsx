import { useEffect, useState } from "react"
import { Outlet, useLocation } from "react-router-dom"
import { Menu } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useAuth } from "@/contexts/AuthContext"
import {
  Sidebar,
  SidebarBrand,
  SidebarNav,
} from "@/components/layout/Sidebar"
import { NotificationsBell } from "@/components/layout/NotificationsBell"
import { UserMenu } from "@/components/layout/UserMenu"
import { findNavLabel, ROLE_LABEL } from "@/components/layout/nav-config"

/**
 * Authenticated layout shell.
 *
 * Layout:
 *   ┌──────────────┬──────────────────────────────┐
 *   │              │ topbar (mobile menu, page    │
 *   │   sidebar    │   title, bell, user menu)    │
 *   │ (md and up)  ├──────────────────────────────┤
 *   │              │ <Outlet />                   │
 *   └──────────────┴──────────────────────────────┘
 *
 * On mobile (<md) the sidebar is hidden; the hamburger button opens
 * the same nav inside a left-anchored Sheet.
 */
export function AppShell() {
  const { user } = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const role = user?.role
  const pageTitle = findNavLabel(role, location.pathname) || "EazyLiving"

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="flex min-h-screen">
        <Sidebar role={role} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background px-4 sm:px-6">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Open navigation"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <div className="flex h-14 items-center border-b px-4">
                  <SidebarBrand onNavigate={() => setMobileOpen(false)} />
                </div>
                <div className="p-3">
                  <SidebarNav
                    role={role}
                    onNavigate={() => setMobileOpen(false)}
                  />
                </div>
              </SheetContent>
            </Sheet>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold">{pageTitle}</h1>
              {role && (
                <p className="hidden text-xs text-muted-foreground sm:block">
                  {ROLE_LABEL[role] || role} workspace
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <NotificationsBell />
              <UserMenu />
            </div>
          </header>
          <main className="flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
