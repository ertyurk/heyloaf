import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@heyloaf/ui/components/select"
import { Separator } from "@heyloaf/ui/components/separator"
import { cn } from "@heyloaf/ui/lib/utils"
import Analytics01Icon from "@hugeicons/core-free-icons/Analytics01Icon"
import ArrowDataTransferHorizontalIcon from "@hugeicons/core-free-icons/ArrowDataTransferHorizontalIcon"
import Bread01Icon from "@hugeicons/core-free-icons/Bread01Icon"
import Cash01Icon from "@hugeicons/core-free-icons/Cash01Icon"
import Contact01Icon from "@hugeicons/core-free-icons/Contact01Icon"
import Home01Icon from "@hugeicons/core-free-icons/Home01Icon"
import Invoice01Icon from "@hugeicons/core-free-icons/Invoice01Icon"
import Logout01Icon from "@hugeicons/core-free-icons/Logout01Icon"
import NoteIcon from "@hugeicons/core-free-icons/NoteIcon"
import Notification01Icon from "@hugeicons/core-free-icons/Notification01Icon"
import Package01Icon from "@hugeicons/core-free-icons/Package01Icon"
import SecurityIcon from "@hugeicons/core-free-icons/SecurityIcon"
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon"
import ShoppingBag01Icon from "@hugeicons/core-free-icons/ShoppingBag01Icon"
import Store01Icon from "@hugeicons/core-free-icons/Store01Icon"
import Tag01Icon from "@hugeicons/core-free-icons/Tag01Icon"
import Time01Icon from "@hugeicons/core-free-icons/Time01Icon"
import WarehouseIcon from "@hugeicons/core-free-icons/WarehouseIcon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Link, useRouterState } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useApi } from "@/hooks/use-api"
import { useAuthStore } from "@/lib/auth"

type NavItem = {
  labelKey: string
  href: string
  icon: typeof Home01Icon
  module: string | undefined
}

type NavGroup = {
  label: string | null
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: null,
    items: [
      { labelKey: "sidebar.dashboard", href: "/dashboard", icon: Home01Icon, module: "reports" },
    ],
  },
  {
    label: "Sales",
    items: [
      { labelKey: "sidebar.pos", href: "/pos", icon: Cash01Icon, module: "pos" },
      { labelKey: "sidebar.orders", href: "/orders", icon: ShoppingBag01Icon, module: "pos" },
      { labelKey: "sidebar.shifts", href: "/shifts", icon: Time01Icon, module: "pos" },
    ],
  },
  {
    label: "Catalog",
    items: [
      { labelKey: "sidebar.products", href: "/products", icon: Package01Icon, module: "products" },
      { labelKey: "sidebar.recipes", href: "/recipes", icon: NoteIcon, module: "products" },
      { labelKey: "sidebar.categories", href: "/categories", icon: Tag01Icon, module: "products" },
      { labelKey: "sidebar.channels", href: "/channels", icon: Store01Icon, module: "products" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { labelKey: "sidebar.stock", href: "/stock", icon: WarehouseIcon, module: "stock" },
      {
        labelKey: "sidebar.production",
        href: "/production",
        icon: Bread01Icon,
        module: "production",
      },
    ],
  },
  {
    label: "Finance",
    items: [
      { labelKey: "sidebar.contacts", href: "/contacts", icon: Contact01Icon, module: "sales" },
      { labelKey: "sidebar.invoices", href: "/invoices", icon: Invoice01Icon, module: "sales" },
      {
        labelKey: "sidebar.transactions",
        href: "/transactions",
        icon: ArrowDataTransferHorizontalIcon,
        module: "sales",
      },
    ],
  },
  {
    label: "Analytics",
    items: [
      { labelKey: "sidebar.reports", href: "/reports", icon: Analytics01Icon, module: "reports" },
      {
        labelKey: "sidebar.notifications",
        href: "/notifications",
        icon: Notification01Icon,
        module: undefined,
      },
    ],
  },
]

export function AppSidebar() {
  const { t } = useTranslation()
  const location = useRouterState({ select: (s) => s.location })
  const { user, company, companies, setAuth, clearAuth, canViewModule, isSuperAdmin } =
    useAuthStore()
  const client = useApi()

  const { data: unreadData } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: async () => {
      const { data } = await client.GET("/api/notifications/unread-count")
      return data
    },
    refetchInterval: 30_000,
  })

  const unreadCount =
    unreadData && typeof unreadData === "object" && "count" in unreadData
      ? (unreadData.count as number)
      : 0

  const switchCompany = useMutation({
    mutationFn: async (companyId: string) => {
      const { data, error } = await client.POST("/api/auth/switch-company", {
        body: { company_id: companyId },
      })
      if (error || !data) throw new Error("Failed to switch company")
      return data as { data: { access_token: string } }
    },
    onSuccess: (res, companyId) => {
      const switched = companies.find((c) => c.id === companyId)
      if (switched && user) {
        setAuth({
          token: res.data.access_token,
          user,
          company: switched,
          companies,
        })
      }
      window.location.reload()
    },
    onError: () => {
      toast.error(t("auth.failedToSwitchCompany"))
    },
  })

  const hasMultipleCompanies = companies.length > 1

  return (
    <aside className="flex w-56 flex-col border-r bg-sidebar">
      <div className="flex h-14 items-center justify-between border-b px-4">
        {hasMultipleCompanies ? (
          <Select
            value={company?.id ?? ""}
            onValueChange={(val) => {
              if (val && val !== company?.id) {
                switchCompany.mutate(val)
              }
            }}
          >
            <SelectTrigger className="h-8 w-full border-none bg-transparent px-0 text-sm font-bold tracking-tight shadow-none focus:ring-0">
              <SelectValue placeholder={t("sidebar.selectCompany")} />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm font-bold tracking-tight">{company?.name ?? "Heyloaf"}</span>
        )}
        <Link
          to="/notifications"
          className="relative shrink-0 text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={Notification01Icon} size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Link>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto p-2">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.module || canViewModule(item.module)
          )
          if (visibleItems.length === 0) return null
          return (
            <div key={group.label ?? "_top"} className="flex flex-col gap-0.5">
              {group.label && (
                <span className="px-3 pt-4 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  {group.label}
                </span>
              )}
              {visibleItems.map((item) => {
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
                    {t(item.labelKey)}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      {(isSuperAdmin || canViewModule("settings")) && (
        <>
          <Separator />
          <div className="flex flex-col gap-0.5 p-2">
            <span className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Admin
            </span>
            {isSuperAdmin && (
              <Link
                to="/super-admin"
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-sm transition-colors",
                  location.pathname.startsWith("/super-admin")
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <HugeiconsIcon icon={SecurityIcon} size={16} />
                {t("sidebar.superAdmin")}
              </Link>
            )}
            {canViewModule("settings") && (
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
                {t("sidebar.settings")}
              </Link>
            )}
          </div>
        </>
      )}

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
          aria-label={t("nav.logout")}
        >
          <HugeiconsIcon icon={Logout01Icon} size={16} />
        </button>
      </div>
    </aside>
  )
}
