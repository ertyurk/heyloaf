import { AdvancedSelect } from "@heyloaf/ui/components/advanced-select"
import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { Card, CardContent } from "@heyloaf/ui/components/card"
import { Checkbox } from "@heyloaf/ui/components/checkbox"
import { DataTable } from "@heyloaf/ui/components/data-table"
import { DropdownMenuItem, DropdownMenuSeparator } from "@heyloaf/ui/components/dropdown-menu"
import { Input } from "@heyloaf/ui/components/input"
import { Label } from "@heyloaf/ui/components/label"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@heyloaf/ui/components/tabs"
import { Textarea } from "@heyloaf/ui/components/textarea"
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { LocalizedDateRangeFilter } from "@/components/localized-date-range-filter"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"
import { useDebounce } from "@/hooks/use-debounce"

export const Route = createFileRoute("/_authenticated/production")({
  component: ProductionPage,
})

// -- Material row for the record form --

interface MaterialRow {
  id: string
  product_id: string
  quantity: number
}

function emptyMaterial(): MaterialRow {
  return { id: crypto.randomUUID(), product_id: "", quantity: 0 }
}

// -- Page --

function ProductionPage() {
  const { t } = useTranslation()
  const client = useApi()
  const queryClient = useQueryClient()

  // -- Products (used for selects & name lookups) --

  const { data: productsData } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await client.GET("/api/products")
      return res.data
    },
  })

  const products = productsData?.data ?? []

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "\u2014"

  // Products that can be produced (semi + finished)
  const outputProducts = useMemo(
    () =>
      products
        .filter((p) => p.product_type === "semi" || p.product_type === "finished")
        .map((p) => ({ value: p.id, label: p.name })),
    [products]
  )

  // Products that can be used as ingredients (raw + semi + commercial)
  const ingredientProducts = useMemo(
    () =>
      products
        .filter(
          (p) =>
            p.product_type === "raw" || p.product_type === "semi" || p.product_type === "commercial"
        )
        .map((p) => ({ value: p.id, label: p.name })),
    [products]
  )

  return (
    <>
      <PageHeader title={t("production.title")} description={t("production.description")} />

      <Tabs defaultValue="records" className="flex flex-col">
        <div className="px-4 pt-4 md:px-6">
          <TabsList>
            <TabsTrigger value="records" className="h-12 text-lg md:h-10 md:text-sm">
              {t("production.records")}
            </TabsTrigger>
            <TabsTrigger value="sessions" className="h-12 text-lg md:h-10 md:text-sm">
              {t("production.sessions")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="records">
          <RecordsTab
            client={client}
            queryClient={queryClient}
            productName={productName}
            outputProducts={outputProducts}
            ingredientProducts={ingredientProducts}
          />
        </TabsContent>

        <TabsContent value="sessions">
          <SessionsTab client={client} queryClient={queryClient} />
        </TabsContent>
      </Tabs>
    </>
  )
}

// ================================================================
// Records Tab
// ================================================================

interface RecordsTabProps {
  client: ReturnType<typeof useApi>
  queryClient: ReturnType<typeof useQueryClient>
  productName: (id: string) => string
  outputProducts: { value: string; label: string }[]
  ingredientProducts: { value: string; label: string }[]
}

function RecordsTab({
  client,
  queryClient,
  productName,
  outputProducts,
  ingredientProducts,
}: RecordsTabProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Confirmation state for delete (replaces window.confirm)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Ingredient checklist state (keyed by material row id)
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set())

  // Create form
  const [createForm, setCreateForm] = useState({
    product_id: "",
    variant_name: "",
    quantity: 0,
    unit: "pcs",
    batch_size: 1,
    notes: "",
    materials: [emptyMaterial()] as MaterialRow[],
  })

  // Edit form
  const [editForm, setEditForm] = useState({
    quantity: 0,
    notes: "",
    materials: [] as MaterialRow[],
  })

  function resetCreateForm() {
    setCreateForm({
      product_id: "",
      variant_name: "",
      quantity: 0,
      unit: "pcs",
      batch_size: 1,
      notes: "",
      materials: [emptyMaterial()],
    })
    setCheckedIngredients(new Set())
  }

  // -- Fetch records --

  const { data: recordsData, isLoading } = useQuery({
    queryKey: ["production-records"],
    queryFn: async () => {
      const res = await client.GET("/api/production/records" as never)
      return (res as { data?: { data?: Record<string, unknown>[] } }).data
    },
  })

  const records = (recordsData?.data ?? []) as Array<{
    id: string
    product_id: string
    variant_name?: string
    quantity: number
    unit: string
    batch_size: number
    materials: Array<{ product_id: string; quantity: number }>
    notes?: string
    created_at: string
  }>

  const filteredRecords = useMemo(() => {
    let result = records
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter((r) => productName(r.product_id).toLowerCase().includes(q))
    }
    if (dateFrom) {
      result = result.filter((r) => r.created_at >= dateFrom)
    }
    if (dateTo) {
      result = result.filter((r) => r.created_at <= dateTo)
    }
    return [...result].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }, [records, debouncedSearch, dateFrom, dateTo, productName])

  // -- Mutations --

  const createRecord = useMutation({
    mutationFn: async () => {
      const materials = createForm.materials
        .filter((m) => m.product_id)
        .map(({ product_id, quantity }) => ({ product_id, quantity }))
      await client.POST(
        "/api/production/records" as never,
        {
          body: {
            product_id: createForm.product_id,
            ...(createForm.variant_name ? { variant_name: createForm.variant_name } : {}),
            quantity: createForm.quantity,
            unit: createForm.unit,
            batch_size: createForm.batch_size,
            materials,
            ...(createForm.notes ? { notes: createForm.notes } : {}),
          },
        } as never
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-records"] })
      setCreateOpen(false)
      resetCreateForm()
      toast.success(t("production.recordCreated"))
    },
    onError: () => {
      toast.error(t("production.failedToCreateRecord"))
    },
  })

  const updateRecord = useMutation({
    mutationFn: async () => {
      if (!editingId) return
      const materials = editForm.materials
        .filter((m) => m.product_id)
        .map(({ product_id, quantity }) => ({ product_id, quantity }))
      await client.PUT(
        `/api/production/records/${editingId}` as never,
        {
          body: {
            quantity: editForm.quantity,
            materials,
            ...(editForm.notes ? { notes: editForm.notes } : {}),
          },
        } as never
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-records"] })
      setEditOpen(false)
      setEditingId(null)
      toast.success(t("production.recordUpdated"))
    },
    onError: () => {
      toast.error(t("production.failedToUpdateRecord"))
    },
  })

  const deleteRecord = useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE(`/api/production/records/${id}` as never)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-records"] })
      toast.success(t("production.recordDeleted"))
    },
    onError: () => {
      toast.error(t("production.failedToDeleteRecord"))
    },
  })

  function openEditSheet(record: (typeof records)[number]) {
    setEditingId(record.id)
    setEditForm({
      quantity: record.quantity,
      notes: record.notes ?? "",
      materials:
        record.materials?.length > 0
          ? record.materials.map((m) => ({
              id: crypto.randomUUID(),
              product_id: m.product_id,
              quantity: m.quantity,
            }))
          : [emptyMaterial()],
    })
    setEditOpen(true)
  }

  function confirmDelete() {
    if (confirmDeleteId) {
      deleteRecord.mutate(confirmDeleteId)
      setConfirmDeleteId(null)
    }
  }

  // -- Columns --

  type ProductionRecord = (typeof records)[number]

  const columns = useMemo(
    () => [
      {
        id: "product",
        header: t("common.product"),
        cell: (row: ProductionRecord) => (
          <span className="font-medium">{productName(row.product_id)}</span>
        ),
      },
      {
        id: "variant",
        header: t("production.variant"),
        cell: (row: ProductionRecord) => (
          <span className="text-muted-foreground">{row.variant_name ?? "\u2014"}</span>
        ),
      },
      {
        id: "quantity",
        header: t("common.quantity"),
        cell: (row: ProductionRecord) => <span className="tabular-nums">{row.quantity}</span>,
      },
      {
        id: "unit",
        header: t("common.unit"),
        cell: (row: ProductionRecord) => <span className="text-muted-foreground">{row.unit}</span>,
      },
      {
        id: "date",
        header: t("common.date"),
        cell: (row: ProductionRecord) => (
          <span className="text-muted-foreground">
            {new Date(row.created_at).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "notes",
        header: t("common.notes"),
        cell: (row: ProductionRecord) => (
          <span className="text-muted-foreground truncate max-w-[200px] block">
            {row.notes ?? "\u2014"}
          </span>
        ),
      },
    ],
    [productName, t]
  )

  return (
    <>
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <div className="relative w-full md:max-w-xs md:flex-1">
              <HugeiconsIcon
                icon={Search01Icon}
                size={16}
                className="text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2"
              />
              <Input
                placeholder={t("production.searchByProductName")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-12 pl-8 text-lg md:h-10 md:text-sm"
              />
            </div>
            <LocalizedDateRangeFilter
              from={dateFrom}
              to={dateTo}
              onChange={(from, to) => {
                setDateFrom(from)
                setDateTo(to)
              }}
            />
          </div>
          <Button onClick={() => setCreateOpen(true)} className="h-12 text-lg md:h-10 md:text-sm">
            {t("production.newRecord")}
          </Button>
        </div>

        <DataTable
          columns={columns}
          data={filteredRecords}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage={t("production.noRecordsFound")}
          rowActions={(row) => (
            <>
              <DropdownMenuItem onClick={() => openEditSheet(row)}>
                {t("common.edit")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmDeleteId(row.id)}>
                {t("common.delete")}
              </DropdownMenuItem>
            </>
          )}
        />
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!confirmDeleteId}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
        description={t("production.confirmDeleteRecord")}
        isPending={deleteRecord.isPending}
      />

      {/* Create Record Sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t("production.newProductionRecord")}</SheetTitle>
            <SheetDescription>{t("production.logNewProduction")}</SheetDescription>
          </SheetHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              createRecord.mutate()
            }}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <SheetBody className="grid gap-4">
              {/* Product selection — large touch-friendly cards on mobile */}
              <div className="grid gap-2">
                <Label className="text-base md:text-sm">{t("production.selectProduct")} *</Label>
                {!createForm.product_id ? (
                  <div className="grid grid-cols-1 gap-3 md:hidden">
                    {outputProducts.map((p) => (
                      <Card
                        key={p.value}
                        className="cursor-pointer transition-colors hover:bg-accent"
                        role="button"
                        tabIndex={0}
                        onClick={() => setCreateForm((f) => ({ ...f, product_id: p.value }))}
                      >
                        <CardContent className="flex items-center p-4">
                          <span className="text-base font-medium">{p.label}</span>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : null}
                <div className={createForm.product_id ? "" : "hidden md:block"}>
                  <AdvancedSelect
                    options={outputProducts}
                    value={createForm.product_id}
                    onValueChange={(v) => setCreateForm((f) => ({ ...f, product_id: v ?? "" }))}
                    placeholder={t("stock.selectProduct")}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rec-variant" className="text-base md:text-sm">
                  {t("production.variantOptional")}
                </Label>
                <Input
                  id="rec-variant"
                  value={createForm.variant_name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, variant_name: e.target.value }))}
                  placeholder="e.g. chocolate, vanilla"
                  className="h-12 text-lg md:h-10 md:text-sm"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="rec-qty" className="text-base md:text-sm">
                    {t("common.quantity")} *
                  </Label>
                  <Input
                    id="rec-qty"
                    type="number"
                    min={0}
                    required
                    value={createForm.quantity || ""}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        quantity: Number(e.target.value) || 0,
                      }))
                    }
                    className="h-12 text-lg md:h-10 md:text-sm"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rec-unit" className="text-base md:text-sm">
                    {t("common.unit")}
                  </Label>
                  <Input
                    id="rec-unit"
                    value={createForm.unit}
                    onChange={(e) => setCreateForm((f) => ({ ...f, unit: e.target.value }))}
                    placeholder="pcs"
                    className="h-12 text-lg md:h-10 md:text-sm"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rec-batch" className="text-base md:text-sm">
                    {t("production.batchSize")}
                  </Label>
                  <Input
                    id="rec-batch"
                    type="number"
                    min={1}
                    value={createForm.batch_size}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        batch_size: Number(e.target.value) || 1,
                      }))
                    }
                    className="h-12 text-lg md:h-10 md:text-sm"
                  />
                </div>
              </div>

              {/* Materials with ingredient checklist */}
              <div className="grid gap-2">
                <Label className="text-base md:text-sm">
                  {t("production.ingredientChecklist")}
                </Label>
                <div className="space-y-2">
                  {createForm.materials.map((mat, idx) => {
                    const isChecked = checkedIngredients.has(mat.id)
                    return (
                      <div
                        key={mat.id}
                        className={`grid grid-cols-[auto_1fr_5rem_2rem] items-end gap-2 rounded-md border p-3 md:p-2 ${
                          isChecked ? "bg-muted/50" : ""
                        }`}
                      >
                        <div className="flex items-center pt-5">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              setCheckedIngredients((prev) => {
                                const next = new Set(prev)
                                if (checked) {
                                  next.add(mat.id)
                                } else {
                                  next.delete(mat.id)
                                }
                                return next
                              })
                            }}
                            aria-label={t("production.markAsUsed")}
                          />
                        </div>
                        <div className="grid gap-1">
                          <span
                            className={`text-xs text-muted-foreground ${
                              isChecked ? "line-through" : ""
                            }`}
                          >
                            {t("production.ingredient")}
                          </span>
                          <AdvancedSelect
                            options={ingredientProducts}
                            value={mat.product_id}
                            onValueChange={(v) =>
                              setCreateForm((f) => {
                                const mats = [...f.materials]
                                mats[idx] = {
                                  ...mats[idx],
                                  product_id: v ?? "",
                                }
                                return { ...f, materials: mats }
                              })
                            }
                            placeholder={t("common.search")}
                            size="sm"
                          />
                        </div>
                        <div className="grid gap-1">
                          <span
                            className={`text-xs text-muted-foreground ${
                              isChecked ? "line-through" : ""
                            }`}
                          >
                            {t("orders.qty")}
                          </span>
                          <Input
                            type="number"
                            min={0}
                            value={mat.quantity || ""}
                            onChange={(e) =>
                              setCreateForm((f) => {
                                const mats = [...f.materials]
                                mats[idx] = {
                                  ...mats[idx],
                                  quantity: Number(e.target.value) || 0,
                                }
                                return { ...f, materials: mats }
                              })
                            }
                            className="h-12 md:h-10"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={createForm.materials.length <= 1}
                          className="h-12 w-8 md:h-auto md:w-auto"
                          onClick={() =>
                            setCreateForm((f) => ({
                              ...f,
                              materials: f.materials.filter((_, i) => i !== idx),
                            }))
                          }
                        >
                          &times;
                        </Button>
                      </div>
                    )
                  })}
                </div>
                {/* Checklist summary */}
                {createForm.materials.filter((m) => m.product_id).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {checkedIngredients.size}/
                    {createForm.materials.filter((m) => m.product_id).length}
                    {checkedIngredients.size >=
                      createForm.materials.filter((m) => m.product_id).length &&
                      createForm.materials.filter((m) => m.product_id).length > 0 && (
                        <span className="ml-1 text-green-600">
                          — {t("production.allIngredientsUsed")}
                        </span>
                      )}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-12 text-lg md:h-10 md:text-sm"
                  onClick={() =>
                    setCreateForm((f) => ({
                      ...f,
                      materials: [...f.materials, emptyMaterial()],
                    }))
                  }
                >
                  {t("production.addMaterial")}
                </Button>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="rec-notes" className="text-base md:text-sm">
                  {t("production.notesOptional")}
                </Label>
                <Textarea
                  id="rec-notes"
                  value={createForm.notes}
                  onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </SheetBody>
            <SheetFooter>
              <SheetClose
                render={<Button variant="outline" className="h-12 text-lg md:h-10 md:text-sm" />}
              >
                {t("common.cancel")}
              </SheetClose>
              <Button
                type="submit"
                className="h-12 text-lg md:h-10 md:text-sm"
                disabled={
                  !createForm.product_id || createForm.quantity <= 0 || createRecord.isPending
                }
              >
                {createRecord.isPending ? t("common.creating") : t("common.create")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Edit Record Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t("production.editProductionRecord")}</SheetTitle>
          </SheetHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              updateRecord.mutate()
            }}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <SheetBody className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-qty" className="text-base md:text-sm">
                  {t("common.quantity")}
                </Label>
                <Input
                  id="edit-qty"
                  type="number"
                  min={0}
                  required
                  value={editForm.quantity || ""}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      quantity: Number(e.target.value) || 0,
                    }))
                  }
                  className="h-12 text-lg md:h-10 md:text-sm"
                />
              </div>

              {/* Materials */}
              <div className="grid gap-2">
                <Label className="text-base md:text-sm">{t("production.materials")}</Label>
                <div className="space-y-2">
                  {editForm.materials.map((mat, idx) => (
                    <div
                      key={mat.id}
                      className="grid grid-cols-[1fr_5rem_2rem] items-end gap-2 rounded-md border p-3 md:p-2"
                    >
                      <div className="grid gap-1">
                        <span className="text-xs text-muted-foreground">
                          {t("production.ingredient")}
                        </span>
                        <AdvancedSelect
                          options={ingredientProducts}
                          value={mat.product_id}
                          onValueChange={(v) =>
                            setEditForm((f) => {
                              const mats = [...f.materials]
                              mats[idx] = { ...mats[idx], product_id: v ?? "" }
                              return { ...f, materials: mats }
                            })
                          }
                          placeholder={t("common.search")}
                          size="sm"
                        />
                      </div>
                      <div className="grid gap-1">
                        <span className="text-xs text-muted-foreground">{t("orders.qty")}</span>
                        <Input
                          type="number"
                          min={0}
                          value={mat.quantity || ""}
                          onChange={(e) =>
                            setEditForm((f) => {
                              const mats = [...f.materials]
                              mats[idx] = {
                                ...mats[idx],
                                quantity: Number(e.target.value) || 0,
                              }
                              return { ...f, materials: mats }
                            })
                          }
                          className="h-12 md:h-10"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={editForm.materials.length <= 1}
                        className="h-12 w-8 md:h-auto md:w-auto"
                        onClick={() =>
                          setEditForm((f) => ({
                            ...f,
                            materials: f.materials.filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        &times;
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-12 text-lg md:h-10 md:text-sm"
                  onClick={() =>
                    setEditForm((f) => ({
                      ...f,
                      materials: [...f.materials, emptyMaterial()],
                    }))
                  }
                >
                  {t("production.addMaterial")}
                </Button>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-notes" className="text-base md:text-sm">
                  {t("production.notesOptional")}
                </Label>
                <Textarea
                  id="edit-notes"
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </SheetBody>
            <SheetFooter>
              <SheetClose
                render={<Button variant="outline" className="h-12 text-lg md:h-10 md:text-sm" />}
              >
                {t("common.cancel")}
              </SheetClose>
              <Button
                type="submit"
                className="h-12 text-lg md:h-10 md:text-sm"
                disabled={editForm.quantity <= 0 || updateRecord.isPending}
              >
                {updateRecord.isPending ? t("common.saving") : t("common.save")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}

// ================================================================
// Sessions Tab
// ================================================================

interface SessionsTabProps {
  client: ReturnType<typeof useApi>
  queryClient: ReturnType<typeof useQueryClient>
}

function SessionsTab({ client, queryClient }: SessionsTabProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [newSessionName, setNewSessionName] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["production-sessions"],
    queryFn: async () => {
      const res = await client.GET("/api/production/sessions")
      return res.data
    },
  })

  const createSession = useMutation({
    mutationFn: async (name?: string) => {
      const res = await client.POST(
        "/api/production/sessions" as never,
        {
          body: { name },
        } as never
      )
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-sessions"] })
      toast.success(t("production.sessionCreated"))
      setCreateOpen(false)
      setNewSessionName("")
    },
    onError: () => {
      toast.error(t("production.failedToCreateSession"))
    },
  })

  const completeSession = useMutation({
    mutationFn: async (id: string) => {
      await client.POST(`/api/production/sessions/${id}/complete` as never)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-sessions"] })
      toast.success(t("production.sessionCompleted"))
    },
    onError: () => {
      toast.error(t("production.failedToCompleteSession"))
    },
  })

  const deleteSession = useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE(`/api/production/sessions/${id}` as never)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-sessions"] })
      toast.success(t("production.sessionDeleted"))
    },
    onError: () => {
      toast.error(t("production.failedToDeleteSession"))
    },
  })

  const sessions = data?.data ?? []

  const filteredSessions = useMemo(() => {
    if (!search.trim()) return sessions
    const q = search.toLowerCase()
    return sessions.filter((s) => s.name?.toLowerCase().includes(q))
  }, [sessions, search])

  type Session = (typeof sessions)[number]

  const columns = useMemo(
    () => [
      {
        id: "name",
        header: t("production.sessionName"),
        cell: (row: Session) => <span className="font-medium">{row.name}</span>,
      },
      {
        id: "status",
        header: t("common.status"),
        cell: (row: Session) => (
          <Badge
            variant={row.status === "completed" ? "default" : "secondary"}
            className={
              row.status === "completed"
                ? "bg-green-100 text-green-800 hover:bg-green-100"
                : row.status === "in_progress"
                  ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-100"
                  : undefined
            }
          >
            {row.status.replace(/_/g, " ")}
          </Badge>
        ),
      },
      {
        id: "items_count",
        header: t("production.itemsCount"),
        cell: (row: Session) => (
          <span className="text-muted-foreground">
            {((row as Record<string, unknown>).items_count as number) ?? "\u2014"}
          </span>
        ),
      },
      {
        id: "started",
        header: t("production.createdAt"),
        cell: (row: Session) => (
          <span className="text-muted-foreground">
            {new Date(row.created_at).toLocaleDateString()}
          </span>
        ),
      },
    ],
    [t]
  )

  return (
    <>
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm md:flex-1">
            <HugeiconsIcon
              icon={Search01Icon}
              size={16}
              className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
            />
            <Input
              placeholder={t("production.searchBySessionName")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-12 pl-9 text-lg md:h-10 md:text-sm"
            />
          </div>
          <Button onClick={() => setCreateOpen(true)} className="h-12 text-lg md:h-10 md:text-sm">
            {t("production.newSession")}
          </Button>
        </div>

        <DataTable
          columns={columns}
          data={filteredSessions}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage={t("production.noSessionsFound")}
          rowActions={(row) => (
            <>
              {row.status === "in_progress" && (
                <DropdownMenuItem onClick={() => completeSession.mutate(row.id)}>
                  {t("production.complete")}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => deleteSession.mutate(row.id)}>
                {t("common.delete")}
              </DropdownMenuItem>
            </>
          )}
        />
      </div>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("production.newProductionSession")}</SheetTitle>
            <SheetDescription>{t("production.createSessionDescription")}</SheetDescription>
          </SheetHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              createSession.mutate(newSessionName || undefined)
            }}
          >
            <SheetBody className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="session-name" className="text-base md:text-sm">
                  {t("production.nameOptional")}
                </Label>
                <Input
                  id="session-name"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  placeholder={t("production.sessionName")}
                  className="h-12 text-lg md:h-10 md:text-sm"
                />
              </div>
            </SheetBody>
            <SheetFooter>
              <Button
                variant="outline"
                type="button"
                className="h-12 text-lg md:h-10 md:text-sm"
                onClick={() => setCreateOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                className="h-12 text-lg md:h-10 md:text-sm"
                disabled={createSession.isPending}
              >
                {createSession.isPending ? t("common.creating") : t("common.create")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
