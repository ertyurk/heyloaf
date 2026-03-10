import type { components } from "@heyloaf/api-client"
import { AdvancedSelect } from "@heyloaf/ui/components/advanced-select"
import { Badge } from "@heyloaf/ui/components/badge"
import { DataTable } from "@heyloaf/ui/components/data-table"
import { Input } from "@heyloaf/ui/components/input"
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { LocalizedDateRangeFilter } from "@/components/localized-date-range-filter"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"
import { useDebounce } from "@/hooks/use-debounce"
import { formatCurrency } from "@/lib/format-currency"
import { formatDate } from "@/lib/format-date"

type Transaction = components["schemas"]["Transaction"]

export const Route = createFileRoute("/_authenticated/transactions")({
  component: TransactionsPage,
})

const typeBadgeClass: Record<string, string> = {
  invoice: "bg-blue-100 text-blue-800",
  payment: "bg-green-100 text-green-800",
  receipt: "bg-purple-100 text-purple-800",
  purchase: "bg-orange-100 text-orange-800",
}

function formatDateOrDash(dateStr: string | null) {
  if (!dateStr) return "\u2014"
  return formatDate(dateStr)
}

function TransactionsPage() {
  const { t } = useTranslation()
  const client = useApi()

  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search)
  const [typeFilter, setTypeFilter] = useState("all")
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

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

  const typeOptions = useMemo(
    () => [
      { value: "all", label: t("transactions.allTypes") },
      { value: "invoice", label: t("transactions.invoice") },
      { value: "payment", label: t("transactions.payment") },
      { value: "receipt", label: t("transactions.receipt") },
      { value: "purchase", label: t("transactions.purchase") },
    ],
    [t]
  )

  // Single API call to GET /api/transactions with server-side filtering
  const { data: transactionsData, isLoading } = useQuery({
    queryKey: ["transactions", debouncedSearch, typeFilter, paymentMethodFilter, dateFrom, dateTo],
    queryFn: async () => {
      const query: Record<string, string> = {}
      if (debouncedSearch) query.search = debouncedSearch
      if (typeFilter !== "all") query.type = typeFilter
      if (paymentMethodFilter !== "all") query.payment_method_id = paymentMethodFilter
      if (dateFrom) query.date_from = dateFrom.slice(0, 10)
      if (dateTo) query.date_to = dateTo.slice(0, 10)
      const res = await client.GET(
        "/api/transactions" as never,
        {
          params: { query },
        } as never
      )
      return (res as { data?: { data?: Transaction[] } }).data
    },
  })

  const transactions = (transactionsData?.data ?? []) as Transaction[]

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }, [transactions])

  const columns = useMemo(
    () => [
      {
        id: "date",
        header: t("common.date"),
        cell: (row: Transaction) => (
          <span className="text-muted-foreground">{formatDateOrDash(row.date)}</span>
        ),
      },
      {
        id: "contact",
        header: t("common.contact"),
        cell: (row: Transaction) => contacts.find((c) => c.id === row.contact_id)?.name ?? "\u2014",
      },
      {
        id: "type",
        header: t("common.type"),
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
        header: <span className="text-right block">{t("common.amount")}</span>,
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
        header: t("dashboard.paymentMethod"),
        cell: (row: Transaction) =>
          paymentMethods.find((pm) => pm.id === row.payment_method_id)?.name ?? "\u2014",
      },
      {
        id: "reference",
        header: t("transactions.reference"),
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
        header: <span className="text-right block">{t("transactions.balanceAfter")}</span>,
        cell: (row: Transaction) => (
          <span className="tabular-nums">{formatCurrency(row.balance_after)}</span>
        ),
        className: "text-right",
      },
      {
        id: "description",
        header: t("common.description"),
        cell: (row: Transaction) => (
          <span className="text-muted-foreground truncate max-w-[200px] block">
            {row.description ?? "\u2014"}
          </span>
        ),
      },
    ],
    [contacts, paymentMethods, t]
  )

  return (
    <>
      <PageHeader title={t("transactions.title")} description={t("transactions.description")} />

      <div className="space-y-4 p-6">
        <div className="flex items-center gap-4">
          <div className="relative max-w-xs flex-1">
            <HugeiconsIcon
              icon={Search01Icon}
              size={16}
              className="text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2"
            />
            <Input
              placeholder={t("transactions.searchByDescription")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <AdvancedSelect
            options={typeOptions}
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v ?? "all")}
            placeholder={t("common.type")}
            searchable={false}
            className="w-40"
          />
          <AdvancedSelect
            options={[
              { value: "all", label: t("transactions.allMethods") },
              ...paymentMethods.map((pm) => ({ value: pm.id, label: pm.name })),
            ]}
            value={paymentMethodFilter}
            onValueChange={(val) => setPaymentMethodFilter(val ?? "all")}
            placeholder={t("dashboard.paymentMethod")}
            className="w-44"
          />
          <LocalizedDateRangeFilter
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
          data={sortedTransactions}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage={t("transactions.noTransactionsFound")}
        />
      </div>
    </>
  )
}
