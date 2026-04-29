import { Link, NavLink } from "react-router-dom"
import { Building2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { NAV_BY_ROLE } from "@/components/layout/nav-config"

/**
 * Role-aware vertical navigation. Used by the desktop sidebar and the
 * mobile off-canvas sheet — both render the same items.
 *
 * `onNavigate` lets the mobile sheet close itself when a link is clicked.
 */
export function SidebarNav({ role, onNavigate }) {
  const sections = NAV_BY_ROLE[role] || []

  return (
    <nav className="flex flex-col gap-6">
      {sections.map((section) => (
        <div key={section.label} className="flex flex-col gap-1">
          <div className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {section.label}
          </div>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === "/"}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                        isActive && "bg-accent text-foreground",
                      )
                    }
                  >
                    {Icon ? <Icon className="size-4 shrink-0" /> : null}
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/**
 * Brand block — used at the top of the sidebar (and reused in the mobile sheet).
 */
export function SidebarBrand({ onNavigate }) {
  return (
    <Link
      to="/"
      onClick={onNavigate}
      className="flex items-center gap-2 px-2 py-1 font-semibold"
    >
      <div className="size-8 rounded-md bg-primary grid place-items-center text-primary-foreground">
        <Building2 className="size-4" />
      </div>
      <span className="text-base">EazyLiving</span>
    </Link>
  )
}

/**
 * Persistent desktop sidebar. Hidden under `md` — the AppShell exposes
 * a hamburger that opens the same nav inside a Sheet on mobile.
 */
export function Sidebar({ role }) {
  return (
    <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:border-r md:bg-background">
      <div className="flex h-14 items-center border-b px-4">
        <SidebarBrand />
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <SidebarNav role={role} />
      </div>
    </aside>
  )
}
