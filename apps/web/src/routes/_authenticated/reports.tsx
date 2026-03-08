import { Badge } from "@heyloaf/ui/components/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@heyloaf/ui/components/card"
import { DataTable } from "@heyloaf/ui/components/data-table"
import { DateRangeFilter } from "@heyloaf/ui/components/date-range-filter"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { endOfDay, startOfDay, subDays } from "date-fns"
import { useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
})

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 220 70% 50%))",
  "hsl(var(--chart-3, 150 60% 45%))",
  "hsl(var(--chart-4, 30 80% 55%))",
  "hsl(var(--chart-5, 280 65% 60%))",
  "hsl(340 75% 55%)",
  "hsl(200 70% 50%)",
  "hsl(60 70% 45%)",
]

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2 })
}

function ReportsPage() {
  const client = useApi()

  const defaultFrom = startOfDay(subDays(new Date(), 29)).toISOString()
  const defaultTo = endOfDay(new Date()).toISOString()

  const [dateFrom, setDateFrom] = useState(defaultFrom)
  const [dateTo, setDateTo] = useState(defaultTo)

  const handleDateChange = (from: string, to: string) => {
    if (from && to) {
      setDateFrom(from)
      setDateTo(to)
    } else {
      setDateFrom(defaultFrom)
      setDateTo(defaultTo)
    }
  }

  const { data: ordersData } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const res = await client.GET("/api/orders")
      return res.data
    },
  })

  const { data: stockData } = useQuery({
    queryKey: ["stock"],
    queryFn: async () => {
      const res = await client.GET("/api/stock")
      return res.data
    },
  })

  const { data: productsData } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await client.GET("/api/products")
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

  const { data: dashboardData } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data } = await client.GET("/api/dashboard")
      return data
    },
  })

  const allOrders = ordersData?.data ?? []
  const stocks = stockData?.data ?? []
  const products = productsData?.data ?? []
  const paymentMethods = paymentMethodsData?.data ?? []
  const dashboard = dashboardData?.data

  const productNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of products) {
      map.set(p.id, p.name)
    }
    return map
  }, [products])

  const paymentMethodNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const pm of paymentMethods) {
      map.set(pm.id, pm.name)
    }
    return map
  }, [paymentMethods])

  // Filter orders by date range
  const filteredOrders = useMemo(() => {
    const from = new Date(dateFrom).getTime()
    const to = new Date(dateTo).getTime()
    return allOrders.filter((order) => {
      if (order.status === "voided" || order.status === "returned") return false
      const t = new Date(order.created_at).getTime()
      return t >= from && t <= to
    })
  }, [allOrders, dateFrom, dateTo])

  // Sales Summary
  const salesSummary = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((sum, o) => sum + o.total, 0)
    const totalOrders = filteredOrders.length
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
    return { totalRevenue, totalOrders, avgOrderValue }
  }, [filteredOrders])

  // Sales by day (bar chart)
  const salesByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const order of filteredOrders) {
      const date = new Date(order.created_at).toISOString().slice(0, 10)
      map.set(date, (map.get(date) ?? 0) + order.total)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total }))
  }, [filteredOrders])

  // Top products
  const topProducts = useMemo(() => {
    const map = new Map<string, { quantity: number; revenue: number }>()
    for (const order of filteredOrders) {
      const items = (order as Record<string, unknown>).items as
        | Array<{
            product_name: string
            quantity: number
            line_total: number
          }>
        | undefined
      if (!items) continue
      for (const item of items) {
        const key = item.product_name
        const existing = map.get(key) ?? { quantity: 0, revenue: 0 }
        existing.quantity += item.quantity
        existing.revenue += item.line_total
        map.set(key, existing)
      }
    }
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
  }, [filteredOrders])

  const topProductColumns = useMemo(
    () => [
      {
        id: "name",
        header: "Product Name",
        cell: (row: (typeof topProducts)[number]) => (
          <span className="font-medium">{row.name}</span>
        ),
      },
      {
        id: "quantity",
        header: "Quantity Sold",
        cell: (row: (typeof topProducts)[number]) => (
          <span className="tabular-nums">{row.quantity}</span>
        ),
      },
      {
        id: "revenue",
        header: <span className="text-right block">Revenue</span>,
        cell: (row: (typeof topProducts)[number]) => (
          <span className="tabular-nums">{formatCurrency(row.revenue)}</span>
        ),
        className: "text-right",
      },
    ],
    []
  )

  // Sales by payment method (pie chart)
  const salesByPaymentMethod = useMemo(() => {
    const map = new Map<string, number>()
    for (const order of filteredOrders) {
      const pmId = (order as Record<string, unknown>).payment_method_id as string | null | undefined
      const pmName = pmId ? (paymentMethodNameMap.get(pmId) ?? "Unknown") : "No Method"
      map.set(pmName, (map.get(pmName) ?? 0) + order.total)
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [filteredOrders, paymentMethodNameMap])

  // Stock summary
  const stockSummary = useMemo(() => {
    const totalProducts = stocks.length
    const lowStockCount = dashboard?.low_stock_count ?? 0
    const outOfStockCount = stocks.filter((s) => s.quantity === 0).length
    return { totalProducts, lowStockCount, outOfStockCount }
  }, [stocks, dashboard])

  const lowStockItems = useMemo(() => {
    return stocks
      .filter((s) => s.min_level != null && s.quantity <= s.min_level)
      .map((s) => ({
        ...s,
        productName: productNameMap.get(s.product_id) ?? s.product_id,
        deficit: (s.min_level ?? 0) - s.quantity,
      }))
  }, [stocks, productNameMap])

  const lowStockColumns = useMemo(
    () => [
      {
        id: "product",
        header: "Product",
        cell: (row: (typeof lowStockItems)[number]) => (
          <span className="font-medium">{row.productName}</span>
        ),
      },
      {
        id: "quantity",
        header: "Current Qty",
        cell: (row: (typeof lowStockItems)[number]) => {
          const isOut = row.quantity === 0
          return (
            <span className={`tabular-nums ${isOut ? "text-destructive font-medium" : ""}`}>
              {row.quantity}
            </span>
          )
        },
      },
      {
        id: "min_level",
        header: "Min Level",
        cell: (row: (typeof lowStockItems)[number]) => (
          <span className="tabular-nums text-muted-foreground">{row.min_level ?? "\u2014"}</span>
        ),
      },
      {
        id: "deficit",
        header: "Deficit",
        cell: (row: (typeof lowStockItems)[number]) => (
          <Badge variant="destructive" className="tabular-nums">
            -{row.deficit}
          </Badge>
        ),
      },
    ],
    []
  )

  return (
    <>
      <PageHeader title="Reports" description="Sales, stock and financial analytics" />
      <div className="space-y-6 p-6">
        {/* Date Range Filter */}
        <div className="flex items-center gap-4">
          <DateRangeFilter from={dateFrom} to={dateTo} onChange={handleDateChange} />
        </div>

        {/* 1. Sales Summary */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Sales Summary</h2>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(salesSummary.totalRevenue)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {salesSummary.totalOrders.toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Average Order Value
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(salesSummary.avgOrderValue)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Sales by Day
              </CardTitle>
            </CardHeader>
            <CardContent>
              {salesByDay.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">
                  No sales data for the selected period.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={salesByDay}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 2. Top Products */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Top Products</h2>
          <DataTable
            columns={topProductColumns}
            data={topProducts}
            getRowId={(row) => row.name}
            emptyMessage="No product data for the selected period."
          />
        </div>

        {/* 3. Sales by Payment Method */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Sales by Payment Method</h2>
          <Card>
            <CardContent className="pt-4">
              {salesByPaymentMethod.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">
                  No payment data for the selected period.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={salesByPaymentMethod}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={(props) =>
                        `${props.name ?? ""} (${((props.percent ?? 0) * 100).toFixed(0)}%)`
                      }
                    >
                      {salesByPaymentMethod.map((entry, index) => (
                        <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 4. Stock Summary */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Stock Summary</h2>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Products
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stockSummary.totalProducts.toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Low Stock Count
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${stockSummary.lowStockCount > 0 ? "text-destructive" : ""}`}
                >
                  {stockSummary.lowStockCount.toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Out of Stock
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${stockSummary.outOfStockCount > 0 ? "text-destructive" : ""}`}
                >
                  {stockSummary.outOfStockCount.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </div>

          <DataTable
            columns={lowStockColumns}
            data={lowStockItems}
            getRowId={(row) => row.product_id}
            emptyMessage="No low stock items."
          />
        </div>
      </div>
    </>
  )
}
