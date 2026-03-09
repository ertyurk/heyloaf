import type { components } from "@heyloaf/api-client"
import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { DataTable } from "@heyloaf/ui/components/data-table"
import { DropdownMenuItem } from "@heyloaf/ui/components/dropdown-menu"
import { Input } from "@heyloaf/ui/components/input"
import { Label } from "@heyloaf/ui/components/label"
import { Separator } from "@heyloaf/ui/components/separator"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@heyloaf/ui/components/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@heyloaf/ui/components/table"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"
import { formatCurrency } from "@/lib/format-currency"

type Shift = components["schemas"]["Shift"]

interface PaymentMethodSummary {
  method_name: string
  count: number
  total: number
}

interface ZReport {
  shift_id: string
  cashier_name: string
  opened_at: string
  closed_at: string | null
  opening_balance: number
  closing_balance: number | null
  total_sales: number
  total_orders: number
  total_items_sold: number
  payment_method_breakdown: PaymentMethodSummary[]
  expected_cash: number
  actual_cash: number | null
  discrepancy: number | null
  voided_orders: number
  returned_orders: number
}

export const Route = createFileRoute("/_authenticated/shifts")({
  component: ShiftsPage,
})

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "\u2014"
  return new Date(iso).toLocaleString()
}

function formatCurrencyOrDash(val: number | null | undefined) {
  if (val == null) return "\u2014"
  return formatCurrency(val)
}

function ShiftsPage() {
  const { t } = useTranslation()
  const client = useApi()
  const queryClient = useQueryClient()

  const [openSheetOpen, setOpenSheetOpen] = useState(false)
  const [closeSheetOpen, setCloseSheetOpen] = useState(false)
  const [openingBalance, setOpeningBalance] = useState("")
  const [closingBalance, setClosingBalance] = useState("")
  const [zReportShiftId, setZReportShiftId] = useState<string | null>(null)

  const { data: currentShiftData, isLoading: currentLoading } = useQuery({
    queryKey: ["shifts", "current"],
    queryFn: async () => {
      const res = await client.GET("/api/shifts/current")
      return res.data
    },
  })

  const currentShift = (currentShiftData as { data?: Shift | null })?.data ?? null

  const { data: shiftsData, isLoading: shiftsLoading } = useQuery({
    queryKey: ["shifts"],
    queryFn: async () => {
      const res = await client.GET("/api/shifts")
      return res.data
    },
  })

  const shifts = (shiftsData as { data?: Shift[] })?.data ?? []

  const { data: zReportData, isLoading: zReportLoading } = useQuery({
    queryKey: ["shifts", zReportShiftId, "z-report"],
    queryFn: async () => {
      if (!zReportShiftId) return null
      const res = await client.GET(
        "/api/shifts/{id}/z-report" as never,
        {
          params: { path: { id: zReportShiftId } },
        } as never
      )
      const data = (res as { data?: { data?: ZReport } }).data
      return data?.data ?? null
    },
    enabled: !!zReportShiftId,
  })

  const openShift = useMutation({
    mutationFn: async () => {
      const { error } = await client.POST("/api/shifts/open", {
        body: { opening_balance: Number(openingBalance) || 0 },
      })
      if (error) throw new Error("Failed to open shift")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] })
      setOpenSheetOpen(false)
      setOpeningBalance("")
      toast.success(t("shifts.shiftOpened"))
    },
    onError: () => {
      toast.error(t("shifts.failedToOpenShift"))
    },
  })

  const closeShift = useMutation({
    mutationFn: async () => {
      if (!currentShift) return
      const { error } = await client.POST("/api/shifts/{id}/close", {
        params: { path: { id: currentShift.id } },
        body: { closing_balance: Number(closingBalance) || 0 },
      })
      if (error) throw new Error("Failed to close shift")
      return currentShift.id
    },
    onSuccess: (shiftId) => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] })
      setCloseSheetOpen(false)
      setClosingBalance("")
      toast.success(t("shifts.shiftClosed"))
      if (shiftId) {
        setZReportShiftId(shiftId)
      }
    },
    onError: () => {
      toast.error(t("shifts.failedToCloseShift"))
    },
  })

  const openZReport = useCallback((shiftId: string) => {
    setZReportShiftId(shiftId)
  }, [])

  const columns = useMemo(
    () => [
      {
        id: "id",
        header: t("shifts.shiftNumber"),
        cell: (row: Shift) => <span className="font-mono text-xs">{row.id.slice(0, 8)}</span>,
      },
      {
        id: "opened_at",
        header: t("shifts.openedAt"),
        cell: (row: Shift) => <span className="text-sm">{formatDateTime(row.opened_at)}</span>,
      },
      {
        id: "closed_at",
        header: t("shifts.closedAt"),
        cell: (row: Shift) => <span className="text-sm">{formatDateTime(row.closed_at)}</span>,
      },
      {
        id: "opening_balance",
        header: t("shifts.openingBalance"),
        cell: (row: Shift) => (
          <span className="tabular-nums">{formatCurrencyOrDash(row.opening_balance)}</span>
        ),
      },
      {
        id: "closing_balance",
        header: t("shifts.closingBalance"),
        cell: (row: Shift) => (
          <span className="tabular-nums">{formatCurrencyOrDash(row.closing_balance)}</span>
        ),
      },
      {
        id: "status",
        header: t("common.status"),
        cell: (row: Shift) => (
          <Badge variant={row.status === "open" ? "default" : "secondary"}>
            {row.status === "open" ? t("shifts.open") : t("shifts.closed")}
          </Badge>
        ),
      },
    ],
    [t]
  )

  return (
    <>
      <PageHeader title={t("shifts.title")} description={t("shifts.description")}>
        {currentShift ? (
          <Button variant="destructive" onClick={() => setCloseSheetOpen(true)}>
            {t("shifts.closeShift")}
          </Button>
        ) : (
          <Button onClick={() => setOpenSheetOpen(true)}>{t("shifts.openShift")}</Button>
        )}
      </PageHeader>

      <div className="space-y-4 p-6">
        {/* Current shift banner */}
        {currentLoading ? null : currentShift ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  {t("shifts.shiftCurrentlyOpen")}
                </p>
                <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                  {t("shifts.openedAtInfo", { time: formatDateTime(currentShift.opened_at) })}{" "}
                  &middot; {t("shifts.openingBalance")}:{" "}
                  {formatCurrencyOrDash(currentShift.opening_balance)}
                  {currentShift.expected_balance != null && (
                    <>
                      {" "}
                      &middot; {t("shifts.expectedBalance")}:{" "}
                      {formatCurrencyOrDash(currentShift.expected_balance)}
                    </>
                  )}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setCloseSheetOpen(true)}>
                {t("shifts.closeShift")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-muted bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{t("shifts.noShiftOpen")}</p>
              <Button size="sm" onClick={() => setOpenSheetOpen(true)}>
                {t("shifts.openShift")}
              </Button>
            </div>
          </div>
        )}

        {/* Shifts table */}
        <DataTable
          columns={columns}
          data={shifts}
          getRowId={(row) => row.id}
          isLoading={shiftsLoading}
          emptyMessage={t("shifts.noShiftsFound")}
          rowActions={(row) => {
            if (row.status !== "closed") return null
            return <DropdownMenuItem onClick={() => openZReport(row.id)}>Z-Report</DropdownMenuItem>
          }}
        />
      </div>

      {/* Open Shift Sheet */}
      <Sheet open={openSheetOpen} onOpenChange={setOpenSheetOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("shifts.openShift")}</SheetTitle>
            <SheetDescription>{t("shifts.startNewShift")}</SheetDescription>
          </SheetHeader>
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault()
              openShift.mutate()
            }}
          >
            <SheetBody>
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="opening-balance">{t("shifts.openingBalance")}</Label>
                  <Input
                    id="opening-balance"
                    type="number"
                    step="0.01"
                    min={0}
                    required
                    placeholder="0.00"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                  />
                </div>
              </div>
            </SheetBody>
            <SheetFooter>
              <Button variant="outline" type="button" onClick={() => setOpenSheetOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={openShift.isPending}>
                {openShift.isPending ? t("shifts.opening") : t("shifts.openShift")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Close Shift Sheet */}
      <Sheet open={closeSheetOpen} onOpenChange={setCloseSheetOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("shifts.closeShift")}</SheetTitle>
            <SheetDescription>{t("shifts.closeCurrentShift")}</SheetDescription>
          </SheetHeader>
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault()
              closeShift.mutate()
            }}
          >
            <SheetBody>
              <div className="grid gap-4">
                {currentShift?.expected_balance != null && (
                  <div className="rounded-md bg-muted p-3">
                    <p className="text-sm text-muted-foreground">
                      {t("shifts.expectedBalance")}:{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {formatCurrencyOrDash(currentShift.expected_balance)}
                      </span>
                    </p>
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label htmlFor="closing-balance">{t("shifts.closingBalance")}</Label>
                  <Input
                    id="closing-balance"
                    type="number"
                    step="0.01"
                    min={0}
                    required
                    placeholder="0.00"
                    value={closingBalance}
                    onChange={(e) => setClosingBalance(e.target.value)}
                  />
                </div>
              </div>
            </SheetBody>
            <SheetFooter>
              <Button variant="outline" type="button" onClick={() => setCloseSheetOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={closeShift.isPending}>
                {closeShift.isPending ? t("shifts.closing") : t("shifts.closeShift")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Z-Report Sheet */}
      <Sheet open={!!zReportShiftId} onOpenChange={(open) => !open && setZReportShiftId(null)}>
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Z-Report</SheetTitle>
            <SheetDescription>Shift summary report</SheetDescription>
          </SheetHeader>
          <SheetBody>
            {zReportLoading ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">Loading report...</p>
              </div>
            ) : zReportData ? (
              <ZReportContent report={zReportData} />
            ) : (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">No report data available.</p>
              </div>
            )}
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setZReportShiftId(null)}>
              {t("common.close")}
            </Button>
            <Button onClick={() => window.print()}>{t("common.print")}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}

function ZReportContent({ report }: { report: ZReport }) {
  const discrepancyNegative = report.discrepancy != null && report.discrepancy < 0

  return (
    <div className="space-y-6">
      {/* Shift Info Header */}
      <div className="space-y-1">
        <p className="text-sm font-medium">{report.cashier_name}</p>
        <p className="text-xs text-muted-foreground">
          {formatDateTime(report.opened_at)}
          {" \u2014 "}
          {formatDateTime(report.closed_at)}
        </p>
      </div>

      <Separator />

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Total Sales" value={formatCurrencyOrDash(report.total_sales)} />
        <SummaryCard label="Total Orders" value={String(report.total_orders)} />
        <SummaryCard label="Items Sold" value={String(report.total_items_sold)} />
      </div>

      <Separator />

      {/* Payment Method Breakdown */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Payment Breakdown</h4>
        {report.payment_method_breakdown.length === 0 ? (
          <p className="text-xs text-muted-foreground">No transactions in this shift.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Method</TableHead>
                <TableHead className="text-xs text-right">Count</TableHead>
                <TableHead className="text-xs text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.payment_method_breakdown.map((pm) => (
                <TableRow key={pm.method_name}>
                  <TableCell className="text-sm">{pm.method_name}</TableCell>
                  <TableCell className="text-sm text-right tabular-nums">{pm.count}</TableCell>
                  <TableCell className="text-sm text-right tabular-nums">
                    {formatCurrencyOrDash(pm.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Separator />

      {/* Cash Reconciliation */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Cash Reconciliation</h4>
        <div className="space-y-1.5 rounded-md border p-3">
          <ReconciliationRow
            label="Opening Balance"
            value={formatCurrencyOrDash(report.opening_balance)}
          />
          <ReconciliationRow
            label="Expected Cash"
            value={formatCurrencyOrDash(report.expected_cash)}
          />
          <ReconciliationRow label="Actual Cash" value={formatCurrencyOrDash(report.actual_cash)} />
          <Separator />
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-medium">Discrepancy</span>
            <span
              className={`text-sm font-semibold tabular-nums ${discrepancyNegative ? "text-red-600 dark:text-red-400" : ""}`}
            >
              {formatCurrencyOrDash(report.discrepancy)}
            </span>
          </div>
        </div>
      </div>

      {/* Voided / Returned Orders */}
      {(report.voided_orders > 0 || report.returned_orders > 0) && (
        <>
          <Separator />
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Exceptions</h4>
            <div className="grid grid-cols-2 gap-3">
              <SummaryCard label="Voided Orders" value={String(report.voided_orders)} />
              <SummaryCard label="Returned Orders" value={String(report.returned_orders)} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function ReconciliationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm tabular-nums">{value}</span>
    </div>
  )
}
