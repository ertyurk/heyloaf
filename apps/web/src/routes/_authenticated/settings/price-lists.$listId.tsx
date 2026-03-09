import type { components } from "@heyloaf/api-client"
import { AdvancedSelect } from "@heyloaf/ui/components/advanced-select"
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

type PriceListItem = components["schemas"]["PriceListItem"]

export const Route = createFileRoute("/_authenticated/settings/price-lists/$listId")({
  component: PriceListItemsPage,
})

interface ItemForm {
  product_id: string
  price: string
  vat_rate: string
  is_active: boolean
}

const emptyForm: ItemForm = {
  product_id: "",
  price: "",
  vat_rate: "",
  is_active: true,
}

function PriceListItemsPage() {
  const { t } = useTranslation()
  const { listId } = Route.useParams()
  const client = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<PriceListItem | null>(null)
  const [form, setForm] = useState<ItemForm>(emptyForm)

  const { data: priceListData } = useQuery({
    queryKey: ["price-lists", listId],
    queryFn: async () => {
      const res = await client.GET("/api/price-lists/{id}", {
        params: { path: { id: listId } },
      })
      return res.data
    },
  })

  const priceList = priceListData?.data

  const { data: itemsData, isLoading } = useQuery({
    queryKey: ["price-list-items", listId],
    queryFn: async () => {
      const res = await client.GET("/api/price-lists/{id}/items", {
        params: { path: { id: listId } },
      })
      return res.data
    },
  })

  const { data: productsData } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await client.GET("/api/products")
      return res.data
    },
  })

  const items = itemsData?.data ?? []
  const products = productsData?.data ?? []
  const activeProducts = products.filter((p) => p.status === "active")

  const productNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of products) {
      map.set(p.id, p.name)
    }
    return map
  }, [products])

  const productOptions = useMemo(
    () =>
      activeProducts.map((p) => ({
        value: p.id,
        label: p.name,
      })),
    [activeProducts]
  )

  const upsertMutation = useMutation({
    mutationFn: async (body: { product_id: string; price: number; vat_rate?: number }) => {
      const res = await client.POST("/api/price-lists/{id}/items", {
        params: { path: { id: listId } },
        body: {
          product_id: body.product_id,
          price: body.price,
          vat_rate: body.vat_rate,
        },
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-list-items", listId] })
      closeSheet()
      toast.success(
        editingItem ? t("settings.priceLists.itemUpdated") : t("settings.priceLists.itemAdded")
      )
    },
    onError: () => {
      toast.error(
        editingItem ? t("settings.priceLists.failedToUpdate") : t("settings.priceLists.failedToAdd")
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await client.DELETE("/api/price-lists/items/{item_id}", {
        params: { path: { item_id: itemId } },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-list-items", listId] })
      toast.success(t("settings.priceLists.itemDeleted"))
    },
    onError: () => {
      toast.error(t("settings.priceLists.failedToDelete"))
    },
  })

  function openCreate() {
    setEditingItem(null)
    setForm(emptyForm)
    setSheetOpen(true)
  }

  function openEdit(item: PriceListItem) {
    setEditingItem(item)
    setForm({
      product_id: item.product_id,
      price: String(item.price),
      vat_rate: item.vat_rate != null ? String(item.vat_rate) : "",
      is_active: item.is_active,
    })
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
    setEditingItem(null)
    setForm(emptyForm)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.product_id || !form.price) return
    upsertMutation.mutate({
      product_id: form.product_id,
      price: Number(form.price),
      ...(form.vat_rate !== "" ? { vat_rate: Number(form.vat_rate) } : {}),
    })
  }

  function handleDelete(item: PriceListItem) {
    if (!window.confirm(t("settings.priceLists.confirmDelete"))) return
    deleteMutation.mutate(item.id)
  }

  const columns = useMemo(
    () => [
      {
        id: "product",
        header: t("settings.priceLists.productName"),
        cell: (row: PriceListItem) => (
          <span className="font-medium">
            {productNameMap.get(row.product_id) ?? row.product_id.slice(0, 8)}
          </span>
        ),
      },
      {
        id: "price",
        header: <span className="text-right block">{t("common.price")}</span>,
        cell: (row: PriceListItem) => (
          <span className="tabular-nums">{formatCurrency(row.price)}</span>
        ),
        className: "text-right",
      },
      {
        id: "vat_rate",
        header: t("settings.priceLists.vatRate"),
        cell: (row: PriceListItem) => (
          <span className="text-muted-foreground tabular-nums">
            {row.vat_rate != null ? `${row.vat_rate}%` : "\u2014"}
          </span>
        ),
      },
      {
        id: "active",
        header: t("common.status"),
        cell: (row: PriceListItem) =>
          row.is_active ? (
            <Badge variant="default">{t("common.active")}</Badge>
          ) : (
            <Badge variant="secondary">{t("common.inactive")}</Badge>
          ),
      },
    ],
    [productNameMap, t]
  )

  return (
    <>
      <PageHeader
        title={priceList?.name ?? t("settings.priceLists.title")}
        description={t("settings.priceLists.description")}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: "/settings/price-lists" })}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} className="mr-1" />
          {t("common.back")}
        </Button>
        <Button onClick={openCreate}>{t("settings.priceLists.addItem")}</Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        <DataTable
          columns={columns}
          data={items}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage={t("settings.priceLists.noItems")}
          onRowClick={openEdit}
          rowActions={(row) => (
            <>
              <DropdownMenuItem onClick={() => openEdit(row)}>{t("common.edit")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => handleDelete(row)}>
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
              {editingItem ? t("settings.priceLists.editItem") : t("settings.priceLists.addItem")}
            </SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
            <SheetBody className="grid gap-4">
              <div className="grid gap-2">
                <Label>{t("common.product")}</Label>
                <AdvancedSelect
                  options={productOptions}
                  value={form.product_id}
                  onValueChange={(val) => setForm((f) => ({ ...f, product_id: val ?? "" }))}
                  placeholder={t("settings.priceLists.selectProduct")}
                  searchable
                  className="w-full"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="price">{t("common.price")}</Label>
                <Input
                  id="price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="vat_rate">{t("settings.priceLists.vatRate")} (%)</Label>
                <Input
                  id="vat_rate"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.vat_rate}
                  onChange={(e) => setForm((f) => ({ ...f, vat_rate: e.target.value }))}
                />
              </div>
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
            </SheetBody>
            <SheetFooter>
              <Button type="submit" disabled={upsertMutation.isPending}>
                {upsertMutation.isPending
                  ? t("common.saving")
                  : editingItem
                    ? t("settings.priceLists.update")
                    : t("settings.priceLists.addItem")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
