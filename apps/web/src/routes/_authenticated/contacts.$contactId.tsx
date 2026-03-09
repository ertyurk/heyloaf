import type { components } from "@heyloaf/api-client"
import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@heyloaf/ui/components/card"
import { DataTable } from "@heyloaf/ui/components/data-table"
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
import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"
import { formatCurrency } from "@/lib/format-currency"

type Transaction = components["schemas"]["Transaction"]

export const Route = createFileRoute("/_authenticated/contacts/$contactId")({
  component: ContactDetailPage,
})

function formatDate(dateStr: string | null) {
  if (!dateStr) return "\u2014"
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

const typeBadgeClass: Record<string, string> = {
  invoice: "bg-blue-100 text-blue-800",
  payment: "bg-green-100 text-green-800",
  receipt: "bg-purple-100 text-purple-800",
  purchase: "bg-orange-100 text-orange-800",
}

const emptyPaymentForm = {
  amount: "",
  payment_method_id: "",
  date: new Date().toISOString().slice(0, 10),
  description: "",
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function exportToCsv(
  transactions: Transaction[],
  paymentMethods: { id: string; name: string }[],
  contactName: string
) {
  const headers = ["Date", "Type", "Description", "Amount", "Balance After", "Payment Method"]
  const rows = transactions.map((t) => [
    t.date ?? "",
    t.transaction_type ?? "",
    t.description ?? "",
    String(t.amount ?? 0),
    String(t.balance_after ?? 0),
    paymentMethods.find((pm) => pm.id === t.payment_method_id)?.name ?? "",
  ])

  const csvContent = [headers, ...rows].map((row) => row.map(escapeCsvField).join(",")).join("\n")

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${contactName.replace(/[^a-zA-Z0-9]/g, "_")}_statement.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function ContactDetailPage() {
  const { t } = useTranslation()
  const { contactId } = Route.useParams()
  const client = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm)

  const { data: contactData } = useQuery({
    queryKey: ["contacts", contactId],
    queryFn: async () => {
      const res = await client.GET("/api/contacts/{id}", {
        params: { path: { id: contactId } },
      })
      return res.data
    },
  })

  const { data: transactionsData, isLoading } = useQuery({
    queryKey: ["contact-transactions", contactId],
    queryFn: async () => {
      const res = await client.GET("/api/contacts/{id}/transactions", {
        params: { path: { id: contactId } },
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

  const contact = contactData?.data
  const transactions: Transaction[] = (transactionsData?.data ?? []) as Transaction[]
  const paymentMethods = paymentMethodsData?.data ?? []

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }, [transactions])

  const recordPaymentMutation = useMutation({
    mutationFn: async (body: components["schemas"]["RecordPaymentRequest"]) => {
      const res = await client.POST("/api/contacts/{id}/payment", {
        params: { path: { id: contactId } },
        body,
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["contact-transactions", contactId],
      })
      queryClient.invalidateQueries({ queryKey: ["contacts", contactId] })
      queryClient.invalidateQueries({ queryKey: ["contacts"] })
      setPaymentOpen(false)
      setPaymentForm(emptyPaymentForm)
      toast.success(t("contacts.paymentRecorded"))
    },
    onError: () => {
      toast.error(t("contacts.failedToRecordPayment"))
    },
  })

  function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!paymentForm.amount) return
    recordPaymentMutation.mutate({
      amount: Number(paymentForm.amount),
      ...(paymentForm.payment_method_id
        ? { payment_method_id: paymentForm.payment_method_id }
        : {}),
      ...(paymentForm.date ? { date: paymentForm.date } : {}),
      ...(paymentForm.description ? { description: paymentForm.description } : {}),
    })
  }

  const columns = useMemo(
    () => [
      {
        id: "date",
        header: t("common.date"),
        cell: (row: Transaction) => (
          <span className="text-muted-foreground">{formatDate(row.date)}</span>
        ),
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
        header: t("orders.paymentMethod"),
        cell: (row: Transaction) =>
          paymentMethods.find((pm) => pm.id === row.payment_method_id)?.name ?? "\u2014",
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
    [paymentMethods, t]
  )

  return (
    <>
      <PageHeader
        title={contact?.name ?? t("common.contact")}
        description={t("contacts.description")}
      >
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/contacts" })}>
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} className="mr-1" />
          {t("common.back")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportToCsv(sortedTransactions, paymentMethods, contact?.name ?? "contact")
          }
          disabled={sortedTransactions.length === 0}
        >
          {t("common.exportExcel")}
        </Button>
        <Button
          onClick={() => {
            setPaymentForm(emptyPaymentForm)
            setPaymentOpen(true)
          }}
        >
          {t("contacts.recordPayment")}
        </Button>
      </PageHeader>

      <div className="space-y-6 p-6">
        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{t("common.balance")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={`text-2xl font-bold tabular-nums ${
                  (contact?.balance ?? 0) < 0
                    ? "text-destructive"
                    : (contact?.balance ?? 0) > 0
                      ? "text-green-600"
                      : ""
                }`}
              >
                {formatCurrency(contact?.balance ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t("contacts.creditLimit")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">
                {contact?.credit_limit != null ? formatCurrency(contact.credit_limit) : "\u2014"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{t("common.type")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="capitalize">
                {contact?.contact_type ?? "\u2014"}
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{t("common.status")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={contact?.status === "active" ? "default" : "secondary"}>
                {contact?.status
                  ? contact.status.charAt(0).toUpperCase() + contact.status.slice(1)
                  : "\u2014"}
              </Badge>
            </CardContent>
          </Card>
        </div>

        {/* Transaction History */}
        <DataTable
          columns={columns}
          data={sortedTransactions}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage={t("transactions.noTransactionsFound")}
        />
      </div>

      {/* Record Payment Sheet */}
      <Sheet open={paymentOpen} onOpenChange={setPaymentOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("contacts.recordPayment")}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleRecordPayment} className="flex flex-1 flex-col">
            <SheetBody className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="payment-amount">{t("contacts.paymentAmount")}</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="payment-method">{t("pos.paymentMethod")}</Label>
                <Select
                  value={paymentForm.payment_method_id}
                  onValueChange={(val) =>
                    setPaymentForm((f) => ({
                      ...f,
                      payment_method_id: val as string,
                    }))
                  }
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
                <Label htmlFor="payment-date">{t("common.date")}</Label>
                <Input
                  id="payment-date"
                  type="date"
                  value={paymentForm.date}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="payment-description">{t("common.description")}</Label>
                <Textarea
                  id="payment-description"
                  value={paymentForm.description}
                  onChange={(e) =>
                    setPaymentForm((f) => ({
                      ...f,
                      description: e.target.value,
                    }))
                  }
                />
              </div>
            </SheetBody>
            <SheetFooter>
              <Button variant="outline" type="button" onClick={() => setPaymentOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={!paymentForm.amount || recordPaymentMutation.isPending}
              >
                {recordPaymentMutation.isPending
                  ? t("contacts.recording")
                  : t("contacts.recordPayment")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
