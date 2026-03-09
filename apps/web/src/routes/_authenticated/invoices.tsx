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
  SheetClose,
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
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"
import { formatCurrency } from "@/lib/format-currency"

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

function emptyLineItem(): LineItem {
  return {
    id: crypto.randomUUID(),
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

const invoiceSchema = z.object({
  contact_id: z.string().uuid("Contact is required").or(z.literal("")),
  invoice_type: z.enum(["sales", "purchase"]),
  items: z
    .array(
      z.object({
        description: z.string().min(1, "Description is required"),
        quantity: z.number().positive("Quantity must be positive"),
        unit_price: z.number().min(0, "Price cannot be negative"),
      })
    )
    .min(1, "At least one item required"),
})

const emptyInvoiceForm = {
  invoice_type: "sales" as string,
  contact_id: "",
  date: todayStr(),
  due_date: "",
  currency_code: "TRY",
  exchange_rate: "1",
  notes: "",
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Invoices page has multiple filters, line items, forms, and confirmation dialogs
function InvoicesPage() {
  const { t } = useTranslation()
  const client = useApi()
  const queryClient = useQueryClient()

  const [sheetMode, setSheetMode] = useState<"create" | "edit" | null>(null)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [createForm, setCreateForm] = useState(emptyInvoiceForm)
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLineItem()])
  const [confirmDeleteInvoice, setConfirmDeleteInvoice] = useState<Invoice | null>(null)

  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const [statusFilter, setStatusFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [])

  function handleSearchChange(value: string) {
    setSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 300)
  }

  const statusOptions = useMemo(
    () => [
      { value: "all", label: t("invoices.allStatuses") },
      { value: "draft", label: t("common.draft") },
      { value: "pending", label: t("dashboard.pending") },
      { value: "paid", label: t("invoices.paid") },
      { value: "overdue", label: t("invoices.overdue") },
      { value: "cancelled", label: t("invoices.cancelled") },
    ],
    [t]
  )

  const typeOptions = useMemo(
    () => [
      { value: "all", label: t("invoices.allTypes") },
      { value: "sales", label: t("invoices.sales") },
      { value: "purchase", label: t("invoices.purchase") },
    ],
    [t]
  )

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

  const { data: companyData } = useQuery({
    queryKey: ["company"],
    queryFn: async () => {
      const res = await client.GET("/api/company")
      return res.data
    },
  })

  const invoices = data?.data ?? []
  const contacts = contactsData?.data ?? []
  const defaultCurrency = companyData?.data?.default_currency ?? "TRY"

  const showExchangeRate = createForm.currency_code !== defaultCurrency

  const filteredInvoices = useMemo(() => {
    let result = invoices
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter((inv) => inv.invoice_number?.toLowerCase().includes(q))
    }
    if (statusFilter !== "all") {
      result = result.filter((inv) => inv.status === statusFilter)
    }
    if (typeFilter !== "all") {
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
      setSheetMode(null)
      setCreateForm(emptyInvoiceForm)
      setLineItems([emptyLineItem()])
      toast.success(t("invoices.invoiceCreated"))
    },
    onError: () => {
      toast.error(t("invoices.failedToCreateInvoice"))
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const { error } = await client.PUT("/api/invoices/{id}", {
        params: { path: { id } },
        body: body as unknown as components["schemas"]["CreateInvoiceRequest"],
      })
      if (error) throw new Error("Failed to update invoice")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      setSheetMode(null)
      setEditingInvoice(null)
      setCreateForm(emptyInvoiceForm)
      setLineItems([emptyLineItem()])
      toast.success(t("invoices.invoiceUpdated"))
    },
    onError: () => {
      toast.error(t("invoices.failedToUpdateInvoice"))
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
      setConfirmDeleteInvoice(null)
      toast.success(t("invoices.invoiceDeleted"))
    },
    onError: () => {
      setConfirmDeleteInvoice(null)
      toast.error(t("invoices.failedToDeleteInvoice"))
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
      toast.success(t("invoices.statusUpdated"))
    },
    onError: () => {
      toast.error(t("invoices.failedToUpdateStatus"))
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

  const creditLimitWarning = useMemo(() => {
    if (!createForm.contact_id) return null
    const contact = contacts.find((c: Contact) => c.id === createForm.contact_id)
    if (!contact || contact.credit_limit == null) return null

    const currentBalance = contact.balance ?? 0
    const projectedBalance =
      createForm.invoice_type === "purchase"
        ? currentBalance - grandTotal
        : currentBalance + grandTotal

    if (Math.abs(projectedBalance) <= contact.credit_limit) return null

    return {
      contactName: contact.name,
      projectedBalance,
      creditLimit: contact.credit_limit,
    }
  }, [createForm.contact_id, createForm.invoice_type, contacts, grandTotal])

  function buildInvoiceBody() {
    const items = lineItems.map(({ id: _id, ...item }) => ({
      ...item,
      line_total: computeLineTotal(item),
    }))

    const exchangeRate = showExchangeRate ? Number(createForm.exchange_rate) || 1 : 1

    return {
      invoice_type: createForm.invoice_type,
      ...(createForm.contact_id && { contact_id: createForm.contact_id }),
      date: createForm.date,
      ...(createForm.due_date && { due_date: createForm.due_date }),
      currency_code: createForm.currency_code,
      exchange_rate: exchangeRate,
      ...(createForm.notes && { notes: createForm.notes }),
      line_items: items,
      subtotal,
      tax_total: taxTotal,
      grand_total: grandTotal,
      base_currency_total: grandTotal * exchangeRate,
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const validation = invoiceSchema.safeParse({
      contact_id: createForm.contact_id,
      invoice_type: createForm.invoice_type,
      items: lineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
      })),
    })
    if (!validation.success) {
      const firstError = validation.error.errors[0]
      toast.error(firstError?.message ?? "Validation error")
      return
    }
    createMutation.mutate(buildInvoiceBody())
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingInvoice) return
    const validation = invoiceSchema.safeParse({
      contact_id: createForm.contact_id,
      invoice_type: createForm.invoice_type,
      items: lineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
      })),
    })
    if (!validation.success) {
      const firstError = validation.error.errors[0]
      toast.error(firstError?.message ?? "Validation error")
      return
    }
    updateMutation.mutate({
      id: editingInvoice.id,
      body: buildInvoiceBody(),
    })
  }

  function openEditSheet(invoice: Invoice) {
    setEditingInvoice(invoice)
    setCreateForm({
      invoice_type: invoice.invoice_type ?? "sales",
      contact_id: invoice.contact_id ?? "",
      date: invoice.date ?? todayStr(),
      due_date: invoice.due_date ?? "",
      currency_code: invoice.currency_code ?? "TRY",
      exchange_rate: invoice.exchange_rate?.toString() ?? "1",
      notes: invoice.notes ?? "",
    })
    const rawItems = (invoice.line_items ?? []) as Array<{
      description?: string
      quantity?: number
      unit_price?: number
      vat_rate?: number
    }>
    const existingItems: LineItem[] = rawItems.map((item) => ({
      id: crypto.randomUUID(),
      description: item.description ?? "",
      quantity: item.quantity ?? 1,
      unit_price: item.unit_price ?? 0,
      vat_rate: item.vat_rate ?? 0,
      line_total: (item.quantity ?? 1) * (item.unit_price ?? 0),
    }))
    setLineItems(existingItems.length > 0 ? existingItems : [emptyLineItem()])
    setSheetMode("edit")
  }

  function handleStatusChange(invoiceId: string, status: string) {
    statusMutation.mutate({ id: invoiceId, status })
  }

  const columns = useMemo(
    () => [
      {
        id: "invoice_number",
        header: t("invoices.invoiceNumber"),
        cell: (row: Invoice) => <span className="font-medium">{row.invoice_number}</span>,
      },
      {
        id: "contact",
        header: t("common.contact"),
        cell: (row: Invoice) =>
          contacts.find((c: Contact) => c.id === row.contact_id)?.name ?? "\u2014",
      },
      {
        id: "type",
        header: t("common.type"),
        cell: (row: Invoice) =>
          row.invoice_type
            ? row.invoice_type.charAt(0).toUpperCase() + row.invoice_type.slice(1)
            : "\u2014",
      },
      {
        id: "date",
        header: t("common.date"),
        cell: (row: Invoice) => (
          <span className="text-muted-foreground">{formatDate(row.date)}</span>
        ),
      },
      {
        id: "due_date",
        header: t("invoices.dueDate"),
        cell: (row: Invoice) => (
          <span className="text-muted-foreground">{formatDate(row.due_date ?? null)}</span>
        ),
      },
      {
        id: "total",
        header: <span className="text-right block">{t("common.total")}</span>,
        cell: (row: Invoice) => (
          <span className="tabular-nums">{formatCurrency(row.grand_total)}</span>
        ),
        className: "text-right",
      },
      {
        id: "status",
        header: t("common.status"),
        cell: (row: Invoice) => (
          <Badge className={statusColor[row.status] ?? "bg-muted text-muted-foreground"}>
            {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
          </Badge>
        ),
      },
    ],
    [contacts, t]
  )

  const hasValidLineItems =
    lineItems.length > 0 &&
    lineItems.every((item) => item.description.trim() && item.quantity > 0 && item.unit_price > 0)

  return (
    <>
      <PageHeader title={t("invoices.title")} description={t("invoices.description")}>
        <Button
          onClick={() => {
            setCreateForm(emptyInvoiceForm)
            setLineItems([emptyLineItem()])
            setEditingInvoice(null)
            setSheetMode("create")
          }}
        >
          {t("invoices.newInvoice")}
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
              placeholder={t("invoices.searchInvoices")}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
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
          <AdvancedSelect
            options={typeOptions}
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v ?? "all")}
            placeholder={t("common.type")}
            searchable={false}
            className="w-36"
          />
        </div>

        <DataTable
          columns={columns}
          data={filteredInvoices}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage={t("invoices.noInvoicesFound")}
          onRowClick={openEditSheet}
          rowActions={(row) => (
            <>
              <DropdownMenuItem onClick={() => openEditSheet(row)}>
                {t("common.edit")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {invoiceStatuses.map((s) => (
                <DropdownMenuItem
                  key={s}
                  disabled={row.status === s}
                  onClick={() => handleStatusChange(row.id, s)}
                >
                  {t("invoices.markAs", {
                    status: s.charAt(0).toUpperCase() + s.slice(1),
                  })}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmDeleteInvoice(row)}>
                {t("common.delete")}
              </DropdownMenuItem>
            </>
          )}
        />
      </div>

      {/* Delete Confirmation */}
      {confirmDeleteInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg border bg-background p-6 shadow-lg max-w-sm w-full mx-4">
            <p className="text-sm mb-4">
              {t("invoices.confirmDelete", {
                number: confirmDeleteInvoice.invoice_number,
              })}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDeleteInvoice(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteMutation.mutate(confirmDeleteInvoice.id)}
                disabled={deleteMutation.isPending}
              >
                {t("common.delete")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Sheet
        open={sheetMode !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSheetMode(null)
            setEditingInvoice(null)
          }
        }}
      >
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {sheetMode === "edit" ? t("invoices.editInvoice") : t("invoices.createInvoice")}
            </SheetTitle>
          </SheetHeader>
          <form
            onSubmit={sheetMode === "edit" ? handleEdit : handleCreate}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <SheetBody>
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="invoice_type">{t("common.type")}</Label>
                  <Select
                    value={createForm.invoice_type}
                    onValueChange={(val) =>
                      setCreateForm((f) => ({
                        ...f,
                        invoice_type: val as string,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales">{t("invoices.sales")}</SelectItem>
                      <SelectItem value="purchase">{t("invoices.purchase")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="contact_id">{t("common.contact")}</Label>
                  <Select
                    value={createForm.contact_id}
                    onValueChange={(val) =>
                      setCreateForm((f) => ({
                        ...f,
                        contact_id: val as string,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("invoices.selectContactOptional")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{t("common.none")}</SelectItem>
                      {contacts.map((c: Contact) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {creditLimitWarning && (
                  <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
                    {t("invoices.creditLimitWarning", {
                      name: creditLimitWarning.contactName,
                      projected: formatCurrency(creditLimitWarning.projectedBalance),
                      limit: formatCurrency(creditLimitWarning.creditLimit),
                    })}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="date">{t("common.date")} *</Label>
                    <Input
                      id="date"
                      type="date"
                      value={createForm.date}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          date: e.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="due_date">{t("invoices.dueDate")}</Label>
                    <Input
                      id="due_date"
                      type="date"
                      value={createForm.due_date}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          due_date: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="currency_code">{t("invoices.currency")}</Label>
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

                {showExchangeRate && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="exchange_rate">{t("invoices.exchangeRate")}</Label>
                    <Input
                      id="exchange_rate"
                      type="number"
                      step="0.0001"
                      min="0"
                      value={createForm.exchange_rate}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          exchange_rate: e.target.value,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("invoices.exchangeRateDescription", {
                        from: createForm.currency_code,
                        rate: createForm.exchange_rate,
                        to: defaultCurrency,
                      })}
                    </p>
                  </div>
                )}

                <div className="grid gap-1.5">
                  <Label htmlFor="notes">{t("common.notes")}</Label>
                  <Textarea
                    id="notes"
                    value={createForm.notes}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        notes: e.target.value,
                      }))
                    }
                  />
                </div>

                {/* Line Items */}
                <div className="grid gap-2">
                  <Label>{t("invoices.lineItems")}</Label>
                  <div className="space-y-3">
                    {lineItems.map((item, index) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-[1fr_4rem_5rem_4rem_3.5rem_2rem] items-end gap-2 rounded-md border p-2"
                      >
                        <div className="grid gap-1">
                          <span className="text-xs text-muted-foreground">
                            {t("common.description")}
                          </span>
                          <Input
                            placeholder={t("invoices.itemDescription")}
                            value={item.description}
                            onChange={(e) => updateLineItem(index, "description", e.target.value)}
                            required
                          />
                        </div>
                        <div className="grid gap-1">
                          <span className="text-xs text-muted-foreground">{t("invoices.qty")}</span>
                          <Input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateLineItem(index, "quantity", e.target.value)}
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
                            onChange={(e) => updateLineItem(index, "unit_price", e.target.value)}
                            required
                          />
                        </div>
                        <div className="grid gap-1">
                          <span className="text-xs text-muted-foreground">
                            {t("invoices.vatPercent")}
                          </span>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.vat_rate}
                            onChange={(e) => updateLineItem(index, "vat_rate", e.target.value)}
                          />
                        </div>
                        <div className="grid gap-1">
                          <span className="text-xs text-muted-foreground">{t("common.total")}</span>
                          <p className="flex h-8 items-center text-sm font-medium tabular-nums">
                            {formatCurrency(computeLineTotal(item))}
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
                    {t("common.addItem")}
                  </Button>
                </div>

                {/* Totals summary */}
                <div className="rounded-md border p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("common.subtotal")}</span>
                    <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("common.tax")}</span>
                    <span className="tabular-nums">{formatCurrency(taxTotal)}</span>
                  </div>
                  <div className="flex justify-between font-medium border-t pt-1">
                    <span>{t("common.total")}</span>
                    <span className="tabular-nums">{formatCurrency(grandTotal)}</span>
                  </div>
                </div>
              </div>
            </SheetBody>
            <SheetFooter>
              <SheetClose render={<Button variant="outline" />}>{t("common.cancel")}</SheetClose>
              <Button
                type="submit"
                disabled={
                  (sheetMode === "edit" ? updateMutation.isPending : createMutation.isPending) ||
                  !createForm.date ||
                  !hasValidLineItems
                }
              >
                {sheetMode === "edit"
                  ? updateMutation.isPending
                    ? t("common.saving")
                    : t("invoices.saveInvoice")
                  : createMutation.isPending
                    ? t("common.creating")
                    : t("invoices.createInvoice")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
