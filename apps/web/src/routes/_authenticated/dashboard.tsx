import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@heyloaf/ui/components/card"
import { DataTable } from "@heyloaf/ui/components/data-table"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useCallback, useMemo } from "react"
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

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
})

const statusBadgeClass: Record<string, string> = {
  completed: "bg-green-100 text-green-800",
  pending: "bg-secondary text-secondary-foreground",
  voided: "bg-destructive/10 text-destructive",
  returned: "bg-destructive/10 text-destructive",
}

function DashboardPage() {
  const client = useApi()
  const navigate = useNavigate()

  const { data: dashboardData } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data } = await client.GET("/api/dashboard")
      return data
    },
  })

  const { data: ordersData } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const res = await client.GET("/api/orders")
      return res.data
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
  const orders = ordersData?.data ?? []
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

    for (const order of orders) {
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
  }, [orders])

  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
  }, [orders])

  const getPaymentMethodName = useCallback(
    (id: string | null | undefined) => {
      if (!id) return "\u2014"
      return paymentMethods.find((pm) => pm.id === id)?.name ?? "\u2014"
    },
    [paymentMethods]
  )

  type RecentOrder = (typeof recentOrders)[number]

  const recentOrderColumns = useMemo(
    () => [
      {
        id: "order_number",
        header: "Order #",
        cell: (row: RecentOrder) => <span className="font-medium">{row.order_number}</span>,
      },
      {
        id: "date",
        header: "Date",
        cell: (row: RecentOrder) => (
          <span className="text-muted-foreground">
            {new Date(row.created_at).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "total",
        header: <span className="text-right block">Total</span>,
        cell: (row: RecentOrder) => (
          <span className="tabular-nums">{formatCurrency(row.total)}</span>
        ),
        className: "text-right",
      },
      {
        id: "status",
        header: "Status",
        cell: (row: RecentOrder) => (
          <Badge
            className={statusBadgeClass[row.status] ?? "bg-secondary text-secondary-foreground"}
          >
            {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
          </Badge>
        ),
      },
      {
        id: "payment_method",
        header: "Payment Method",
        cell: (row: RecentOrder) => getPaymentMethodName(row.payment_method_id),
      },
    ],
    [getPaymentMethodName]
  )

  return (
    <>
      <PageHeader title="Dashboard" description="Business overview" />
      <div className="space-y-6 p-6">
        {/* Stat cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Today's Sales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(stats?.today_sales_total ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats?.today_sales_count ?? 0} orders
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Low Stock Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${(stats?.low_stock_count ?? 0) > 0 ? "text-destructive" : ""}`}
              >
                {(stats?.low_stock_count ?? 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">items below threshold</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Outstanding Receivables
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(stats?.outstanding_receivables ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">outstanding invoices</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Outstanding Payables
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(stats?.outstanding_payables ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">due to suppliers</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Today's Production
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(stats?.today_production_count ?? 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">batches produced</p>
            </CardContent>
          </Card>
        </div>

        {/* Sales Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sales Trend (Last 7 Days)
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
          <h2 className="text-sm font-medium text-muted-foreground">Recent Orders</h2>
          <DataTable
            columns={recentOrderColumns}
            data={recentOrders}
            getRowId={(row) => row.id}
            emptyMessage="No orders yet."
            onRowClick={() => navigate({ to: "/orders" })}
          />
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-3">
          <Button
            variant="outline"
            className="h-16 text-sm"
            onClick={() => navigate({ to: "/pos" })}
          >
            New Sale
          </Button>
          <Button
            variant="outline"
            className="h-16 text-sm"
            onClick={() => navigate({ to: "/invoices" })}
          >
            New Invoice
          </Button>
          <Button
            variant="outline"
            className="h-16 text-sm"
            onClick={() => navigate({ to: "/production" })}
          >
            New Production
          </Button>
        </div>
      </div>
    </>
  )
}
