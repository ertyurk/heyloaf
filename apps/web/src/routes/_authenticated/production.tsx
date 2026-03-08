import { AdvancedSelect } from "@heyloaf/ui/components/advanced-select"
import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { DataTable } from "@heyloaf/ui/components/data-table"
import { DateRangeFilter } from "@heyloaf/ui/components/date-range-filter"
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
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

export const Route = createFileRoute("/_authenticated/production")({
  component: ProductionPage,
})

// ── Material row for the record form ──

interface MaterialRow {
  id: string
  product_id: string
  quantity: number
}

function emptyMaterial(): MaterialRow {
  return { id: crypto.randomUUID(), product_id: "", quantity: 0 }
}

// ── Page ──

function ProductionPage() {
  const client = useApi()
  const queryClient = useQueryClient()

  // ── Products (used for selects & name lookups) ──

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
      <PageHeader title="Production" description="Manage production records and sessions" />

      <Tabs defaultValue="records" className="flex flex-col">
        <div className="px-6 pt-4">
          <TabsList>
            <TabsTrigger value="records">Records</TabsTrigger>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
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

// ════════════════════════════════════════════════════════════════════
// Records Tab
// ════════════════════════════════════════════════════════════════════

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
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

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

  function handleSearchChange(value: string) {
    setSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 300)
  }

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
  }

  // ── Fetch records ──

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

  // ── Mutations ──

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
      toast.success("Record created")
    },
    onError: () => {
      toast.error("Failed to create record")
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
      toast.success("Record updated")
    },
    onError: () => {
      toast.error("Failed to update record")
    },
  })

  const deleteRecord = useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE(`/api/production/records/${id}` as never)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-records"] })
      toast.success("Record deleted")
    },
    onError: () => {
      toast.error("Failed to delete record")
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

  function handleDelete(id: string) {
    if (window.confirm("Are you sure you want to delete this record?")) {
      deleteRecord.mutate(id)
    }
  }

  // ── Columns ──

  type ProductionRecord = (typeof records)[number]

  const columns = useMemo(
    () => [
      {
        id: "product",
        header: "Product",
        cell: (row: ProductionRecord) => (
          <span className="font-medium">{productName(row.product_id)}</span>
        ),
      },
      {
        id: "variant",
        header: "Variant",
        cell: (row: ProductionRecord) => (
          <span className="text-muted-foreground">{row.variant_name ?? "\u2014"}</span>
        ),
      },
      {
        id: "quantity",
        header: "Quantity",
        cell: (row: ProductionRecord) => <span className="tabular-nums">{row.quantity}</span>,
      },
      {
        id: "unit",
        header: "Unit",
        cell: (row: ProductionRecord) => <span className="text-muted-foreground">{row.unit}</span>,
      },
      {
        id: "date",
        header: "Date",
        cell: (row: ProductionRecord) => (
          <span className="text-muted-foreground">
            {new Date(row.created_at).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "notes",
        header: "Notes",
        cell: (row: ProductionRecord) => (
          <span className="text-muted-foreground truncate max-w-[200px] block">
            {row.notes ?? "\u2014"}
          </span>
        ),
      },
    ],
    [productName]
  )

  return (
    <>
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative max-w-xs flex-1">
              <HugeiconsIcon
                icon={Search01Icon}
                size={16}
                className="text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2"
              />
              <Input
                placeholder="Search by product name..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-8"
              />
            </div>
            <DateRangeFilter
              from={dateFrom}
              to={dateTo}
              onChange={(from, to) => {
                setDateFrom(from)
                setDateTo(to)
              }}
            />
          </div>
          <Button onClick={() => setCreateOpen(true)}>New Record</Button>
        </div>

        <DataTable
          columns={columns}
          data={filteredRecords}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No production records found."
          rowActions={(row) => (
            <>
              <DropdownMenuItem onClick={() => openEditSheet(row)}>Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => handleDelete(row.id)}>
                Delete
              </DropdownMenuItem>
            </>
          )}
        />
      </div>

      {/* Create Record Sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>New Production Record</SheetTitle>
            <SheetDescription>Log a new production output with materials used.</SheetDescription>
          </SheetHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              createRecord.mutate()
            }}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <SheetBody className="grid gap-4">
              <div className="grid gap-2">
                <Label>Product *</Label>
                <AdvancedSelect
                  options={outputProducts}
                  value={createForm.product_id}
                  onValueChange={(v) => setCreateForm((f) => ({ ...f, product_id: v ?? "" }))}
                  placeholder="Select product"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rec-variant">Variant (optional)</Label>
                <Input
                  id="rec-variant"
                  value={createForm.variant_name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, variant_name: e.target.value }))}
                  placeholder="e.g. chocolate, vanilla"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="rec-qty">Quantity *</Label>
                  <Input
                    id="rec-qty"
                    type="number"
                    min={0}
                    required
                    value={createForm.quantity || ""}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, quantity: Number(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rec-unit">Unit</Label>
                  <Input
                    id="rec-unit"
                    value={createForm.unit}
                    onChange={(e) => setCreateForm((f) => ({ ...f, unit: e.target.value }))}
                    placeholder="pcs"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rec-batch">Batch Size</Label>
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
                  />
                </div>
              </div>

              {/* Materials */}
              <div className="grid gap-2">
                <Label>Materials</Label>
                <div className="space-y-2">
                  {createForm.materials.map((mat, idx) => (
                    <div
                      key={mat.id}
                      className="grid grid-cols-[1fr_5rem_2rem] items-end gap-2 rounded-md border p-2"
                    >
                      <div className="grid gap-1">
                        <span className="text-xs text-muted-foreground">Ingredient</span>
                        <AdvancedSelect
                          options={ingredientProducts}
                          value={mat.product_id}
                          onValueChange={(v) =>
                            setCreateForm((f) => {
                              const mats = [...f.materials]
                              mats[idx] = { ...mats[idx], product_id: v ?? "" }
                              return { ...f, materials: mats }
                            })
                          }
                          placeholder="Select"
                          size="sm"
                        />
                      </div>
                      <div className="grid gap-1">
                        <span className="text-xs text-muted-foreground">Qty</span>
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
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={createForm.materials.length <= 1}
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
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCreateForm((f) => ({
                      ...f,
                      materials: [...f.materials, emptyMaterial()],
                    }))
                  }
                >
                  Add Material
                </Button>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="rec-notes">Notes (optional)</Label>
                <Textarea
                  id="rec-notes"
                  value={createForm.notes}
                  onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </SheetBody>
            <SheetFooter>
              <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
              <Button
                type="submit"
                disabled={
                  !createForm.product_id || createForm.quantity <= 0 || createRecord.isPending
                }
              >
                {createRecord.isPending ? "Creating..." : "Create"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Edit Record Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Edit Production Record</SheetTitle>
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
                <Label htmlFor="edit-qty">Quantity</Label>
                <Input
                  id="edit-qty"
                  type="number"
                  min={0}
                  required
                  value={editForm.quantity || ""}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, quantity: Number(e.target.value) || 0 }))
                  }
                />
              </div>

              {/* Materials */}
              <div className="grid gap-2">
                <Label>Materials</Label>
                <div className="space-y-2">
                  {editForm.materials.map((mat, idx) => (
                    <div
                      key={mat.id}
                      className="grid grid-cols-[1fr_5rem_2rem] items-end gap-2 rounded-md border p-2"
                    >
                      <div className="grid gap-1">
                        <span className="text-xs text-muted-foreground">Ingredient</span>
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
                          placeholder="Select"
                          size="sm"
                        />
                      </div>
                      <div className="grid gap-1">
                        <span className="text-xs text-muted-foreground">Qty</span>
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
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={editForm.materials.length <= 1}
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
                  onClick={() =>
                    setEditForm((f) => ({
                      ...f,
                      materials: [...f.materials, emptyMaterial()],
                    }))
                  }
                >
                  Add Material
                </Button>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-notes">Notes (optional)</Label>
                <Textarea
                  id="edit-notes"
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </SheetBody>
            <SheetFooter>
              <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
              <Button type="submit" disabled={editForm.quantity <= 0 || updateRecord.isPending}>
                {updateRecord.isPending ? "Saving..." : "Save"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════
// Sessions Tab
// ════════════════════════════════════════════════════════════════════

interface SessionsTabProps {
  client: ReturnType<typeof useApi>
  queryClient: ReturnType<typeof useQueryClient>
}

function SessionsTab({ client, queryClient }: SessionsTabProps) {
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
      toast.success("Session created")
      setCreateOpen(false)
      setNewSessionName("")
    },
    onError: () => {
      toast.error("Failed to create session")
    },
  })

  const completeSession = useMutation({
    mutationFn: async (id: string) => {
      await client.POST(`/api/production/sessions/${id}/complete` as never)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-sessions"] })
      toast.success("Session completed")
    },
    onError: () => {
      toast.error("Failed to complete session")
    },
  })

  const deleteSession = useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE(`/api/production/sessions/${id}` as never)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-sessions"] })
      toast.success("Session deleted")
    },
    onError: () => {
      toast.error("Failed to delete session")
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
        header: "Session Name",
        cell: (row: Session) => <span className="font-medium">{row.name}</span>,
      },
      {
        id: "status",
        header: "Status",
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
        header: "Items Count",
        cell: (row: Session) => (
          <span className="text-muted-foreground">
            {((row as Record<string, unknown>).items_count as number) ?? "\u2014"}
          </span>
        ),
      },
      {
        id: "started",
        header: "Created At",
        cell: (row: Session) => (
          <span className="text-muted-foreground">
            {new Date(row.created_at).toLocaleDateString()}
          </span>
        ),
      },
    ],
    []
  )

  return (
    <>
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div className="relative max-w-sm flex-1">
            <HugeiconsIcon
              icon={Search01Icon}
              size={16}
              className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
            />
            <Input
              placeholder="Search by session name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button onClick={() => setCreateOpen(true)}>New Session</Button>
        </div>

        <DataTable
          columns={columns}
          data={filteredSessions}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No production sessions found."
          rowActions={(row) => (
            <>
              {row.status === "in_progress" && (
                <DropdownMenuItem onClick={() => completeSession.mutate(row.id)}>
                  Complete
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => deleteSession.mutate(row.id)}>
                Delete
              </DropdownMenuItem>
            </>
          )}
        />
      </div>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>New Production Session</SheetTitle>
            <SheetDescription>
              Create a new production session to track your output.
            </SheetDescription>
          </SheetHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              createSession.mutate(newSessionName || undefined)
            }}
          >
            <SheetBody className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="session-name">Name (optional)</Label>
                <Input
                  id="session-name"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  placeholder="Session name"
                />
              </div>
            </SheetBody>
            <SheetFooter>
              <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createSession.isPending}>
                {createSession.isPending ? "Creating..." : "Create"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
