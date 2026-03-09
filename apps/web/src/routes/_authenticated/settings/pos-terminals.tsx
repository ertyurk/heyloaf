import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { Checkbox } from "@heyloaf/ui/components/checkbox"
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

export const Route = createFileRoute("/_authenticated/settings/pos-terminals")({
  component: PosTerminalsPage,
})

interface TerminalForm {
  name: string
  price_list_id: string
  is_active: boolean
}

const emptyForm: TerminalForm = {
  name: "",
  price_list_id: "",
  is_active: true,
}

function PosTerminalsPage() {
  const { t } = useTranslation()
  const client = useApi()
  const queryClient = useQueryClient()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<TerminalForm>(emptyForm)

  const { data, isLoading } = useQuery({
    queryKey: ["pos-terminals"],
    queryFn: async () => {
      const res = await client.GET("/api/pos-terminals")
      return res.data
    },
  })

  const { data: priceListsData } = useQuery({
    queryKey: ["price-lists"],
    queryFn: async () => {
      const res = await client.GET("/api/price-lists")
      return res.data
    },
  })

  const terminals = data?.data ?? []
  const priceLists = priceListsData?.data ?? []

  const createMutation = useMutation({
    mutationFn: async (body: { name: string; price_list_id?: string }) => {
      const res = await client.POST("/api/pos-terminals", { body })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos-terminals"] })
      toast.success(t("settings.posTerminals.terminalCreated"))
      closeSheet()
    },
    onError: () => toast.error(t("settings.posTerminals.failedToCreate")),
  })

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string
      body: { name: string; price_list_id?: string; is_active: boolean }
    }) => {
      const res = await client.PUT("/api/pos-terminals/{id}", {
        params: { path: { id } },
        body,
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos-terminals"] })
      toast.success(t("settings.posTerminals.terminalUpdated"))
      closeSheet()
    },
    onError: () => toast.error(t("settings.posTerminals.failedToUpdate")),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE("/api/pos-terminals/{id}", {
        params: { path: { id } },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos-terminals"] })
      toast.success(t("settings.posTerminals.terminalDeleted"))
    },
    onError: () => toast.error(t("settings.posTerminals.failedToDelete")),
  })

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setSheetOpen(true)
  }

  function openEdit(terminal: (typeof terminals)[number]) {
    setEditingId(terminal.id)
    setForm({
      name: terminal.name ?? "",
      price_list_id: terminal.price_list_id ?? "",
      is_active: terminal.is_active ?? true,
    })
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name) return
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        body: {
          name: form.name,
          price_list_id: form.price_list_id || undefined,
          is_active: form.is_active,
        },
      })
    } else {
      createMutation.mutate({
        name: form.name,
        price_list_id: form.price_list_id || undefined,
      })
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <>
      <PageHeader
        title={t("settings.posTerminals.title")}
        description={t("settings.posTerminals.description")}
      >
        <Button onClick={openCreate}>{t("settings.posTerminals.addTerminal")}</Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        <DataTable
          columns={[
            {
              id: "name",
              header: t("common.name"),
              cell: (row) => row.name,
            },
            {
              id: "price_list",
              header: t("settings.terminalPriceList"),
              cell: (row) => {
                const priceList = priceLists.find((pl) => pl.id === row.price_list_id)
                return priceList?.name ?? "-"
              },
            },
            {
              id: "status",
              header: t("common.status"),
              cell: (row) => (
                <Badge variant={row.is_active ? "default" : "outline"}>
                  {row.is_active ? t("common.active") : t("common.inactive")}
                </Badge>
              ),
            },
          ]}
          data={terminals}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage={t("settings.posTerminals.noTerminals")}
          onRowClick={openEdit}
          rowActions={(row) => (
            <>
              <DropdownMenuItem onClick={() => openEdit(row)}>{t("common.edit")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => deleteMutation.mutate(row.id)}>
                {t("common.delete")}
              </DropdownMenuItem>
            </>
          )}
        />
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {editingId
                ? t("settings.posTerminals.editTerminal")
                : t("settings.posTerminals.addTerminal")}
            </SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
            <SheetBody className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">{t("common.name")}</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Terminal 1"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("settings.terminalPriceList")}</Label>
                <Select
                  value={form.price_list_id}
                  onValueChange={(val) => setForm((f) => ({ ...f, price_list_id: val ?? "" }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("settings.selectPriceList")} />
                  </SelectTrigger>
                  <SelectContent>
                    {priceLists.map((pl) => (
                      <SelectItem key={pl.id} value={pl.id}>
                        {pl.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editingId && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="is_active"
                    checked={form.is_active}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({ ...f, is_active: checked === true }))
                    }
                  />
                  <Label htmlFor="is_active">{t("common.active")}</Label>
                </div>
              )}
            </SheetBody>
            <SheetFooter>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? t("common.saving") : editingId ? t("common.save") : t("common.create")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
