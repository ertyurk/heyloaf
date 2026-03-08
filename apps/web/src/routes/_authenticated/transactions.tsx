import type { components } from "@heyloaf/api-client"
import { AdvancedSelect } from "@heyloaf/ui/components/advanced-select"
import { Badge } from "@heyloaf/ui/components/badge"
import { DataTable } from "@heyloaf/ui/components/data-table"
import { DateRangeFilter } from "@heyloaf/ui/components/date-range-filter"
import { Input } from "@heyloaf/ui/components/input"
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useRef, useState } from "react"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

type Transaction = components["schemas"]["Transaction"]
type Contact = components["schemas"]["Contact"]

export const Route = createFileRoute("/_authenticated/transactions")({
  component: TransactionsPage,
})

const typeOptions = [
  { value: "__all__", label: "All Types" },
  { value: "invoice", label: "Invoice" },
  { value: "payment", label: "Payment" },
  { value: "receipt", label: "Receipt" },
  { value: "purchase", label: "Purchase" },
]

const typeBadgeClass: Record<string, string> = {
  invoice: "bg-blue-100 text-blue-800",
  payment: "bg-green-100 text-green-800",
  receipt: "bg-purple-100 text-purple-800",
  purchase: "bg-orange-100 text-orange-800",
}

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

function TransactionsPage() {
  const client = useApi()

  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const [typeFilter, setTypeFilter] = useState("__all__")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  function handleSearchChange(value: string) {
    setSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 300)
  }

  const { data: contactsData } = useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const res = await client.GET("/api/contacts")
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

  const contacts = contactsData?.data ?? []
  const paymentMethods = paymentMethodsData?.data ?? []

  // Fetch transactions for all contacts and merge
  const { data: allTransactions, isLoading } = useQuery({
    queryKey: ["transactions", contacts.map((c) => c.id)],
    queryFn: async () => {
      if (contacts.length === 0) return []
      const results = await Promise.all(
        contacts.map(async (contact) => {
          const res = await client.GET("/api/contacts/{id}/transactions", {
            params: { path: { id: contact.id } },
          })
          return res.data?.data ?? []
        })
      )
      return results.flat()
    },
    enabled: contacts.length > 0,
  })

  const transactions = allTransactions ?? []

  const filteredTransactions = useMemo(() => {
    let result = transactions
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter((t) => t.description?.toLowerCase().includes(q))
    }
    if (typeFilter !== "__all__") {
      result = result.filter((t) => t.transaction_type === typeFilter)
    }
    if (dateFrom) {
      result = result.filter((t) => t.date >= dateFrom.slice(0, 10))
    }
    if (dateTo) {
      result = result.filter((t) => t.date <= dateTo.slice(0, 10))
    }
    // Sort by date descending
    result = [...result].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    return result
  }, [transactions, debouncedSearch, typeFilter, dateFrom, dateTo])

  const columns = useMemo(
    () => [
      {
        id: "date",
        header: "Date",
        cell: (row: Transaction) => (
          <span className="text-muted-foreground">{formatDate(row.date)}</span>
        ),
      },
      {
        id: "contact",
        header: "Contact",
        cell: (row: Transaction) =>
          contacts.find((c: Contact) => c.id === row.contact_id)?.name ?? "\u2014",
      },
      {
        id: "type",
        header: "Type",
        cell: (row: Transaction) => (
          <Badge
            className={typeBadgeClass[row.transaction_type] ?? "bg-muted text-muted-foreground"}
          >
            {row.transaction_type.charAt(0).toUpperCase() + row.transaction_type.slice(1)}
          </Badge>
        ),
      },
      {
        id: "amount",
        header: <span className="text-right block">Amount</span>,
        cell: (row: Transaction) => {
          const isNegative = row.amount < 0
          return (
            <span className={`tabular-nums ${isNegative ? "text-destructive" : "text-green-600"}`}>
              {formatCurrency(row.amount)}
            </span>
          )
        },
        className: "text-right",
      },
      {
        id: "payment_method",
        header: "Payment Method",
        cell: (row: Transaction) =>
          paymentMethods.find((pm) => pm.id === row.payment_method_id)?.name ?? "\u2014",
      },
      {
        id: "reference",
        header: "Reference",
        cell: (row: Transaction) => (
          <span className="text-muted-foreground text-xs">
            {row.reference_id
              ? `${row.reference_type ?? ""}#${row.reference_id.slice(0, 8)}`
              : "\u2014"}
          </span>
        ),
      },
      {
        id: "balance_after",
        header: <span className="text-right block">Balance After</span>,
        cell: (row: Transaction) => (
          <span className="tabular-nums">{formatCurrency(row.balance_after)}</span>
        ),
        className: "text-right",
      },
      {
        id: "description",
        header: "Description",
        cell: (row: Transaction) => (
          <span className="text-muted-foreground truncate max-w-[200px] block">
            {row.description ?? "\u2014"}
          </span>
        ),
      },
    ],
    [contacts, paymentMethods]
  )

  return (
    <>
      <PageHeader title="Transactions" description="Financial transaction history" />

      <div className="space-y-4 p-6">
        <div className="flex items-center gap-4">
          <div className="relative max-w-xs flex-1">
            <HugeiconsIcon
              icon={Search01Icon}
              size={16}
              className="text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2"
            />
            <Input
              placeholder="Search by description..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-8"
            />
          </div>
          <AdvancedSelect
            options={typeOptions}
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v ?? "__all__")}
            placeholder="Type"
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

        <DataTable
          columns={columns}
          data={filteredTransactions}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No transactions found."
        />
      </div>
    </>
  )
}
