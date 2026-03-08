import type { components } from "@heyloaf/api-client"
import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@heyloaf/ui/components/card"
import { Checkbox } from "@heyloaf/ui/components/checkbox"
import { DataTable } from "@heyloaf/ui/components/data-table"
import { Input } from "@heyloaf/ui/components/input"
import { Label } from "@heyloaf/ui/components/label"
import { Separator } from "@heyloaf/ui/components/separator"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@heyloaf/ui/components/sheet"
import { Textarea } from "@heyloaf/ui/components/textarea"
import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon"
import PrinterIcon from "@hugeicons/core-free-icons/PrinterIcon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"
import { formatCurrency } from "@/lib/format-currency"

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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

interface ReturnSelection {
  selected: boolean
  quantity: number
}

function OrderDetailPage() {
  const { orderId } = Route.useParams()
  const client = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [returnOpen, setReturnOpen] = useState(false)
  const [returnReason, setReturnReason] = useState("")
  const [returnSelections, setReturnSelections] = useState<Record<string, ReturnSelection>>({})

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
    mutationFn: async (payload: {
      reason: string
      items?: Array<{ order_item_id: string; quantity: number }>
    }) => {
      await client.POST(
        "/api/orders/{id}/return" as never,
        {
          params: { path: { id: orderId } },
          body: payload,
        } as never
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders", orderId] })
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      setReturnOpen(false)
      resetReturnForm()
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

  function resetReturnForm() {
    setReturnReason("")
    setReturnSelections({})
  }

  function openReturnSheet() {
    resetReturnForm()
    if (order) {
      const initial: Record<string, ReturnSelection> = {}
      for (const item of order.items) {
        initial[item.id] = { selected: false, quantity: item.quantity }
      }
      setReturnSelections(initial)
    }
    setReturnOpen(true)
  }

  function handleReturnSubmit(e: React.FormEvent) {
    e.preventDefault()
    const selectedItems = Object.entries(returnSelections)
      .filter(([, sel]) => sel.selected)
      .map(([id, sel]) => ({
        order_item_id: id,
        quantity: sel.quantity,
      }))

    if (selectedItems.length === 0) {
      toast.error("Select at least one item to return")
      return
    }

    const isFullReturn =
      order?.items.length === selectedItems.length &&
      selectedItems.every((si) => {
        const item = order?.items.find((i) => i.id === si.order_item_id)
        return item && si.quantity === item.quantity
      })

    returnMutation.mutate({
      reason: returnReason,
      items: isFullReturn ? undefined : selectedItems,
    })
  }

  const handleReprintReceipt = useCallback(() => {
    window.print()
  }, [])

  const hasValidReturnSelection = useMemo(() => {
    if (!returnReason.trim()) return false
    const selected = Object.entries(returnSelections).filter(([, sel]) => sel.selected)
    if (selected.length === 0) return false
    return selected.every(([id, sel]) => {
      const item = order?.items.find((i) => i.id === id)
      return item && sel.quantity > 0 && sel.quantity <= item.quantity
    })
  }, [returnSelections, returnReason, order])

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
      <style
        // biome-ignore lint/security/noDangerouslySetInnerHtml: print styles
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              nav, header, [data-slot="page-header"] > div > button,
              [data-slot="sheet-overlay"], [data-slot="sheet-content"] {
                display: none !important;
              }
              body { background: white; }
            }
          `,
        }}
      />

      <PageHeader title={orderTitle} description={`Created ${formatDate(order.created_at)}`}>
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/orders" })}>
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} className="mr-1" />
          Back
        </Button>
        <Button variant="outline" size="sm" onClick={handleReprintReceipt}>
          <HugeiconsIcon icon={PrinterIcon} size={16} className="mr-1" />
          Reprint Receipt
        </Button>
        {canModify && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={openReturnSheet}
              disabled={returnMutation.isPending}
            >
              Return Items
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

      {/* Return Items Sheet */}
      <Sheet open={returnOpen} onOpenChange={setReturnOpen}>
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Return Items</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleReturnSubmit} className="flex flex-col flex-1 overflow-hidden">
            <SheetBody>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Select items to return</Label>
                  <div className="space-y-3">
                    {order.items.map((item) => {
                      const sel = returnSelections[item.id]
                      return (
                        <div key={item.id} className="flex items-start gap-3 rounded-md border p-3">
                          <Checkbox
                            checked={sel?.selected ?? false}
                            onCheckedChange={(checked) =>
                              setReturnSelections((prev) => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id]!,
                                  selected: Boolean(checked),
                                },
                              }))
                            }
                            className="mt-0.5"
                          />
                          <div className="flex-1 space-y-1">
                            <p className="text-sm font-medium">{item.product_name}</p>
                            {item.variant_name && (
                              <p className="text-xs text-muted-foreground">{item.variant_name}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(item.unit_price)} x {item.quantity} ={" "}
                              {formatCurrency(item.line_total)}
                            </p>
                          </div>
                          {sel?.selected && (
                            <div className="w-20">
                              <Label className="text-xs">Qty</Label>
                              <Input
                                type="number"
                                min={1}
                                max={item.quantity}
                                value={sel.quantity}
                                onChange={(e) =>
                                  setReturnSelections((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      ...prev[item.id]!,
                                      quantity: Number(e.target.value) || 0,
                                    },
                                  }))
                                }
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="return-reason">Reason (required)</Label>
                  <Textarea
                    id="return-reason"
                    placeholder="Enter reason for return..."
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    required
                  />
                </div>
              </div>
            </SheetBody>
            <SheetFooter>
              <Button type="submit" disabled={!hasValidReturnSelection || returnMutation.isPending}>
                {returnMutation.isPending ? "Processing..." : "Submit Return"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
