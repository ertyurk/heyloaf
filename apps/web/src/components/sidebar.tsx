import { Separator } from "@heyloaf/ui/components/separator"
import { cn } from "@heyloaf/ui/lib/utils"
import Bread01Icon from "@hugeicons/core-free-icons/Bread01Icon"
import Contact01Icon from "@hugeicons/core-free-icons/Contact01Icon"
import Home01Icon from "@hugeicons/core-free-icons/Home01Icon"
import Invoice01Icon from "@hugeicons/core-free-icons/Invoice01Icon"
import Logout01Icon from "@hugeicons/core-free-icons/Logout01Icon"
import Notification01Icon from "@hugeicons/core-free-icons/Notification01Icon"
import Package01Icon from "@hugeicons/core-free-icons/Package01Icon"
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon"
import ShoppingBag01Icon from "@hugeicons/core-free-icons/ShoppingBag01Icon"
import Store01Icon from "@hugeicons/core-free-icons/Store01Icon"
import Tag01Icon from "@hugeicons/core-free-icons/Tag01Icon"
import WarehouseIcon from "@hugeicons/core-free-icons/WarehouseIcon"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link, useRouterState } from "@tanstack/react-router"
import { useAuthStore } from "@/lib/auth"

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: Home01Icon },
  { label: "Products", href: "/products", icon: Package01Icon },
  { label: "Categories", href: "/categories", icon: Tag01Icon },
  { label: "Stock", href: "/stock", icon: WarehouseIcon },
  { label: "Orders", href: "/orders", icon: ShoppingBag01Icon },
  { label: "Contacts", href: "/contacts", icon: Contact01Icon },
  { label: "Invoices", href: "/invoices", icon: Invoice01Icon },
  { label: "Production", href: "/production", icon: Bread01Icon },
  { label: "Channels", href: "/channels", icon: Store01Icon },
  { label: "Notifications", href: "/notifications", icon: Notification01Icon },
]

export function AppSidebar() {
  const location = useRouterState({ select: (s) => s.location })
  const { user, company, clearAuth } = useAuthStore()

  return (
    <aside className="flex w-56 flex-col border-r bg-sidebar">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <span className="text-sm font-bold tracking-tight">{company?.name ?? "Heyloaf"}</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {navItems.map((item) => {
          const active = location.pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <HugeiconsIcon icon={item.icon} size={16} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <Separator />

      <div className="p-2">
        <Link
          to="/settings"
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 text-sm transition-colors",
            location.pathname.startsWith("/settings")
              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
        >
          <HugeiconsIcon icon={Settings01Icon} size={16} />
          Settings
        </Link>
      </div>

      <Separator />

      <div className="flex items-center justify-between p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user?.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <button
          type="button"
          onClick={clearAuth}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={Logout01Icon} size={16} />
        </button>
      </div>
    </aside>
  )
}
