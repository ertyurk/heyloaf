import type { components } from "@heyloaf/api-client"
import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@heyloaf/ui/components/card"
import { DataTable } from "@heyloaf/ui/components/data-table"
import { Separator } from "@heyloaf/ui/components/separator"
import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useMemo } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

type Order = components["schemas"]["Order"]
type OrderItem = components["schemas"]["OrderItem"]

export const Route = createFileRoute("/_authenticated/orders/$orderId")({
  component: OrderDetailPage,
})

const statusBadgeClass: Record<string, string> = {
  completed: "bg-green-100 text-green-800",
  pending: "bg-secondary text-secondary-foreground",
  voided: "bg-destructive/10 text-destructive",
  returned: "bg-destructive/10 text-destructive",
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function OrderDetailPage() {
  const { orderId } = Route.useParams()
  const client = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: orderData, isLoading } = useQuery({
    queryKey: ["orders", orderId],
    queryFn: async () => {
      const res = await client.GET("/api/orders/{id}", {
        params: { path: { id: orderId } },
      })
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

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await client.GET("/api/users")
      return res.data
    },
  })

  const order = orderData?.data as (Order & { items: OrderItem[] }) | undefined
  const paymentMethods = paymentMethodsData?.data ?? []
  const users = usersData?.data ?? []

  const voidMutation = useMutation({
    mutationFn: async () => {
      await client.POST(
        "/api/orders/{id}/void" as never,
        {
          params: { path: { id: orderId } },
        } as never
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders", orderId] })
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      toast.success("Order voided")
    },
    onError: () => {
      toast.error("Failed to void order")
    },
  })

  const returnMutation = useMutation({
    mutationFn: async () => {
      await client.POST(
        "/api/orders/{id}/return" as never,
        {
          params: { path: { id: orderId } },
        } as never
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders", orderId] })
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      toast.success("Order returned")
    },
    onError: () => {
      toast.error("Failed to return order")
    },
  })

  function handleVoid() {
    if (window.confirm("Are you sure you want to void this order?")) {
      voidMutation.mutate()
    }
  }

  function handleReturn() {
    if (window.confirm("Are you sure you want to return this order?")) {
      returnMutation.mutate()
    }
  }

  const orderTitle = order?.order_number ? `Order #${order.order_number}` : "Order Detail"

  const canModify = order && order.status !== "voided" && order.status !== "returned"

  const itemColumns = useMemo(
    () => [
      {
        id: "product",
        header: "Product",
        cell: (row: OrderItem) => <span className="font-medium">{row.product_name}</span>,
      },
      {
        id: "variant",
        header: "Variant",
        cell: (row: OrderItem) => (
          <span className="text-muted-foreground">{row.variant_name ?? "\u2014"}</span>
        ),
      },
      {
        id: "quantity",
        header: "Quantity",
        cell: (row: OrderItem) => <span className="tabular-nums">{row.quantity}</span>,
      },
      {
        id: "unit_price",
        header: <span className="text-right block">Unit Price</span>,
        cell: (row: OrderItem) => (
          <span className="tabular-nums">{formatCurrency(row.unit_price)}</span>
        ),
        className: "text-right",
      },
      {
        id: "vat_rate",
        header: "VAT Rate",
        cell: (row: OrderItem) => (
          <span className="text-muted-foreground tabular-nums">{row.vat_rate}%</span>
        ),
      },
      {
        id: "line_total",
        header: <span className="text-right block">Line Total</span>,
        cell: (row: OrderItem) => (
          <span className="tabular-nums font-medium">{formatCurrency(row.line_total)}</span>
        ),
        className: "text-right",
      },
    ],
    []
  )

  if (isLoading) {
    return (
      <>
        <PageHeader title="Loading..." />
        <div className="p-6 text-muted-foreground">Loading order details...</div>
      </>
    )
  }

  if (!order) {
    return (
      <>
        <PageHeader title="Order not found" />
        <div className="p-6 text-muted-foreground">The requested order could not be found.</div>
      </>
    )
  }

  return (
    <>
      <PageHeader title={orderTitle} description={`Created ${formatDate(order.created_at)}`}>
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/orders" })}>
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} className="mr-1" />
          Back
        </Button>
        {canModify && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReturn}
              disabled={returnMutation.isPending}
            >
              {returnMutation.isPending ? "Returning..." : "Return Order"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleVoid}
              disabled={voidMutation.isPending}
            >
              {voidMutation.isPending ? "Voiding..." : "Void Order"}
            </Button>
          </>
        )}
      </PageHeader>

      <div className="space-y-6 p-6">
        {/* Order Info Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge
                className={
                  statusBadgeClass[order.status] ?? "bg-secondary text-secondary-foreground"
                }
              >
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Date</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">{formatDate(order.created_at)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Payment Method</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">
                {paymentMethods.find((pm) => pm.id === order.payment_method_id)?.name ?? "\u2014"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Cashier</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">
                {users.find((u) => u.user_id === order.cashier_id)?.name ??
                  order.cashier_id.slice(0, 8)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Order Items Table */}
        <DataTable
          columns={itemColumns}
          data={order.items}
          getRowId={(row) => row.id}
          isLoading={false}
          emptyMessage="No items in this order."
        />

        {/* Totals Section */}
        <div className="flex justify-end">
          <div className="w-64 rounded-md border p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">{formatCurrency(order.tax_total)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-medium">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {order.notes && (
          <div className="rounded-md border p-4">
            <p className="text-sm text-muted-foreground mb-1">Notes</p>
            <p className="text-sm">{order.notes}</p>
          </div>
        )}
      </div>
    </>
  )
}
