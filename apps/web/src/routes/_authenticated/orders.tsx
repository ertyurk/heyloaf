import { AdvancedSelect } from "@heyloaf/ui/components/advanced-select"
import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { DataTable } from "@heyloaf/ui/components/data-table"
import { DateRangeFilter } from "@heyloaf/ui/components/date-range-filter"
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
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"
import { useDebounce } from "@/hooks/use-debounce"
import { statusBadgeClass } from "@/lib/status-badge"

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

function emptyItem(): OrderItem {
  return {
    id: crypto.randomUUID(),
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

function OrdersPage() {
  const { t } = useTranslation()
  const client = useApi()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [paymentMethodId, setPaymentMethodId] = useState<string>("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<OrderItem[]>([emptyItem()])
  const [confirmAction, setConfirmAction] = useState<{
    type: "void" | "return"
    orderId: string
  } | null>(null)

  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search)
  const [statusFilter, setStatusFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const statusOptions = useMemo(
    () => [
      { value: "all", label: t("orders.allStatuses") },
      { value: "completed", label: t("orders.completed") },
      { value: "pending", label: t("orders.pending") },
      { value: "voided", label: t("orders.voided") },
      { value: "returned", label: t("orders.returned") },
    ],
    [t]
  )

  const { data, isLoading, isError, refetch } = useQuery({
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
    if (statusFilter !== "all") {
      result = result.filter((order) => order.status === statusFilter)
    }
    if (dateFrom) {
      const from = new Date(dateFrom).getTime()
      result = result.filter((order) => new Date(order.created_at).getTime() >= from)
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime()
      result = result.filter((order) => new Date(order.created_at).getTime() <= to)
    }
    return result
  }, [orders, debouncedSearch, statusFilter, dateFrom, dateTo])

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
      toast.success(t("orders.orderCreated"))
    },
    onError: () => {
      toast.error(t("orders.failedToCreateOrder"))
    },
  })

  const voidOrder = useMutation({
    mutationFn: async (orderId: string) => {
      await client.POST(`/api/orders/${orderId}/void` as never)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      setConfirmAction(null)
      toast.success(t("orders.orderVoided"))
    },
    onError: () => {
      setConfirmAction(null)
      toast.error(t("orders.failedToVoidOrder"))
    },
  })

  const returnOrder = useMutation({
    mutationFn: async (orderId: string) => {
      await client.POST(`/api/orders/${orderId}/return` as never)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      setConfirmAction(null)
      toast.success(t("orders.orderReturned"))
    },
    onError: () => {
      setConfirmAction(null)
      toast.error(t("orders.failedToReturnOrder"))
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

  function executeConfirmAction() {
    if (!confirmAction) return
    if (confirmAction.type === "void") {
      voidOrder.mutate(confirmAction.orderId)
    } else {
      returnOrder.mutate(confirmAction.orderId)
    }
  }

  const hasValidItems =
    items.length > 0 &&
    items.every((item) => item.product_name.trim() && item.quantity > 0 && item.unit_price > 0)

  const columns = useMemo(
    () => [
      {
        id: "order_number",
        header: t("orders.orderNumber"),
        cell: (row: (typeof orders)[number]) => (
          <span className="font-medium">{row.order_number}</span>
        ),
      },
      {
        id: "date",
        header: t("common.date"),
        cell: (row: (typeof orders)[number]) => (
          <span className="text-muted-foreground">
            {new Date(row.created_at).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "total",
        header: <span className="text-right block">{t("common.total")}</span>,
        cell: (row: (typeof orders)[number]) => (
          <span className="tabular-nums">{row.total.toFixed(2)}</span>
        ),
        className: "text-right",
      },
      {
        id: "status",
        header: t("common.status"),
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
        header: t("orders.paymentMethod"),
        cell: (row: (typeof orders)[number]) =>
          paymentMethods.find((pm) => pm.id === row.payment_method_id)?.name ?? "\u2014",
      },
    ],
    [paymentMethods, t]
  )

  return (
    <>
      <PageHeader title={t("orders.title")} description={t("orders.description")}>
        <Button
          onClick={() => {
            resetCreateForm()
            setCreateOpen(true)
          }}
        >
          {t("orders.newOrder")}
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
              placeholder={t("orders.searchOrders")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <AdvancedSelect
            options={statusOptions}
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v ?? "all")}
            placeholder={t("common.status")}
            searchable={false}
            className="w-40"
          />
          <DateRangeFilter
            from={dateFrom}
            to={dateTo}
            onChange={(from, to) => {
              setDateFrom(from)
              setDateTo(to)
            }}
          />
        </div>

        {isError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
            <p className="text-sm text-destructive">{t("common.failedToLoadData")}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        )}

        <DataTable
          columns={columns}
          data={filteredOrders}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage={t("orders.noOrdersFound")}
          rowActions={(row) => {
            if (row.status === "voided" || row.status === "returned") return null
            return (
              <>
                <DropdownMenuItem
                  onClick={() =>
                    setConfirmAction({
                      type: "void",
                      orderId: row.id,
                    })
                  }
                >
                  {t("orders.void")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    setConfirmAction({
                      type: "return",
                      orderId: row.id,
                    })
                  }
                >
                  {t("orders.return")}
                </DropdownMenuItem>
              </>
            )
          }}
        />
      </div>

      {/* Void/Return Confirmation */}
      <ConfirmDialog
        open={!!confirmAction}
        onConfirm={executeConfirmAction}
        onCancel={() => setConfirmAction(null)}
        title={confirmAction?.type === "void" ? t("orders.void") : t("orders.return")}
        description={
          confirmAction?.type === "void" ? t("orders.confirmVoid") : t("orders.confirmReturn")
        }
        confirmLabel={t("common.confirm")}
        isPending={voidOrder.isPending || returnOrder.isPending}
      />

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t("orders.newOrder")}</SheetTitle>
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
                  <Label htmlFor="order-payment">{t("orders.paymentMethod")}</Label>
                  <Select
                    value={paymentMethodId}
                    onValueChange={(val) => setPaymentMethodId(val as string)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("orders.selectPaymentMethod")} />
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
                  <Label htmlFor="order-notes">{t("orders.notesOptional")}</Label>
                  <Textarea
                    id="order-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                {/* Items */}
                <div className="grid gap-2">
                  <Label>{t("orders.items")}</Label>
                  <div className="space-y-3">
                    {items.map((item, index) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-[1fr_4rem_5rem_4rem_3rem_2rem] items-end gap-2 rounded-md border p-2"
                      >
                        <div className="grid gap-1">
                          <span className="text-xs text-muted-foreground">
                            {t("common.product")}
                          </span>
                          <Input
                            placeholder={t("orders.productName")}
                            value={item.product_name}
                            onChange={(e) => updateItem(index, "product_name", e.target.value)}
                            required
                          />
                        </div>
                        <div className="grid gap-1">
                          <span className="text-xs text-muted-foreground">{t("orders.qty")}</span>
                          <Input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateItem(index, "quantity", e.target.value)}
                            required
                          />
                        </div>
                        <div className="grid gap-1">
                          <span className="text-xs text-muted-foreground">{t("common.price")}</span>
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
                          <span className="text-xs text-muted-foreground">
                            {t("orders.vatPercent")}
                          </span>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.vat_rate}
                            onChange={(e) => updateItem(index, "vat_rate", e.target.value)}
                          />
                        </div>
                        <div className="grid gap-1">
                          <span className="text-xs text-muted-foreground">{t("common.total")}</span>
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
                    {t("common.addItem")}
                  </Button>
                </div>
              </div>
            </SheetBody>
            <SheetFooter>
              <Button type="submit" disabled={!hasValidItems || createOrder.isPending}>
                {createOrder.isPending ? t("common.creating") : t("orders.createOrder")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
