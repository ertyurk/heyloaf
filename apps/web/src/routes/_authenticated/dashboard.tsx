import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@heyloaf/ui/components/card"
import { DataTable } from "@heyloaf/ui/components/data-table"
import Bread01Icon from "@hugeicons/core-free-icons/Bread01Icon"
import Cash01Icon from "@hugeicons/core-free-icons/Cash01Icon"
import Invoice01Icon from "@hugeicons/core-free-icons/Invoice01Icon"
import Package01Icon from "@hugeicons/core-free-icons/Package01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"
import { formatCurrency } from "@/lib/format-currency"
import { statusBadgeClass } from "@/lib/status-badge"

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
})

function DashboardPage() {
  const { t } = useTranslation()
  const client = useApi()
  const navigate = useNavigate()

  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    isError: dashboardError,
    refetch: refetchDashboard,
  } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data, error } = await client.GET("/api/dashboard")
      if (error) throw new Error("Failed to load dashboard data")
      return data
    },
  })

  const {
    data: ordersData,
    isLoading: ordersLoading,
    isError: ordersError,
    refetch: refetchOrders,
  } = useQuery({
    queryKey: ["orders", "recent"],
    queryFn: async () => {
      const { data, error } = await client.GET("/api/orders", {
        params: { query: { page: 1, per_page: 5 } },
      })
      if (error) throw new Error("Failed to load recent orders")
      return data
    },
  })

  const { data: paymentMethodsData } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: async () => {
      const res = await client.GET("/api/payment-methods")
      return res.data
    },
  })

  const stats = dashboardData?.data
  const recentOrders = ordersData?.data ?? []
  const paymentMethods = paymentMethodsData?.data ?? []

  const salesByDate = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      return d.toISOString().slice(0, 10)
    })

    const totals = new Map<string, number>()
    for (const date of last7Days) {
      totals.set(date, 0)
    }

    for (const order of recentOrders) {
      if (order.status === "voided" || order.status === "returned") continue
      const date = new Date(order.created_at).toISOString().slice(0, 10)
      if (totals.has(date)) {
        totals.set(date, (totals.get(date) ?? 0) + order.total)
      }
    }

    return last7Days.map((date) => ({
      date,
      total: totals.get(date) ?? 0,
    }))
  }, [recentOrders])

  const getPaymentMethodName = useCallback(
    (id: string | null | undefined) => {
      if (!id) return "\u2014"
      return paymentMethods.find((pm) => pm.id === id)?.name ?? "\u2014"
    },
    [paymentMethods]
  )

  type RecentOrder = (typeof recentOrders)[number]

  const statusLabel = useCallback(
    (status: string) => {
      const key = `dashboard.${status}` as
        | "dashboard.completed"
        | "dashboard.pending"
        | "dashboard.voided"
        | "dashboard.returned"
      return t(key)
    },
    [t]
  )

  const recentOrderColumns = useMemo(
    () => [
      {
        id: "order_number",
        header: t("dashboard.orderNumber"),
        cell: (row: RecentOrder) => <span className="font-medium">{row.order_number}</span>,
      },
      {
        id: "date",
        header: t("common.date"),
        cell: (row: RecentOrder) => (
          <span className="text-muted-foreground">
            {new Date(row.created_at).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "total",
        header: <span className="text-right block">{t("common.total")}</span>,
        cell: (row: RecentOrder) => (
          <span className="tabular-nums">{formatCurrency(row.total)}</span>
        ),
        className: "text-right",
      },
      {
        id: "status",
        header: t("common.status"),
        cell: (row: RecentOrder) => (
          <Badge
            className={statusBadgeClass[row.status] ?? "bg-secondary text-secondary-foreground"}
          >
            {statusLabel(row.status)}
          </Badge>
        ),
      },
      {
        id: "payment_method",
        header: t("dashboard.paymentMethod"),
        cell: (row: RecentOrder) => getPaymentMethodName(row.payment_method_id),
      },
    ],
    [getPaymentMethodName, t, statusLabel]
  )

  return (
    <>
      <PageHeader title={t("dashboard.title")} description={t("dashboard.description")} />
      <div className="space-y-6 p-6">
        {(dashboardError || ordersError) && (
          <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
            <p className="text-sm text-muted-foreground">{t("common.failedToLoadData")}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                if (dashboardError) refetchDashboard()
                if (ordersError) refetchOrders()
              }}
            >
              {t("common.retry")}
            </Button>
          </div>
        )}

        {(dashboardLoading || ordersLoading) && (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("dashboard.todaysSales")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(stats?.today_sales_total ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats?.today_sales_count ?? 0} {t("dashboard.orders")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("dashboard.lowStockAlerts")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${(stats?.low_stock_count ?? 0) > 0 ? "text-destructive" : ""}`}
              >
                {(stats?.low_stock_count ?? 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t("dashboard.itemsBelowThreshold")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("dashboard.outstandingReceivables")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(stats?.outstanding_receivables ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t("dashboard.outstandingInvoices")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("dashboard.outstandingPayables")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(stats?.outstanding_payables ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t("dashboard.dueToSuppliers")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("dashboard.todaysProduction")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(stats?.today_production_count ?? 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t("dashboard.batchesProduced")}</p>
            </CardContent>
          </Card>
        </div>

        {/* Sales Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("dashboard.salesTrend")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={salesByDate}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("dashboard.recentOrders")}
          </h2>
          <DataTable
            columns={recentOrderColumns}
            data={recentOrders}
            getRowId={(row) => row.id}
            emptyMessage={t("dashboard.noOrdersYet")}
            onRowClick={() => navigate({ to: "/orders" })}
          />
        </div>

        {/* Quick Actions */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("dashboard.quickActions")}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link
              to="/pos"
              className="flex flex-col items-center gap-2 rounded-lg border p-4 hover:bg-accent transition-colors"
            >
              <HugeiconsIcon icon={Cash01Icon} size={24} />
              <span className="text-sm font-medium">{t("dashboard.newSale")}</span>
            </Link>
            <Link
              to="/invoices"
              className="flex flex-col items-center gap-2 rounded-lg border p-4 hover:bg-accent transition-colors"
            >
              <HugeiconsIcon icon={Invoice01Icon} size={24} />
              <span className="text-sm font-medium">{t("dashboard.newInvoice")}</span>
            </Link>
            <Link
              to="/production"
              className="flex flex-col items-center gap-2 rounded-lg border p-4 hover:bg-accent transition-colors"
            >
              <HugeiconsIcon icon={Bread01Icon} size={24} />
              <span className="text-sm font-medium">{t("dashboard.newProduction")}</span>
            </Link>
            <Link
              to="/products"
              className="flex flex-col items-center gap-2 rounded-lg border p-4 hover:bg-accent transition-colors"
            >
              <HugeiconsIcon icon={Package01Icon} size={24} />
              <span className="text-sm font-medium">{t("dashboard.newProduct")}</span>
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
