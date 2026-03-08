import { AdvancedSelect } from "@heyloaf/ui/components/advanced-select"
import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { DataTable } from "@heyloaf/ui/components/data-table"
import { DropdownMenuItem } from "@heyloaf/ui/components/dropdown-menu"
import { Input } from "@heyloaf/ui/components/input"
import { Label } from "@heyloaf/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@heyloaf/ui/components/select"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@heyloaf/ui/components/sheet"
import { Textarea } from "@heyloaf/ui/components/textarea"
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

export const Route = createFileRoute("/_authenticated/orders")({
  component: OrdersPage,
})

interface OrderItem {
  id: string
  product_name: string
  quantity: number
  unit_price: number
  vat_rate: number
  line_total: number
}

let nextItemId = 1

function emptyItem(): OrderItem {
  return {
    id: `item-${nextItemId++}`,
    product_name: "",
    quantity: 1,
    unit_price: 0,
    vat_rate: 0,
    line_total: 0,
  }
}

function computeLineTotal(item: Pick<OrderItem, "quantity" | "unit_price">): number {
  return item.quantity * item.unit_price
}

const statusOptions = [
  { value: "__all__", label: "All Statuses" },
  { value: "completed", label: "Completed" },
  { value: "pending", label: "Pending" },
  { value: "voided", label: "Voided" },
  { value: "returned", label: "Returned" },
]

const statusBadgeClass: Record<string, string> = {
  completed: "bg-green-100 text-green-800",
  pending: "bg-secondary text-secondary-foreground",
  voided: "bg-destructive/10 text-destructive",
  returned: "bg-destructive/10 text-destructive",
}

function OrdersPage() {
  const client = useApi()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [paymentMethodId, setPaymentMethodId] = useState<string>("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<OrderItem[]>([emptyItem()])

  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const [statusFilter, setStatusFilter] = useState("__all__")

  function handleSearchChange(value: string) {
    setSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 300)
  }

  const { data, isLoading } = useQuery({
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

  const paymentMethods = paymentMethodsData?.data ?? []
  const orders = data?.data ?? []

  const filteredOrders = useMemo(() => {
    let result = orders
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter((order) => order.order_number?.toLowerCase().includes(q))
    }
    if (statusFilter !== "__all__") {
      result = result.filter((order) => order.status === statusFilter)
    }
    return result
  }, [orders, debouncedSearch, statusFilter])

  const createOrder = useMutation({
    mutationFn: async () => {
      const orderItems = items.map(({ id: _id, ...item }) => ({
        ...item,
        line_total: computeLineTotal(item),
      }))
      await client.POST(
        "/api/orders" as never,
        {
          body: {
            ...(paymentMethodId ? { payment_method_id: paymentMethodId } : {}),
            ...(notes ? { notes } : {}),
            items: orderItems,
          },
        } as never
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      setCreateOpen(false)
      resetCreateForm()
      toast.success("Order created")
    },
    onError: () => {
      toast.error("Failed to create order")
    },
  })

  const voidOrder = useMutation({
    mutationFn: async (orderId: string) => {
      await client.POST(`/api/orders/${orderId}/void` as never)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      toast.success("Order voided")
    },
    onError: () => {
      toast.error("Failed to void order")
    },
  })

  const returnOrder = useMutation({
    mutationFn: async (orderId: string) => {
      await client.POST(`/api/orders/${orderId}/return` as never)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      toast.success("Order returned")
    },
    onError: () => {
      toast.error("Failed to return order")
    },
  })

  function resetCreateForm() {
    setPaymentMethodId("")
    setNotes("")
    setItems([emptyItem()])
  }

  function updateItem(index: number, field: keyof OrderItem, value: string | number) {
    setItems((prev) => {
      const next = [...prev]
      const item = { ...next[index]! }
      if (field === "product_name") {
        item.product_name = value as string
      } else if (field === "quantity") {
        item.quantity = Number(value) || 0
      } else if (field === "unit_price") {
        item.unit_price = Number(value) || 0
      } else if (field === "vat_rate") {
        item.vat_rate = Number(value) || 0
      }
      item.line_total = computeLineTotal(item)
      next[index] = item
      return next
    })
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function handleVoid(orderId: string) {
    if (window.confirm("Are you sure you want to void this order?")) {
      voidOrder.mutate(orderId)
    }
  }

  function handleReturn(orderId: string) {
    if (window.confirm("Are you sure you want to return this order?")) {
      returnOrder.mutate(orderId)
    }
  }

  const hasValidItems =
    items.length > 0 &&
    items.every((item) => item.product_name.trim() && item.quantity > 0 && item.unit_price > 0)

  const columns = useMemo(
    () => [
      {
        id: "order_number",
        header: "Order #",
        cell: (row: (typeof orders)[number]) => (
          <span className="font-medium">{row.order_number}</span>
        ),
      },
      {
        id: "date",
        header: "Date",
        cell: (row: (typeof orders)[number]) => (
          <span className="text-muted-foreground">
            {new Date(row.created_at).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "total",
        header: <span className="text-right block">Total</span>,
        cell: (row: (typeof orders)[number]) => (
          <span className="tabular-nums">{row.total.toFixed(2)}</span>
        ),
        className: "text-right",
      },
      {
        id: "status",
        header: "Status",
        cell: (row: (typeof orders)[number]) => (
          <Badge
            className={statusBadgeClass[row.status] ?? "bg-secondary text-secondary-foreground"}
          >
            {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
          </Badge>
        ),
      },
      {
        id: "payment",
        header: "Payment Method",
        cell: (row: (typeof orders)[number]) =>
          paymentMethods.find((pm) => pm.id === row.payment_method_id)?.name ?? "\u2014",
      },
    ],
    [paymentMethods]
  )

  return (
    <>
      <PageHeader title="Orders" description="Manage point-of-sale orders">
        <Button
          onClick={() => {
            resetCreateForm()
            setCreateOpen(true)
          }}
        >
          New Order
        </Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        <div className="flex items-center gap-4">
          <div className="relative max-w-xs flex-1">
            <HugeiconsIcon
              icon={Search01Icon}
              size={16}
              className="text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2"
            />
            <Input
              placeholder="Search orders..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-8"
            />
          </div>
          <AdvancedSelect
            options={statusOptions}
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v ?? "__all__")}
            placeholder="Status"
            searchable={false}
            className="w-40"
          />
        </div>

        <DataTable
          columns={columns}
          data={filteredOrders}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No orders found."
          rowActions={(row) => {
            if (row.status === "voided" || row.status === "returned") return null
            return (
              <>
                <DropdownMenuItem onClick={() => handleVoid(row.id)}>Void</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleReturn(row.id)}>Return</DropdownMenuItem>
              </>
            )
          }}
        />
      </div>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>New Order</SheetTitle>
          </SheetHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              createOrder.mutate()
            }}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <SheetBody>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="order-payment">Payment Method</Label>
                  <Select
                    value={paymentMethodId}
                    onValueChange={(val) => setPaymentMethodId(val as string)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((pm) => (
                        <SelectItem key={pm.id} value={pm.id}>
                          {pm.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="order-notes">Notes (optional)</Label>
                  <Textarea
                    id="order-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                {/* Items */}
                <div className="grid gap-2">
                  <Label>Items</Label>
                  <div className="space-y-3">
                    {items.map((item, index) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-[1fr_4rem_5rem_4rem_3rem_2rem] items-end gap-2 rounded-md border p-2"
                      >
                        <div className="grid gap-1">
                          <span className="text-xs text-muted-foreground">Product</span>
                          <Input
                            placeholder="Product name"
                            value={item.product_name}
                            onChange={(e) => updateItem(index, "product_name", e.target.value)}
                            required
                          />
                        </div>
                        <div className="grid gap-1">
                          <span className="text-xs text-muted-foreground">Qty</span>
                          <Input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateItem(index, "quantity", e.target.value)}
                            required
                          />
                        </div>
                        <div className="grid gap-1">
                          <span className="text-xs text-muted-foreground">Price</span>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => updateItem(index, "unit_price", e.target.value)}
                            required
                          />
                        </div>
                        <div className="grid gap-1">
                          <span className="text-xs text-muted-foreground">VAT %</span>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.vat_rate}
                            onChange={(e) => updateItem(index, "vat_rate", e.target.value)}
                          />
                        </div>
                        <div className="grid gap-1">
                          <span className="text-xs text-muted-foreground">Total</span>
                          <p className="flex h-8 items-center text-sm font-medium tabular-nums">
                            {computeLineTotal(item).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={items.length <= 1}
                            onClick={() => removeItem(index)}
                          >
                            &times;
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setItems((prev) => [...prev, emptyItem()])}
                  >
                    Add Item
                  </Button>
                </div>
              </div>
            </SheetBody>
            <SheetFooter>
              <Button type="submit" disabled={!hasValidItems || createOrder.isPending}>
                {createOrder.isPending ? "Creating..." : "Create Order"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
