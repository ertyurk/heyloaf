import type { components } from "@heyloaf/api-client"
import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { DataTable } from "@heyloaf/ui/components/data-table"
import { Input } from "@heyloaf/ui/components/input"
import { Label } from "@heyloaf/ui/components/label"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@heyloaf/ui/components/sheet"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

type Shift = components["schemas"]["Shift"]

export const Route = createFileRoute("/_authenticated/shifts")({
  component: ShiftsPage,
})

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "\u2014"
  return new Date(iso).toLocaleString()
}

function formatCurrency(val: number | null | undefined) {
  if (val == null) return "\u2014"
  return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function ShiftsPage() {
  const client = useApi()
  const queryClient = useQueryClient()

  const [openSheetOpen, setOpenSheetOpen] = useState(false)
  const [closeSheetOpen, setCloseSheetOpen] = useState(false)
  const [openingBalance, setOpeningBalance] = useState("")
  const [closingBalance, setClosingBalance] = useState("")

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
      toast.success("Shift opened successfully")
    },
    onError: () => {
      toast.error("Failed to open shift")
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] })
      setCloseSheetOpen(false)
      setClosingBalance("")
      toast.success("Shift closed successfully")
    },
    onError: () => {
      toast.error("Failed to close shift")
    },
  })

  const columns = useMemo(
    () => [
      {
        id: "id",
        header: "Shift #",
        cell: (row: Shift) => <span className="font-mono text-xs">{row.id.slice(0, 8)}</span>,
      },
      {
        id: "opened_at",
        header: "Opened At",
        cell: (row: Shift) => <span className="text-sm">{formatDateTime(row.opened_at)}</span>,
      },
      {
        id: "closed_at",
        header: "Closed At",
        cell: (row: Shift) => <span className="text-sm">{formatDateTime(row.closed_at)}</span>,
      },
      {
        id: "opening_balance",
        header: "Opening Balance",
        cell: (row: Shift) => (
          <span className="tabular-nums">{formatCurrency(row.opening_balance)}</span>
        ),
      },
      {
        id: "closing_balance",
        header: "Closing Balance",
        cell: (row: Shift) => (
          <span className="tabular-nums">{formatCurrency(row.closing_balance)}</span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (row: Shift) => (
          <Badge variant={row.status === "open" ? "default" : "secondary"}>
            {row.status === "open" ? "Open" : "Closed"}
          </Badge>
        ),
      },
    ],
    []
  )

  return (
    <>
      <PageHeader title="Shift Management" description="Manage cash register shifts">
        {currentShift ? (
          <Button variant="destructive" onClick={() => setCloseSheetOpen(true)}>
            Close Shift
          </Button>
        ) : (
          <Button onClick={() => setOpenSheetOpen(true)}>Open Shift</Button>
        )}
      </PageHeader>

      <div className="space-y-4 p-6">
        {/* Current shift banner */}
        {currentLoading ? null : currentShift ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  Shift is currently open
                </p>
                <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                  Opened at {formatDateTime(currentShift.opened_at)} &middot; Opening balance:{" "}
                  {formatCurrency(currentShift.opening_balance)}
                  {currentShift.expected_balance != null && (
                    <> &middot; Expected balance: {formatCurrency(currentShift.expected_balance)}</>
                  )}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setCloseSheetOpen(true)}>
                Close Shift
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-muted bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">No shift is currently open.</p>
              <Button size="sm" onClick={() => setOpenSheetOpen(true)}>
                Open Shift
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
          emptyMessage="No shifts found."
        />
      </div>

      {/* Open Shift Sheet */}
      <Sheet open={openSheetOpen} onOpenChange={setOpenSheetOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Open Shift</SheetTitle>
            <SheetDescription>Start a new cash register shift.</SheetDescription>
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
                  <Label htmlFor="opening-balance">Opening Balance</Label>
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
                Cancel
              </Button>
              <Button type="submit" disabled={openShift.isPending}>
                {openShift.isPending ? "Opening..." : "Open Shift"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Close Shift Sheet */}
      <Sheet open={closeSheetOpen} onOpenChange={setCloseSheetOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Close Shift</SheetTitle>
            <SheetDescription>
              Close the current shift and record the closing balance.
            </SheetDescription>
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
                      Expected balance:{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {formatCurrency(currentShift.expected_balance)}
                      </span>
                    </p>
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label htmlFor="closing-balance">Closing Balance</Label>
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
                Cancel
              </Button>
              <Button type="submit" disabled={closeShift.isPending}>
                {closeShift.isPending ? "Closing..." : "Close Shift"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
