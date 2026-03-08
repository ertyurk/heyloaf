import type { components } from "@heyloaf/api-client"
import { AdvancedSelect } from "@heyloaf/ui/components/advanced-select"
import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { Card, CardContent } from "@heyloaf/ui/components/card"
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
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@heyloaf/ui/components/sheet"
import { Textarea } from "@heyloaf/ui/components/textarea"
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"
import { formatCurrency } from "@/lib/format-currency"

type Contact = components["schemas"]["Contact"]

export const Route = createFileRoute("/_authenticated/contacts")({
  component: ContactsPage,
})

const typeBadgeClasses: Record<string, string> = {
  customer: "text-blue-600 border-blue-300",
  supplier: "text-orange-600 border-orange-300",
  both: "text-purple-600 border-purple-300",
}

const emptyForm = {
  name: "",
  contact_type: "customer" as string,
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  tax_number: "",
  tax_office: "",
  credit_limit: "",
  notes: "",
  status: "active",
}

function ContactFormFields({
  form,
  setForm,
  showStatus = false,
}: {
  form: typeof emptyForm
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>
  showStatus?: boolean
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="contact_type">Type</Label>
        <Select
          value={form.contact_type}
          onValueChange={(val) => setForm((f) => ({ ...f, contact_type: val as string }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="customer">Customer</SelectItem>
            <SelectItem value="supplier">Supplier</SelectItem>
            <SelectItem value="both">Both</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="contact_person">Contact Person</Label>
        <Input
          id="contact_person"
          value={form.contact_person}
          onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="address">Address</Label>
        <Textarea
          id="address"
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="tax_number">Tax Number</Label>
          <Input
            id="tax_number"
            value={form.tax_number}
            onChange={(e) => setForm((f) => ({ ...f, tax_number: e.target.value }))}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tax_office">Tax Office</Label>
          <Input
            id="tax_office"
            value={form.tax_office}
            onChange={(e) => setForm((f) => ({ ...f, tax_office: e.target.value }))}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="credit_limit">Credit Limit</Label>
        <Input
          id="credit_limit"
          type="number"
          value={form.credit_limit}
          onChange={(e) => setForm((f) => ({ ...f, credit_limit: e.target.value }))}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
      </div>
      {showStatus && (
        <div className="grid gap-1.5">
          <Label htmlFor="status">Status</Label>
          <Select
            value={form.status}
            onValueChange={(val) => setForm((f) => ({ ...f, status: val as string }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

function buildContactBody(form: typeof emptyForm) {
  return {
    name: form.name,
    contact_type: form.contact_type,
    ...(form.contact_person && { contact_person: form.contact_person }),
    ...(form.phone && { phone: form.phone }),
    ...(form.email && { email: form.email }),
    ...(form.address && { address: form.address }),
    ...(form.tax_number && { tax_number: form.tax_number }),
    ...(form.tax_office && { tax_office: form.tax_office }),
    ...(form.credit_limit && { credit_limit: Number(form.credit_limit) }),
    ...(form.notes && { notes: form.notes }),
  }
}

const typeFilterOptions = [
  { value: "all", label: "All Types" },
  { value: "supplier", label: "Supplier" },
  { value: "customer", label: "Customer" },
  { value: "both", label: "Both" },
]

const statusFilterOptions = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
]

function computeFinancialSummary(allContacts: Contact[]) {
  let totalReceivables = 0
  let totalPayables = 0
  const typeCounts = { customers: 0, suppliers: 0, both: 0 }
  const typeMap: Record<string, keyof typeof typeCounts> = {
    customer: "customers",
    supplier: "suppliers",
    both: "both",
  }

  for (const c of allContacts) {
    const balance = c.balance ?? 0
    if (balance > 0) totalReceivables += balance
    if (balance < 0) totalPayables += Math.abs(balance)
    const key = typeMap[c.contact_type]
    if (key) typeCounts[key]++
  }

  return {
    totalReceivables,
    totalPayables,
    netCashFlow: totalReceivables - totalPayables,
    ...typeCounts,
  }
}

function ContactsPage() {
  const client = useApi()
  const queryClient = useQueryClient()

  const [sheetMode, setSheetMode] = useState<"create" | "edit" | null>(null)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)

  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentContact, setPaymentContact] = useState<Contact | null>(null)
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    payment_method: "cash",
    date: new Date().toISOString().slice(0, 10),
    description: "",
  })

  const [createForm, setCreateForm] = useState(emptyForm)
  const [editForm, setEditForm] = useState(emptyForm)

  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [debouncedSearch, setDebouncedSearch] = useState("")

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearch(value)
    clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value)
    }, 300)
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const res = await client.GET("/api/contacts")
      return res.data
    },
  })

  const allContacts = data?.data ?? []

  const financialSummary = useMemo(() => computeFinancialSummary(allContacts), [allContacts])

  const contacts = useMemo(() => {
    let filtered = allContacts

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      filtered = filtered.filter(
        (c) => c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
      )
    }

    if (typeFilter !== "all") {
      filtered = filtered.filter((c) => c.contact_type === typeFilter)
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((c) => c.status === statusFilter)
    }

    return filtered
  }, [allContacts, debouncedSearch, typeFilter, statusFilter])

  const createMutation = useMutation({
    mutationFn: async (body: ReturnType<typeof buildContactBody>) => {
      const res = await client.POST("/api/contacts", { body })
      if (!res.data) throw new Error("Failed to create contact")
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] })
      setSheetMode(null)
      setCreateForm(emptyForm)
      toast.success("Contact created")
    },
    onError: () => {
      toast.error("Failed to create contact")
    },
  })

  const editMutation = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string
      body: ReturnType<typeof buildContactBody> & { status: string }
    }) => {
      const res = await client.PUT("/api/contacts/{id}", {
        params: { path: { id } },
        body,
      })
      if (!res.data) throw new Error("Failed to update contact")
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] })
      setSheetMode(null)
      setEditingContact(null)
      toast.success("Contact updated")
    },
    onError: () => {
      toast.error("Failed to update contact")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await client.DELETE("/api/contacts/{id}", {
        params: { path: { id } },
      })
      if (!res.data) throw new Error("Failed to delete contact")
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] })
      toast.success("Contact deleted")
    },
    onError: () => {
      toast.error("Failed to delete contact")
    },
  })

  const paymentMutation = useMutation({
    mutationFn: async ({
      contactId,
      body,
    }: {
      contactId: string
      body: { amount: number; payment_method: string; date: string; description?: string }
    }) => {
      const { error } = await client.POST("/api/contacts/{id}/payment", {
        params: { path: { id: contactId } },
        body,
      })
      if (error) throw new Error("Failed to record payment")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] })
      queryClient.invalidateQueries({ queryKey: ["transactions"] })
      setPaymentOpen(false)
      setPaymentContact(null)
      setPaymentForm({
        amount: "",
        payment_method: "cash",
        date: new Date().toISOString().slice(0, 10),
        description: "",
      })
      toast.success("Payment recorded")
    },
    onError: () => {
      toast.error("Failed to record payment")
    },
  })

  function openPaymentSheet(contact: Contact) {
    setPaymentContact(contact)
    setPaymentForm({
      amount: "",
      payment_method: "cash",
      date: new Date().toISOString().slice(0, 10),
      description: "",
    })
    setPaymentOpen(true)
  }

  function handlePaymentSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!paymentContact) return
    paymentMutation.mutate({
      contactId: paymentContact.id,
      body: {
        amount: Number(paymentForm.amount),
        payment_method: paymentForm.payment_method,
        date: paymentForm.date,
        ...(paymentForm.description && { description: paymentForm.description }),
      },
    })
  }

  function openEdit(contact: Contact) {
    setEditingContact(contact)
    setEditForm({
      name: contact.name ?? "",
      contact_type: contact.contact_type ?? "customer",
      contact_person: contact.contact_person ?? "",
      phone: contact.phone ?? "",
      email: contact.email ?? "",
      address: contact.address ?? "",
      tax_number: contact.tax_number ?? "",
      tax_office: contact.tax_office ?? "",
      credit_limit: contact.credit_limit?.toString() ?? "",
      notes: contact.notes ?? "",
      status: contact.status ?? "active",
    })
    setSheetMode("edit")
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!createForm.name.trim()) return
    createMutation.mutate(buildContactBody(createForm))
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingContact || !editForm.name.trim()) return
    editMutation.mutate({
      id: editingContact.id,
      body: { ...buildContactBody(editForm), status: editForm.status },
    })
  }

  function handleDelete(contact: Contact) {
    if (!window.confirm(`Delete "${contact.name}"?`)) return
    deleteMutation.mutate(contact.id)
  }

  const columns = useMemo(
    () => [
      {
        id: "name",
        header: "Name",
        cell: (row: Contact) => <span className="font-medium">{row.name}</span>,
      },
      {
        id: "type",
        header: "Type",
        cell: (row: Contact) => (
          <Badge
            variant="outline"
            className={typeBadgeClasses[row.contact_type] ?? "text-gray-600 border-gray-300"}
          >
            {row.contact_type}
          </Badge>
        ),
      },
      {
        id: "phone",
        header: "Phone",
        cell: (row: Contact) => (
          <span className="text-muted-foreground">{row.phone ?? "\u2014"}</span>
        ),
      },
      {
        id: "email",
        header: "Email",
        cell: (row: Contact) => (
          <span className="text-muted-foreground">{row.email ?? "\u2014"}</span>
        ),
      },
      {
        id: "balance",
        header: "Balance",
        className: "text-right",
        cell: (row: Contact) => {
          const amount = row.balance ?? 0
          return (
            <span
              className={`tabular-nums ${amount < 0 ? "text-destructive" : amount > 0 ? "text-green-600" : "text-muted-foreground"}`}
            >
              {formatCurrency(amount)}
            </span>
          )
        },
      },
      {
        id: "status",
        header: "Status",
        cell: (row: Contact) => <Badge variant="outline">{row.status}</Badge>,
      },
    ],
    []
  )

  const isSheetOpen = sheetMode !== null

  return (
    <>
      <PageHeader title="Contacts" description="Manage your contacts">
        <Button
          onClick={() => {
            setCreateForm(emptyForm)
            setSheetMode("create")
          }}
        >
          New Contact
        </Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Receivables</p>
              <p className="text-xl font-bold text-green-600">
                {formatCurrency(financialSummary.totalReceivables)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Payables</p>
              <p className="text-xl font-bold text-destructive">
                {formatCurrency(financialSummary.totalPayables)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Net Cash Flow</p>
              <p
                className={`text-xl font-bold ${financialSummary.netCashFlow >= 0 ? "text-green-600" : "text-destructive"}`}
              >
                {formatCurrency(financialSummary.netCashFlow)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Contacts</p>
              <p className="text-sm text-muted-foreground mt-1">
                <span className="text-blue-600 font-medium">{financialSummary.customers}</span>{" "}
                customers /{" "}
                <span className="text-orange-600 font-medium">{financialSummary.suppliers}</span>{" "}
                suppliers /{" "}
                <span className="text-purple-600 font-medium">{financialSummary.both}</span> both
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <HugeiconsIcon
              icon={Search01Icon}
              size={16}
              className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
            />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={handleSearchChange}
              className="pl-9"
            />
          </div>
          <AdvancedSelect
            options={typeFilterOptions}
            value={typeFilter}
            onValueChange={(val) => setTypeFilter(val ?? "all")}
            searchable={false}
            placeholder="Type"
            className="w-36"
          />
          <AdvancedSelect
            options={statusFilterOptions}
            value={statusFilter}
            onValueChange={(val) => setStatusFilter(val ?? "all")}
            searchable={false}
            placeholder="Status"
            className="w-36"
          />
        </div>

        <DataTable
          columns={columns}
          data={contacts}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No contacts found."
          onRowClick={openEdit}
          rowActions={(row) => (
            <>
              <DropdownMenuItem onClick={() => openEdit(row)}>Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openPaymentSheet(row)}>
                Record Payment
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => handleDelete(row)}>
                Delete
              </DropdownMenuItem>
            </>
          )}
        />
      </div>

      {/* Create / Edit Contact Sheet */}
      <Sheet
        open={isSheetOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSheetMode(null)
            setEditingContact(null)
          }
        }}
      >
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{sheetMode === "create" ? "New Contact" : "Edit Contact"}</SheetTitle>
            <SheetDescription>
              {sheetMode === "create"
                ? "Add a new contact to your list."
                : `Editing ${editingContact?.name ?? "contact"}.`}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={sheetMode === "create" ? handleCreate : handleEdit} className="contents">
            <SheetBody>
              <ContactFormFields
                form={sheetMode === "create" ? createForm : editForm}
                setForm={sheetMode === "create" ? setCreateForm : setEditForm}
                showStatus={sheetMode === "edit"}
              />
            </SheetBody>
            <SheetFooter>
              <Button variant="outline" type="button" onClick={() => setSheetMode(null)}>
                Cancel
              </Button>
              {sheetMode === "create" ? (
                <Button
                  type="submit"
                  disabled={createMutation.isPending || !createForm.name.trim()}
                >
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
              ) : (
                <Button type="submit" disabled={editMutation.isPending || !editForm.name.trim()}>
                  {editMutation.isPending ? "Saving..." : "Save"}
                </Button>
              )}
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Record Payment Sheet */}
      <Sheet open={paymentOpen} onOpenChange={setPaymentOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Record Payment</SheetTitle>
            <SheetDescription>
              Record a payment for {paymentContact?.name ?? "contact"}.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handlePaymentSubmit} className="contents">
            <SheetBody>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="payment-amount">Amount *</Label>
                  <Input
                    id="payment-amount"
                    type="number"
                    step="0.01"
                    required
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="payment-method">Payment Method</Label>
                  <Select
                    value={paymentForm.payment_method}
                    onValueChange={(val) =>
                      setPaymentForm((f) => ({ ...f, payment_method: val as string }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="credit_card">Credit Card</SelectItem>
                      <SelectItem value="check">Check</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="payment-date">Date *</Label>
                  <Input
                    id="payment-date"
                    type="date"
                    required
                    value={paymentForm.date}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, date: e.target.value }))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="payment-description">Description</Label>
                  <Textarea
                    id="payment-description"
                    value={paymentForm.description}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
              </div>
            </SheetBody>
            <SheetFooter>
              <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
              <Button type="submit" disabled={paymentMutation.isPending || !paymentForm.amount}>
                {paymentMutation.isPending ? "Recording..." : "Record Payment"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
