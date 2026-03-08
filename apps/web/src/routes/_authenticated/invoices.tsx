import type { components } from "@heyloaf/api-client"
import { AdvancedSelect } from "@heyloaf/ui/components/advanced-select"
import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { DataTable } from "@heyloaf/ui/components/data-table"
import { DropdownMenuItem, DropdownMenuSeparator } from "@heyloaf/ui/components/dropdown-menu"
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

type Invoice = components["schemas"]["Invoice"]
type Contact = components["schemas"]["Contact"]

export const Route = createFileRoute("/_authenticated/invoices")({
  component: InvoicesPage,
})

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-yellow-100 text-yellow-800",
  sent: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  cancelled: "bg-muted text-muted-foreground",
}

const invoiceStatuses = ["draft", "pending", "paid", "overdue", "cancelled"]

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "\u2014"
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

interface LineItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  vat_rate: number
  line_total: number
}

let nextLineItemId = 1

function emptyLineItem(): LineItem {
  return {
    id: `li-${nextLineItemId++}`,
    description: "",
    quantity: 1,
    unit_price: 0,
    vat_rate: 0,
    line_total: 0,
  }
}

function computeLineTotal(item: Pick<LineItem, "quantity" | "unit_price">) {
  return item.quantity * item.unit_price
}

const emptyInvoiceForm = {
  invoice_type: "sales" as string,
  contact_id: "",
  date: todayStr(),
  due_date: "",
  currency_code: "TRY",
  notes: "",
}

const statusOptions = [
  { value: "__all__", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
]

const typeOptions = [
  { value: "__all__", label: "All Types" },
  { value: "sales", label: "Sales" },
  { value: "purchase", label: "Purchase" },
]

function InvoicesPage() {
  const client = useApi()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(emptyInvoiceForm)
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLineItem()])

  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const [statusFilter, setStatusFilter] = useState("__all__")
  const [typeFilter, setTypeFilter] = useState("__all__")

  function handleSearchChange(value: string) {
    setSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 300)
  }

  const { data, isLoading } = useQuery({
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

  const invoices = data?.data ?? []
  const contacts = contactsData?.data ?? []

  const filteredInvoices = useMemo(() => {
    let result = invoices
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter((inv) => inv.invoice_number?.toLowerCase().includes(q))
    }
    if (statusFilter !== "__all__") {
      result = result.filter((inv) => inv.status === statusFilter)
    }
    if (typeFilter !== "__all__") {
      result = result.filter((inv) => inv.invoice_type === typeFilter)
    }
    return result
  }, [invoices, debouncedSearch, statusFilter, typeFilter])

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { error } = await client.POST("/api/invoices", {
        body: body as unknown as components["schemas"]["CreateInvoiceRequest"],
      })
      if (error) throw new Error("Failed to create invoice")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      setCreateOpen(false)
      setCreateForm(emptyInvoiceForm)
      setLineItems([emptyLineItem()])
      toast.success("Invoice created")
    },
    onError: () => {
      toast.error("Failed to create invoice")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.DELETE("/api/invoices/{id}", {
        params: { path: { id } },
      })
      if (error) throw new Error("Failed to delete invoice")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      toast.success("Invoice deleted")
    },
    onError: () => {
      toast.error("Failed to delete invoice")
    },
  })

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await client.PUT("/api/invoices/{id}/status", {
        params: { path: { id } },
        body: { status },
      })
      if (error) throw new Error("Failed to update status")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      toast.success("Status updated")
    },
    onError: () => {
      toast.error("Failed to update status")
    },
  })

  function updateLineItem(index: number, field: keyof LineItem, value: string | number) {
    setLineItems((prev) => {
      const next = [...prev]
      const item = { ...next[index]! }
      if (field === "description") {
        item.description = value as string
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

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  const subtotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + computeLineTotal(item), 0),
    [lineItems]
  )

  const taxTotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + computeLineTotal(item) * (item.vat_rate / 100), 0),
    [lineItems]
  )

  const grandTotal = subtotal + taxTotal

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const items = lineItems.map(({ id: _id, ...item }) => ({
      ...item,
      line_total: computeLineTotal(item),
    }))

    createMutation.mutate({
      invoice_type: createForm.invoice_type,
      ...(createForm.contact_id && { contact_id: createForm.contact_id }),
      date: createForm.date,
      ...(createForm.due_date && { due_date: createForm.due_date }),
      currency_code: createForm.currency_code,
      exchange_rate: 1,
      ...(createForm.notes && { notes: createForm.notes }),
      line_items: items,
      subtotal,
      tax_total: taxTotal,
      grand_total: grandTotal,
      base_currency_total: grandTotal,
    })
  }

  function handleDelete(invoice: Invoice) {
    if (!window.confirm(`Delete invoice "${invoice.invoice_number}"?`)) return
    deleteMutation.mutate(invoice.id)
  }

  function handleStatusChange(invoiceId: string, status: string) {
    statusMutation.mutate({ id: invoiceId, status })
  }

  const columns = useMemo(
    () => [
      {
        id: "invoice_number",
        header: "Invoice #",
        cell: (row: Invoice) => <span className="font-medium">{row.invoice_number}</span>,
      },
      {
        id: "contact",
        header: "Contact",
        cell: (row: Invoice) =>
          contacts.find((c: Contact) => c.id === row.contact_id)?.name ?? "\u2014",
      },
      {
        id: "type",
        header: "Type",
        cell: (row: Invoice) =>
          row.invoice_type
            ? row.invoice_type.charAt(0).toUpperCase() + row.invoice_type.slice(1)
            : "\u2014",
      },
      {
        id: "date",
        header: "Date",
        cell: (row: Invoice) => (
          <span className="text-muted-foreground">{formatDate(row.date)}</span>
        ),
      },
      {
        id: "due_date",
        header: "Due Date",
        cell: (row: Invoice) => (
          <span className="text-muted-foreground">{formatDate(row.due_date ?? null)}</span>
        ),
      },
      {
        id: "total",
        header: <span className="text-right block">Total</span>,
        cell: (row: Invoice) => (
          <span className="tabular-nums">{formatCurrency(row.grand_total)}</span>
        ),
        className: "text-right",
      },
      {
        id: "status",
        header: "Status",
        cell: (row: Invoice) => (
          <Badge className={statusColor[row.status] ?? "bg-muted text-muted-foreground"}>
            {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
          </Badge>
        ),
      },
    ],
    [contacts]
  )

  const hasValidLineItems =
    lineItems.length > 0 &&
    lineItems.every((item) => item.description.trim() && item.quantity > 0 && item.unit_price > 0)

  return (
    <>
      <PageHeader title="Invoices" description="Manage sales and purchase invoices">
        <Button
          onClick={() => {
            setCreateForm(emptyInvoiceForm)
            setLineItems([emptyLineItem()])
            setCreateOpen(true)
          }}
        >
          New Invoice
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
              placeholder="Search invoices..."
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
          <AdvancedSelect
            options={typeOptions}
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v ?? "__all__")}
            placeholder="Type"
            searchable={false}
            className="w-36"
          />
        </div>

        <DataTable
          columns={columns}
          data={filteredInvoices}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No invoices found."
          rowActions={(row) => (
            <>
              {invoiceStatuses.map((s) => (
                <DropdownMenuItem
                  key={s}
                  disabled={row.status === s}
                  onClick={() => handleStatusChange(row.id, s)}
                >
                  Mark as {s.charAt(0).toUpperCase() + s.slice(1)}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => handleDelete(row)}>
                Delete
              </DropdownMenuItem>
            </>
          )}
        />
      </div>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Create Invoice</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleCreate} className="flex flex-col flex-1 overflow-hidden">
            <SheetBody>
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="invoice_type">Type</Label>
                  <Select
                    value={createForm.invoice_type}
                    onValueChange={(val) =>
                      setCreateForm((f) => ({ ...f, invoice_type: val as string }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales">Sales</SelectItem>
                      <SelectItem value="purchase">Purchase</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="contact_id">Contact</Label>
                  <Select
                    value={createForm.contact_id}
                    onValueChange={(val) =>
                      setCreateForm((f) => ({ ...f, contact_id: val as string }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select contact (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {contacts.map((c: Contact) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="date">Date *</Label>
                    <Input
                      id="date"
                      type="date"
                      value={createForm.date}
                      onChange={(e) => setCreateForm((f) => ({ ...f, date: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="due_date">Due Date</Label>
                    <Input
                      id="due_date"
                      type="date"
                      value={createForm.due_date}
                      onChange={(e) => setCreateForm((f) => ({ ...f, due_date: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="currency_code">Currency</Label>
                  <Input
                    id="currency_code"
                    value={createForm.currency_code}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        currency_code: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={createForm.notes}
                    onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>

                {/* Line Items */}
                <div className="grid gap-2">
                  <Label>Line Items</Label>
                  <div className="space-y-3">
                    {lineItems.map((item, index) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-[1fr_4rem_5rem_4rem_3.5rem_2rem] items-end gap-2 rounded-md border p-2"
                      >
                        <div className="grid gap-1">
                          <span className="text-xs text-muted-foreground">Description</span>
                          <Input
                            placeholder="Item description"
                            value={item.description}
                            onChange={(e) => updateLineItem(index, "description", e.target.value)}
                            required
                          />
                        </div>
                        <div className="grid gap-1">
                          <span className="text-xs text-muted-foreground">Qty</span>
                          <Input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateLineItem(index, "quantity", e.target.value)}
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
                            onChange={(e) => updateLineItem(index, "unit_price", e.target.value)}
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
                            onChange={(e) => updateLineItem(index, "vat_rate", e.target.value)}
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
                            disabled={lineItems.length <= 1}
                            onClick={() => removeLineItem(index)}
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
                    onClick={() => setLineItems((prev) => [...prev, emptyLineItem()])}
                  >
                    Add Item
                  </Button>
                </div>

                {/* Totals summary */}
                <div className="rounded-md border p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="tabular-nums">{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="tabular-nums">{taxTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-medium border-t pt-1">
                    <span>Total</span>
                    <span className="tabular-nums">{grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </SheetBody>
            <SheetFooter>
              <Button
                type="submit"
                disabled={createMutation.isPending || !createForm.date || !hasValidLineItems}
              >
                {createMutation.isPending ? "Creating..." : "Create Invoice"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
