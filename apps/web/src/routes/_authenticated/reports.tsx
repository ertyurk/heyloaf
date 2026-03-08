import type { components } from "@heyloaf/api-client"
import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@heyloaf/ui/components/card"
import { DataTable } from "@heyloaf/ui/components/data-table"
import { DateRangeFilter } from "@heyloaf/ui/components/date-range-filter"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@heyloaf/ui/components/tabs"
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
import * as XLSX from "xlsx"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"
import { formatCurrency } from "@/lib/format-currency"

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

// ── Excel Export ──

function exportToExcel(data: Record<string, unknown>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Report")
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

function ExportButton({ data, filename }: { data: Record<string, unknown>[]; filename: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={data.length === 0}
      onClick={() => exportToExcel(data, filename)}
    >
      Export Excel
    </Button>
  )
}

// ── Section Header ──

function SectionHeader({
  title,
  exportData,
  exportFilename,
}: {
  title: string
  exportData?: Record<string, unknown>[]
  exportFilename?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold">{title}</h2>
      {exportData && exportFilename && <ExportButton data={exportData} filename={exportFilename} />}
    </div>
  )
}

// ── Types ──

type Invoice = components["schemas"]["Invoice"]
type Contact = components["schemas"]["Contact"]

interface OrderItem {
  product_id?: string | null
  product_name: string
  quantity: number
  line_total: number
  unit_price: number
}

interface OrderWithItems {
  id: string
  status: string
  total: number
  payment_method_id?: string | null
  created_at: string
  items?: OrderItem[]
}

interface StockRecord {
  product_id: string
  quantity: number
  min_level?: number | null
  max_level?: number | null
  last_movement_at?: string | null
}

interface StockMovement {
  id: string
  product_id: string
  movement_type: string
  quantity: number
  source: string
  unit_price?: number | null
  total_price?: number | null
  created_at: string
  description?: string | null
}

interface ProductionRecord {
  id: string
  product_id: string
  variant_name?: string | null
  quantity: number
  unit: string
  batch_size: number
  materials: Array<{ product_id: string; quantity: number }>
  notes?: string | null
  created_at: string
}

// ── Page ──

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

  // ── Data fetching ──

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

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await client.GET("/api/categories")
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

  const { data: dashboardData } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data } = await client.GET("/api/dashboard")
      return data
    },
  })

  const { data: invoicesData } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const res = await client.GET("/api/invoices")
      return res.data
    },
  })

  const { data: contactsData } = useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const res = await client.GET("/api/contacts")
      return res.data
    },
  })

  const { data: movementsData } = useQuery({
    queryKey: ["stock-movements"],
    queryFn: async () => {
      const res = await client.GET("/api/stock/movements")
      return res.data
    },
  })

  const { data: productionData } = useQuery({
    queryKey: ["production-records"],
    queryFn: async () => {
      const res = await client.GET("/api/production/records" as never)
      return (res as { data?: { data?: ProductionRecord[] } }).data
    },
  })

  // ── Raw data ──

  const allOrders = (ordersData?.data ?? []) as unknown as OrderWithItems[]
  const stocks = (stockData?.data ?? []) as unknown as StockRecord[]
  const products = productsData?.data ?? []
  const categories = categoriesData?.data ?? []
  const paymentMethods = paymentMethodsData?.data ?? []
  const dashboard = dashboardData?.data
  const invoices = (invoicesData?.data ?? []) as Invoice[]
  const contacts = (contactsData?.data ?? []) as Contact[]
  const movements = (movementsData?.data ?? []) as unknown as StockMovement[]
  const productionRecords = productionData?.data ?? []

  // ── Lookup maps ──

  const productNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of products) {
      map.set(p.id, p.name)
    }
    return map
  }, [products])

  const productMap = useMemo(() => {
    const map = new Map<string, (typeof products)[number]>()
    for (const p of products) {
      map.set(p.id, p)
    }
    return map
  }, [products])

  const categoryNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) {
      map.set(c.id, c.name)
    }
    return map
  }, [categories])

  const paymentMethodNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const pm of paymentMethods) {
      map.set(pm.id, pm.name)
    }
    return map
  }, [paymentMethods])

  // ── Date-filtered data ──

  const fromTs = new Date(dateFrom).getTime()
  const toTs = new Date(dateTo).getTime()

  const filteredOrders = useMemo(() => {
    return allOrders.filter((order) => {
      if (order.status === "voided" || order.status === "returned") return false
      const t = new Date(order.created_at).getTime()
      return t >= fromTs && t <= toTs
    })
  }, [allOrders, fromTs, toTs])

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const t = new Date(inv.date).getTime()
      return t >= fromTs && t <= toTs
    })
  }, [invoices, fromTs, toTs])

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      const t = new Date(m.created_at).getTime()
      return t >= fromTs && t <= toTs
    })
  }, [movements, fromTs, toTs])

  const filteredProduction = useMemo(() => {
    return (productionRecords as ProductionRecord[]).filter((r) => {
      const t = new Date(r.created_at).getTime()
      return t >= fromTs && t <= toTs
    })
  }, [productionRecords, fromTs, toTs])

  return (
    <>
      <PageHeader title="Reports" description="Sales, stock, financial and production analytics" />
      <div className="space-y-4 p-6">
        {/* Date Range Filter */}
        <div className="flex items-center gap-4">
          <DateRangeFilter from={dateFrom} to={dateTo} onChange={handleDateChange} />
        </div>

        <Tabs defaultValue="sales" className="flex flex-col">
          <TabsList>
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="stock">Stock</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
            <TabsTrigger value="production">Production</TabsTrigger>
          </TabsList>

          <TabsContent value="sales">
            <SalesTab
              filteredOrders={filteredOrders}
              productMap={productMap}
              categoryNameMap={categoryNameMap}
              paymentMethodNameMap={paymentMethodNameMap}
            />
          </TabsContent>

          <TabsContent value="stock">
            <StockTab
              stocks={stocks}
              productNameMap={productNameMap}
              productMap={productMap}
              dashboard={dashboard}
              filteredMovements={filteredMovements}
            />
          </TabsContent>

          <TabsContent value="financial">
            <FinancialTab filteredInvoices={filteredInvoices} contacts={contacts} />
          </TabsContent>

          <TabsContent value="production">
            <ProductionTab
              filteredProduction={filteredProduction}
              productNameMap={productNameMap}
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}

// ── Helpers ──

function getCategoryForItem(
  item: OrderItem,
  productMap: Map<string, { category_id?: string | null }>,
  categoryNameMap: Map<string, string>
): string {
  const product = item.product_id ? productMap.get(item.product_id) : null
  const catId = product?.category_id
  return catId ? (categoryNameMap.get(catId) ?? "Uncategorized") : "Uncategorized"
}

function getAgingBucket(diffDays: number): "current" | "days30" | "days60" | "days90plus" {
  if (diffDays <= 0) return "current"
  if (diffDays <= 30) return "days30"
  if (diffDays <= 60) return "days60"
  return "days90plus"
}

// ════════════════════════════════════════════════════════════════════
// Sales Tab
// ════════════════════════════════════════════════════════════════════

function SalesTab({
  filteredOrders,
  productMap,
  categoryNameMap,
  paymentMethodNameMap,
}: {
  filteredOrders: OrderWithItems[]
  productMap: Map<string, { id: string; category_id?: string | null; name: string }>
  categoryNameMap: Map<string, string>
  paymentMethodNameMap: Map<string, string>
}) {
  // Sales Summary
  const salesSummary = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((sum, o) => sum + o.total, 0)
    const totalOrders = filteredOrders.length
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
    return { totalRevenue, totalOrders, avgOrderValue }
  }, [filteredOrders])

  // Sales by day
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
      const items = order.items
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
      const pmId = order.payment_method_id
      const pmName = pmId ? (paymentMethodNameMap.get(pmId) ?? "Unknown") : "No Method"
      map.set(pmName, (map.get(pmName) ?? 0) + order.total)
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [filteredOrders, paymentMethodNameMap])

  // Sales by category
  const salesByCategory = useMemo(() => {
    const map = new Map<string, { revenue: number; quantity: number }>()
    for (const order of filteredOrders) {
      const items = order.items
      if (!items) continue
      for (const item of items) {
        const catName = getCategoryForItem(item, productMap, categoryNameMap)
        const existing = map.get(catName) ?? { revenue: 0, quantity: 0 }
        existing.revenue += item.line_total
        existing.quantity += item.quantity
        map.set(catName, existing)
      }
    }
    return Array.from(map.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [filteredOrders, productMap, categoryNameMap])

  const salesByCategoryColumns = useMemo(
    () => [
      {
        id: "category",
        header: "Category",
        cell: (row: (typeof salesByCategory)[number]) => (
          <span className="font-medium">{row.category}</span>
        ),
      },
      {
        id: "quantity",
        header: "Items Sold",
        cell: (row: (typeof salesByCategory)[number]) => (
          <span className="tabular-nums">{row.quantity}</span>
        ),
      },
      {
        id: "revenue",
        header: <span className="text-right block">Revenue</span>,
        cell: (row: (typeof salesByCategory)[number]) => (
          <span className="tabular-nums">{formatCurrency(row.revenue)}</span>
        ),
        className: "text-right",
      },
    ],
    []
  )

  return (
    <div className="space-y-6 pt-4">
      {/* Sales Summary */}
      <div className="space-y-4">
        <SectionHeader
          title="Sales Summary"
          exportData={salesByDay as Record<string, unknown>[]}
          exportFilename="sales-by-day"
        />

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(salesSummary.totalRevenue)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{salesSummary.totalOrders.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Average Order Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(salesSummary.avgOrderValue)}</div>
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

      {/* Top Products */}
      <div className="space-y-4">
        <SectionHeader
          title="Top Products"
          exportData={topProducts as Record<string, unknown>[]}
          exportFilename="top-products"
        />
        <DataTable
          columns={topProductColumns}
          data={topProducts}
          getRowId={(row) => row.name}
          emptyMessage="No product data for the selected period."
        />
      </div>

      {/* Sales by Category */}
      <div className="space-y-4">
        <SectionHeader
          title="Sales by Category"
          exportData={salesByCategory as Record<string, unknown>[]}
          exportFilename="sales-by-category"
        />
        <Card>
          <CardContent className="pt-4">
            {salesByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">
                No category data for the selected period.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={salesByCategory} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis dataKey="category" type="category" className="text-xs" width={120} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Bar
                    dataKey="revenue"
                    fill="hsl(var(--chart-2, 220 70% 50%))"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <DataTable
          columns={salesByCategoryColumns}
          data={salesByCategory}
          getRowId={(row) => row.category}
          emptyMessage="No category data for the selected period."
        />
      </div>

      {/* Sales by Payment Method */}
      <div className="space-y-4">
        <SectionHeader
          title="Sales by Payment Method"
          exportData={salesByPaymentMethod as Record<string, unknown>[]}
          exportFilename="sales-by-payment-method"
        />
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
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Stock Tab
// ════════════════════════════════════════════════════════════════════

function StockTab({
  stocks,
  productNameMap,
  productMap,
  dashboard,
  filteredMovements,
}: {
  stocks: StockRecord[]
  productNameMap: Map<string, string>
  productMap: Map<string, { id: string; last_purchase_price?: number | null; name: string }>
  dashboard: { low_stock_count?: number } | undefined
  filteredMovements: StockMovement[]
}) {
  // Stock summary cards
  const stockSummary = useMemo(() => {
    const totalProducts = stocks.length
    const lowStockCount = dashboard?.low_stock_count ?? 0
    const outOfStockCount = stocks.filter((s) => s.quantity === 0).length
    return { totalProducts, lowStockCount, outOfStockCount }
  }, [stocks, dashboard])

  // Low stock items
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

  // Stock valuation
  const stockValuation = useMemo(() => {
    return stocks
      .map((s) => {
        const product = productMap.get(s.product_id)
        const name = product?.name ?? s.product_id
        const lastPrice = product?.last_purchase_price ?? 0
        const value = s.quantity * lastPrice
        return {
          product: name,
          quantity: s.quantity,
          lastPurchasePrice: lastPrice,
          value,
        }
      })
      .filter((s) => s.quantity > 0)
      .sort((a, b) => b.value - a.value)
  }, [stocks, productMap])

  const totalStockValue = useMemo(
    () => stockValuation.reduce((sum, s) => sum + s.value, 0),
    [stockValuation]
  )

  const stockValuationColumns = useMemo(
    () => [
      {
        id: "product",
        header: "Product",
        cell: (row: (typeof stockValuation)[number]) => (
          <span className="font-medium">{row.product}</span>
        ),
      },
      {
        id: "quantity",
        header: "Quantity",
        cell: (row: (typeof stockValuation)[number]) => (
          <span className="tabular-nums">{row.quantity}</span>
        ),
      },
      {
        id: "lastPurchasePrice",
        header: "Last Purchase Price",
        cell: (row: (typeof stockValuation)[number]) => (
          <span className="tabular-nums text-muted-foreground">
            {row.lastPurchasePrice > 0 ? formatCurrency(row.lastPurchasePrice) : "\u2014"}
          </span>
        ),
      },
      {
        id: "value",
        header: <span className="text-right block">Value</span>,
        cell: (row: (typeof stockValuation)[number]) => (
          <span className="tabular-nums">
            {row.value > 0 ? formatCurrency(row.value) : "\u2014"}
          </span>
        ),
        className: "text-right",
      },
    ],
    []
  )

  // Stock movement summary by period
  const movementSummary = useMemo(() => {
    const map = new Map<
      string,
      { in_qty: number; out_qty: number; in_value: number; out_value: number }
    >()
    for (const m of filteredMovements) {
      const date = new Date(m.created_at).toISOString().slice(0, 10)
      const existing = map.get(date) ?? { in_qty: 0, out_qty: 0, in_value: 0, out_value: 0 }
      const price = m.total_price ?? (m.unit_price ?? 0) * m.quantity
      if (m.movement_type === "in" || m.movement_type === "adjustment_in") {
        existing.in_qty += m.quantity
        existing.in_value += price
      } else {
        existing.out_qty += m.quantity
        existing.out_value += price
      }
      map.set(date, existing)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }))
  }, [filteredMovements])

  const movementSummaryColumns = useMemo(
    () => [
      {
        id: "date",
        header: "Date",
        cell: (row: (typeof movementSummary)[number]) => (
          <span className="font-medium">{row.date}</span>
        ),
      },
      {
        id: "in_qty",
        header: "In Qty",
        cell: (row: (typeof movementSummary)[number]) => (
          <span className="tabular-nums text-green-600">+{row.in_qty}</span>
        ),
      },
      {
        id: "out_qty",
        header: "Out Qty",
        cell: (row: (typeof movementSummary)[number]) => (
          <span className="tabular-nums text-red-600">-{row.out_qty}</span>
        ),
      },
      {
        id: "in_value",
        header: "In Value",
        cell: (row: (typeof movementSummary)[number]) => (
          <span className="tabular-nums text-muted-foreground">{formatCurrency(row.in_value)}</span>
        ),
      },
      {
        id: "out_value",
        header: <span className="text-right block">Out Value</span>,
        cell: (row: (typeof movementSummary)[number]) => (
          <span className="tabular-nums text-muted-foreground">
            {formatCurrency(row.out_value)}
          </span>
        ),
        className: "text-right",
      },
    ],
    []
  )

  return (
    <div className="space-y-6 pt-4">
      {/* Stock Summary */}
      <div className="space-y-4">
        <SectionHeader
          title="Stock Summary"
          exportData={
            lowStockItems.map((i) => ({
              Product: i.productName,
              Quantity: i.quantity,
              "Min Level": i.min_level,
              Deficit: i.deficit,
            })) as Record<string, unknown>[]
          }
          exportFilename="low-stock-items"
        />

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

      {/* Stock Valuation */}
      <div className="space-y-4">
        <SectionHeader
          title="Stock Valuation"
          exportData={
            stockValuation.map((s) => ({
              Product: s.product,
              Quantity: s.quantity,
              "Last Purchase Price": s.lastPurchasePrice,
              Value: s.value,
            })) as Record<string, unknown>[]
          }
          exportFilename="stock-valuation"
        />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Stock Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalStockValue)}</div>
            <p className="text-xs text-muted-foreground mt-1">Based on last purchase price</p>
          </CardContent>
        </Card>
        <DataTable
          columns={stockValuationColumns}
          data={stockValuation}
          getRowId={(row) => row.product}
          emptyMessage="No stock data available."
        />
      </div>

      {/* Stock Movement Summary */}
      <div className="space-y-4">
        <SectionHeader
          title="Stock Movement Summary"
          exportData={movementSummary as Record<string, unknown>[]}
          exportFilename="stock-movements-summary"
        />
        <DataTable
          columns={movementSummaryColumns}
          data={movementSummary}
          getRowId={(row) => row.date}
          emptyMessage="No stock movements for the selected period."
        />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Financial Tab
// ════════════════════════════════════════════════════════════════════

function FinancialTab({
  filteredInvoices,
  contacts,
}: {
  filteredInvoices: Invoice[]
  contacts: Contact[]
}) {
  // Revenue vs Expenses
  const revenueVsExpenses = useMemo(() => {
    let salesTotal = 0
    let purchaseTotal = 0
    for (const inv of filteredInvoices) {
      if (inv.invoice_type === "sales") {
        salesTotal += inv.grand_total
      } else if (inv.invoice_type === "purchase") {
        purchaseTotal += inv.grand_total
      }
    }
    return {
      salesTotal,
      purchaseTotal,
      netProfit: salesTotal - purchaseTotal,
    }
  }, [filteredInvoices])

  // Outstanding Receivables/Payables aging
  const aging = useMemo(() => {
    const now = new Date()
    const buckets = {
      current: { receivable: 0, payable: 0 },
      days30: { receivable: 0, payable: 0 },
      days60: { receivable: 0, payable: 0 },
      days90plus: { receivable: 0, payable: 0 },
    }

    const outstandingInvoices = filteredInvoices.filter(
      (inv) => inv.status !== "paid" && inv.status !== "cancelled"
    )

    for (const inv of outstandingInvoices) {
      const dueDate = inv.due_date ? new Date(inv.due_date) : new Date(inv.date)
      const diffDays = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
      const key = inv.invoice_type === "sales" ? "receivable" : "payable"
      const bucket = getAgingBucket(diffDays)
      buckets[bucket][key] += inv.grand_total
    }

    return [
      { period: "Current", ...buckets.current },
      { period: "1-30 Days", ...buckets.days30 },
      { period: "31-60 Days", ...buckets.days60 },
      { period: "90+ Days", ...buckets.days90plus },
    ]
  }, [filteredInvoices])

  const agingColumns = useMemo(
    () => [
      {
        id: "period",
        header: "Period",
        cell: (row: (typeof aging)[number]) => <span className="font-medium">{row.period}</span>,
      },
      {
        id: "receivable",
        header: "Receivable",
        cell: (row: (typeof aging)[number]) => (
          <span className="tabular-nums text-green-600">{formatCurrency(row.receivable)}</span>
        ),
      },
      {
        id: "payable",
        header: <span className="text-right block">Payable</span>,
        cell: (row: (typeof aging)[number]) => (
          <span className="tabular-nums text-red-600">{formatCurrency(row.payable)}</span>
        ),
        className: "text-right",
      },
    ],
    []
  )

  // Contact balance summary (top debtors/creditors)
  const contactBalances = useMemo(() => {
    return contacts
      .filter((c) => c.balance !== 0)
      .map((c) => ({
        name: c.name,
        type: c.contact_type,
        balance: c.balance,
      }))
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
      .slice(0, 20)
  }, [contacts])

  const contactBalanceColumns = useMemo(
    () => [
      {
        id: "name",
        header: "Contact",
        cell: (row: (typeof contactBalances)[number]) => (
          <span className="font-medium">{row.name}</span>
        ),
      },
      {
        id: "type",
        header: "Type",
        cell: (row: (typeof contactBalances)[number]) => (
          <Badge variant="outline" className="capitalize">
            {row.type}
          </Badge>
        ),
      },
      {
        id: "balance",
        header: <span className="text-right block">Balance</span>,
        cell: (row: (typeof contactBalances)[number]) => (
          <span className={`tabular-nums ${row.balance > 0 ? "text-green-600" : "text-red-600"}`}>
            {formatCurrency(row.balance)}
          </span>
        ),
        className: "text-right",
      },
    ],
    []
  )

  // Invoices by month chart
  const invoicesByMonth = useMemo(() => {
    const map = new Map<string, { sales: number; purchases: number }>()
    for (const inv of filteredInvoices) {
      const month = inv.date.slice(0, 7) // YYYY-MM
      const existing = map.get(month) ?? { sales: 0, purchases: 0 }
      if (inv.invoice_type === "sales") {
        existing.sales += inv.grand_total
      } else {
        existing.purchases += inv.grand_total
      }
      map.set(month, existing)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data }))
  }, [filteredInvoices])

  return (
    <div className="space-y-6 pt-4">
      {/* Revenue vs Expenses */}
      <div className="space-y-4">
        <SectionHeader
          title="Revenue vs Expenses"
          exportData={[
            {
              "Sales Revenue": revenueVsExpenses.salesTotal,
              "Purchase Expenses": revenueVsExpenses.purchaseTotal,
              "Net Profit": revenueVsExpenses.netProfit,
            },
          ]}
          exportFilename="revenue-vs-expenses"
        />
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Sales Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(revenueVsExpenses.salesTotal)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Purchase Expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(revenueVsExpenses.purchaseTotal)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Net Profit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${revenueVsExpenses.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {formatCurrency(revenueVsExpenses.netProfit)}
              </div>
            </CardContent>
          </Card>
        </div>

        {invoicesByMonth.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Sales vs Purchases
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={invoicesByMonth}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Legend />
                  <Bar
                    dataKey="sales"
                    name="Sales"
                    fill="hsl(var(--chart-3, 150 60% 45%))"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="purchases"
                    name="Purchases"
                    fill="hsl(340 75% 55%)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Outstanding Receivables/Payables Aging */}
      <div className="space-y-4">
        <SectionHeader
          title="Outstanding Aging"
          exportData={aging as Record<string, unknown>[]}
          exportFilename="outstanding-aging"
        />
        <DataTable
          columns={agingColumns}
          data={aging}
          getRowId={(row) => row.period}
          emptyMessage="No outstanding invoices."
        />
      </div>

      {/* Contact Balance Summary */}
      <div className="space-y-4">
        <SectionHeader
          title="Contact Balance Summary"
          exportData={contactBalances as Record<string, unknown>[]}
          exportFilename="contact-balances"
        />
        <DataTable
          columns={contactBalanceColumns}
          data={contactBalances}
          getRowId={(row) => row.name}
          emptyMessage="No contacts with outstanding balances."
        />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Production Tab
// ════════════════════════════════════════════════════════════════════

function ProductionTab({
  filteredProduction,
  productNameMap,
}: {
  filteredProduction: ProductionRecord[]
  productNameMap: Map<string, string>
}) {
  // Production volume by product
  const productionByProduct = useMemo(() => {
    const map = new Map<string, { product: string; quantity: number; batches: number }>()
    for (const r of filteredProduction) {
      const name = productNameMap.get(r.product_id) ?? r.product_id
      const existing = map.get(r.product_id) ?? { product: name, quantity: 0, batches: 0 }
      existing.quantity += r.quantity
      existing.batches += 1
      map.set(r.product_id, existing)
    }
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity)
  }, [filteredProduction, productNameMap])

  const productionByProductColumns = useMemo(
    () => [
      {
        id: "product",
        header: "Product",
        cell: (row: (typeof productionByProduct)[number]) => (
          <span className="font-medium">{row.product}</span>
        ),
      },
      {
        id: "batches",
        header: "Batches",
        cell: (row: (typeof productionByProduct)[number]) => (
          <span className="tabular-nums">{row.batches}</span>
        ),
      },
      {
        id: "quantity",
        header: <span className="text-right block">Total Quantity</span>,
        cell: (row: (typeof productionByProduct)[number]) => (
          <span className="tabular-nums">{row.quantity}</span>
        ),
        className: "text-right",
      },
    ],
    []
  )

  // Material consumption summary
  const materialConsumption = useMemo(() => {
    const map = new Map<
      string,
      { material: string; totalQuantity: number; usedInBatches: number }
    >()
    for (const r of filteredProduction) {
      if (!r.materials) continue
      for (const m of r.materials) {
        const name = productNameMap.get(m.product_id) ?? m.product_id
        const existing = map.get(m.product_id) ?? {
          material: name,
          totalQuantity: 0,
          usedInBatches: 0,
        }
        existing.totalQuantity += m.quantity
        existing.usedInBatches += 1
        map.set(m.product_id, existing)
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalQuantity - a.totalQuantity)
  }, [filteredProduction, productNameMap])

  const materialConsumptionColumns = useMemo(
    () => [
      {
        id: "material",
        header: "Material",
        cell: (row: (typeof materialConsumption)[number]) => (
          <span className="font-medium">{row.material}</span>
        ),
      },
      {
        id: "usedInBatches",
        header: "Used in Batches",
        cell: (row: (typeof materialConsumption)[number]) => (
          <span className="tabular-nums">{row.usedInBatches}</span>
        ),
      },
      {
        id: "totalQuantity",
        header: <span className="text-right block">Total Consumed</span>,
        cell: (row: (typeof materialConsumption)[number]) => (
          <span className="tabular-nums">{row.totalQuantity}</span>
        ),
        className: "text-right",
      },
    ],
    []
  )

  // Production volume chart
  const productionByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of filteredProduction) {
      const date = new Date(r.created_at).toISOString().slice(0, 10)
      map.set(date, (map.get(date) ?? 0) + r.quantity)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, quantity]) => ({ date, quantity }))
  }, [filteredProduction])

  // Production summary cards
  const productionSummary = useMemo(() => {
    const totalRecords = filteredProduction.length
    const totalUnits = filteredProduction.reduce((sum, r) => sum + r.quantity, 0)
    const uniqueProducts = new Set(filteredProduction.map((r) => r.product_id)).size
    return { totalRecords, totalUnits, uniqueProducts }
  }, [filteredProduction])

  return (
    <div className="space-y-6 pt-4">
      {/* Production Summary Cards */}
      <div className="space-y-4">
        <SectionHeader title="Production Summary" />
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Records
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {productionSummary.totalRecords.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Units Produced
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {productionSummary.totalUnits.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Unique Products
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {productionSummary.uniqueProducts.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Production Volume Chart */}
      {productionByDay.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Production Volume by Day
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={productionByDay}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Bar
                  dataKey="quantity"
                  fill="hsl(var(--chart-3, 150 60% 45%))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Production Volume by Product */}
      <div className="space-y-4">
        <SectionHeader
          title="Production Volume by Product"
          exportData={productionByProduct as Record<string, unknown>[]}
          exportFilename="production-by-product"
        />
        <DataTable
          columns={productionByProductColumns}
          data={productionByProduct}
          getRowId={(row) => row.product}
          emptyMessage="No production data for the selected period."
        />
      </div>

      {/* Material Consumption Summary */}
      <div className="space-y-4">
        <SectionHeader
          title="Material Consumption Summary"
          exportData={materialConsumption as Record<string, unknown>[]}
          exportFilename="material-consumption"
        />
        <DataTable
          columns={materialConsumptionColumns}
          data={materialConsumption}
          getRowId={(row) => row.material}
          emptyMessage="No material consumption data for the selected period."
        />
      </div>
    </div>
  )
}
