import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { Checkbox } from "@heyloaf/ui/components/checkbox"
import { DataTable } from "@heyloaf/ui/components/data-table"
import { DropdownMenuItem, DropdownMenuSeparator } from "@heyloaf/ui/components/dropdown-menu"
import { Input } from "@heyloaf/ui/components/input"
import { Label } from "@heyloaf/ui/components/label"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@heyloaf/ui/components/sheet"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

export const Route = createFileRoute("/_authenticated/settings/currencies")({
  component: CurrenciesPage,
})

interface CurrencyForm {
  code: string
  name: string
  symbol: string
  exchange_rate: number
  is_base: boolean
}

const emptyCurrencyForm: CurrencyForm = {
  code: "",
  name: "",
  symbol: "",
  exchange_rate: 1,
  is_base: false,
}

function CurrenciesPage() {
  const client = useApi()
  const queryClient = useQueryClient()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CurrencyForm>(emptyCurrencyForm)

  const { data, isLoading } = useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const res = await client.GET("/api/currencies")
      return res.data
    },
  })

  const currencies = data?.data ?? []

  const createMutation = useMutation({
    mutationFn: async (body: CurrencyForm) => {
      const res = await client.POST("/api/currencies", { body })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["currencies"] })
      toast.success("Currency created")
      closeSheet()
    },
    onError: () => toast.error("Failed to create currency"),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: CurrencyForm }) => {
      const res = await client.PUT("/api/currencies/{id}", {
        params: { path: { id } },
        body,
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["currencies"] })
      toast.success("Currency updated")
      closeSheet()
    },
    onError: () => toast.error("Failed to update currency"),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE("/api/currencies/{id}", {
        params: { path: { id } },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["currencies"] })
      toast.success("Currency deleted")
    },
    onError: () => toast.error("Failed to delete currency"),
  })

  function openCreate() {
    setEditingId(null)
    setForm(emptyCurrencyForm)
    setSheetOpen(true)
  }

  function openEdit(currency: (typeof currencies)[number]) {
    setEditingId(currency.id)
    setForm({
      code: currency.code ?? "",
      name: currency.name ?? "",
      symbol: currency.symbol ?? "",
      exchange_rate: currency.exchange_rate ?? 1,
      is_base: currency.is_base ?? false,
    })
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
    setEditingId(null)
    setForm(emptyCurrencyForm)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.code || !form.name) return
    if (editingId) {
      updateMutation.mutate({ id: editingId, body: form })
    } else {
      createMutation.mutate(form)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <>
      <PageHeader title="Currencies" description="Manage currencies and exchange rates">
        <Button onClick={openCreate}>Add Currency</Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        <DataTable
          columns={[
            {
              id: "code",
              header: "Code",
              cell: (row) => <span className="font-mono">{row.code}</span>,
            },
            {
              id: "name",
              header: "Name",
              cell: (row) => row.name,
            },
            {
              id: "symbol",
              header: "Symbol",
              cell: (row) => row.symbol,
            },
            {
              id: "exchange_rate",
              header: "Rate",
              cell: (row) => row.exchange_rate,
            },
            {
              id: "is_base",
              header: "Default",
              cell: (row) => (row.is_base ? <Badge>Default</Badge> : null),
            },
          ]}
          data={currencies}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No currencies configured yet."
          onRowClick={openEdit}
          rowActions={(row) => (
            <>
              <DropdownMenuItem onClick={() => openEdit(row)}>Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => deleteMutation.mutate(row.id)}>
                Delete
              </DropdownMenuItem>
            </>
          )}
        />
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editingId ? "Edit Currency" : "Add Currency"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
            <SheetBody className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="USD"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="US Dollar"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="symbol">Symbol</Label>
                <Input
                  id="symbol"
                  value={form.symbol}
                  onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
                  placeholder="$"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="exchange_rate">Exchange Rate</Label>
                <Input
                  id="exchange_rate"
                  type="number"
                  step="any"
                  value={form.exchange_rate}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      exchange_rate: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_base"
                  checked={form.is_base}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, is_base: checked === true }))
                  }
                />
                <Label htmlFor="is_base">Base currency</Label>
              </div>
            </SheetBody>
            <SheetFooter>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : editingId ? "Update" : "Create"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
