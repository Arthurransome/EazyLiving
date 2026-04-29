import {
  Bell,
  Building2,
  ClipboardList,
  CreditCard,
  Hammer,
  Home,
  KeyRound,
  LayoutDashboard,
  UserCircle,
  Wallet,
  Wrench,
} from "lucide-react"

/**
 * Role -> nav structure. Keep all nav metadata in one file so the sidebar,
 * mobile sheet, and breadcrumb resolver share the same source of truth.
 *
 * Each section has a label and an array of items: { to, label, icon }.
 */
export const NAV_BY_ROLE = {
  tenant: [
    {
      label: "Home",
      items: [
        { to: "/tenant/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/tenant/lease", label: "My Lease", icon: KeyRound },
        { to: "/tenant/payments", label: "Payments", icon: CreditCard },
        { to: "/tenant/maintenance", label: "Maintenance", icon: Wrench },
      ],
    },
    {
      label: "Account",
      items: [
        { to: "/notifications", label: "Notifications", icon: Bell },
        { to: "/profile", label: "Profile", icon: UserCircle },
      ],
    },
  ],
  manager: [
    {
      label: "Operations",
      items: [
        { to: "/manager/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/manager/properties", label: "Properties", icon: Building2 },
        { to: "/manager/maintenance", label: "Maintenance", icon: Hammer },
      ],
    },
    {
      label: "Account",
      items: [
        { to: "/notifications", label: "Notifications", icon: Bell },
        { to: "/profile", label: "Profile", icon: UserCircle },
      ],
    },
  ],
  owner: [
    {
      label: "Portfolio",
      items: [
        { to: "/owner/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/owner/properties", label: "Properties", icon: Home },
      ],
    },
    {
      label: "Account",
      items: [
        { to: "/notifications", label: "Notifications", icon: Bell },
        { to: "/profile", label: "Profile", icon: UserCircle },
      ],
    },
  ],
  admin: [
    {
      label: "Operations",
      items: [
        { to: "/manager/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/manager/properties", label: "Properties", icon: Building2 },
        { to: "/manager/maintenance", label: "Maintenance", icon: ClipboardList },
      ],
    },
    {
      label: "Account",
      items: [
        { to: "/notifications", label: "Notifications", icon: Bell },
        { to: "/profile", label: "Profile", icon: UserCircle },
      ],
    },
  ],
}

/**
 * Walk the role-specific nav and return the label of the item whose `to`
 * matches the current pathname (or starts with it). Returns null if no match.
 */
export function findNavLabel(role, pathname) {
  const sections = NAV_BY_ROLE[role] || []
  for (const section of sections) {
    for (const item of section.items) {
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
        return item.label
      }
    }
  }
  return null
}

// Stable mapping of role -> friendly label used in the topbar pill.
export const ROLE_LABEL = {
  tenant: "Tenant",
  manager: "Property Manager",
  owner: "Property Owner",
  admin: "Administrator",
}
