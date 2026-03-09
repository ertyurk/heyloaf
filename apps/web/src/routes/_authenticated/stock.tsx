import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
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
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@heyloaf/ui/components/sheet"
import { Textarea } from "@heyloaf/ui/components/textarea"
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

export const Route = createFileRoute("/_authenticated/stock")({
  component: StockPage,
})

interface StockItem {
  product_id: string
  quantity: number
  min_level?: number | null
  max_level?: number | null
}

function getStockStatus(item: StockItem) {
  if (item.quantity === 0) return "out"
  if (item.min_level != null && item.quantity <= item.min_level) return "low"
  return "ok"
}

function statusBadge(status: string, t: (key: string) => string) {
  switch (status) {
    case "ok":
      return <Badge variant="default">{t("stock.ok")}</Badge>
    case "low":
      return (
        <Badge variant="secondary" className="text-orange-600">
          {t("stock.low")}
        </Badge>
      )
    case "out":
      return <Badge variant="destructive">{t("stock.out")}</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

function StockPage() {
  const { t } = useTranslation()
  const client = useApi()
  const queryClient = useQueryClient()

  // Stock count sheet state
  const [countOpen, setCountOpen] = useState(false)
  const [countNotes, setCountNotes] = useState("")
  const [countQuantities, setCountQuantities] = useState<Record<string, string>>({})

  // Movement sheet state
  const [movementOpen, setMovementOpen] = useState(false)
  const [movementProductId, setMovementProductId] = useState<string>("")
  const [movementType, setMovementType] = useState<string>("in")
  const [movementQty, setMovementQty] = useState("")
  const [movementDescription, setMovementDescription] = useState("")

  // Levels sheet state
  const [levelsOpen, setLevelsOpen] = useState(false)
  const [levelsProductId, setLevelsProductId] = useState<string>("")
  const [levelsProductName, setLevelsProductName] = useState("")
  const [levelsMin, setLevelsMin] = useState("")
  const [levelsMax, setLevelsMax] = useState("")

  // Search
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearch(value)
    clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value)
    }, 300)
  }, [])

  useEffect(() => {
    return () => {
      clearTimeout(searchTimerRef.current)
    }
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ["stock"],
    queryFn: async () => {
      const res = await client.GET("/api/stock")
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

  const products = productsData?.data ?? []
  const allStocks = data?.data ?? []

  const productNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of products) {
      map.set(p.id, p.name)
    }
    return map
  }, [products])

  const getProductName = useCallback(
    (productId: string) => productNameMap.get(productId) ?? productId,
    [productNameMap]
  )

  const stocks = useMemo(() => {
    if (!debouncedSearch.trim()) return allStocks
    const q = debouncedSearch.toLowerCase()
    return allStocks.filter((item) => getProductName(item.product_id).toLowerCase().includes(q))
  }, [allStocks, debouncedSearch, getProductName])

  const recordMovement = useMutation({
    mutationFn: async () => {
      await client.POST(
        "/api/stock/movements" as never,
        {
          body: {
            product_id: movementProductId,
            movement_type: movementType,
            quantity: Number(movementQty),
            ...(movementDescription ? { description: movementDescription } : {}),
          },
        } as never
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock"] })
      setMovementOpen(false)
      resetMovementForm()
      toast.success(t("stock.stockMovementRecorded"))
    },
    onError: () => {
      toast.error(t("stock.failedToRecordMovement"))
    },
  })

  const updateLevels = useMutation({
    mutationFn: async () => {
      await client.PUT(
        `/api/stock/${levelsProductId}/levels` as never,
        {
          body: {
            ...(levelsMin !== "" ? { min_level: Number(levelsMin) } : {}),
            ...(levelsMax !== "" ? { max_level: Number(levelsMax) } : {}),
          },
        } as never
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock"] })
      setLevelsOpen(false)
      toast.success(t("stock.stockLevelsUpdated"))
    },
    onError: () => {
      toast.error(t("stock.failedToUpdateLevels"))
    },
  })

  const submitStockCount = useMutation({
    mutationFn: async () => {
      const items = allStocks
        .filter(
          (s) => countQuantities[s.product_id] !== undefined && countQuantities[s.product_id] !== ""
        )
        .map((s) => ({
          product_id: s.product_id,
          expected_quantity: s.quantity,
          actual_quantity: Number(countQuantities[s.product_id]),
        }))
      if (items.length === 0) throw new Error(t("stock.noItemsCounted"))
      // Create the stock count
      const { data: createData, error: createError } = await client.POST(
        "/api/stock/counts" as never,
        { body: { items, ...(countNotes ? { notes: countNotes } : {}) } } as never
      )
      if (createError || !createData) throw new Error("Failed to create stock count")
      const countId = (createData as { data: { id: string } }).data.id
      // Complete it immediately
      const { error: completeError } = await client.POST(
        `/api/stock/counts/${countId}/complete` as never
      )
      if (completeError) throw new Error("Failed to complete stock count")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock"] })
      setCountOpen(false)
      setCountQuantities({})
      setCountNotes("")
      toast.success(t("stock.stockCountCompleted"))
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  function openStockCountSheet() {
    const quantities: Record<string, string> = {}
    for (const s of allStocks) {
      quantities[s.product_id] = ""
    }
    setCountQuantities(quantities)
    setCountNotes("")
    setCountOpen(true)
  }

  function resetMovementForm() {
    setMovementProductId("")
    setMovementType("in")
    setMovementQty("")
    setMovementDescription("")
  }

  function openAdjustSheet(item: (typeof allStocks)[number]) {
    setMovementProductId(item.product_id)
    setMovementType("adjustment")
    setMovementQty("")
    setMovementDescription("")
    setMovementOpen(true)
  }

  function openLevelsSheet(item: (typeof allStocks)[number]) {
    setLevelsProductId(item.product_id)
    setLevelsProductName(getProductName(item.product_id))
    setLevelsMin(item.min_level != null ? String(item.min_level) : "")
    setLevelsMax(item.max_level != null ? String(item.max_level) : "")
    setLevelsOpen(true)
  }

  const columns = useMemo(
    () => [
      {
        id: "product",
        header: t("common.product"),
        cell: (row: (typeof allStocks)[number]) => (
          <span className="font-medium">{getProductName(row.product_id)}</span>
        ),
      },
      {
        id: "quantity",
        header: t("common.quantity"),
        cell: (row: (typeof allStocks)[number]) => {
          const isLow = row.min_level != null && row.quantity <= row.min_level
          return (
            <span className={`tabular-nums ${isLow ? "text-destructive font-medium" : ""}`}>
              {row.quantity}
            </span>
          )
        },
      },
      {
        id: "min_level",
        header: t("stock.minLevel"),
        cell: (row: (typeof allStocks)[number]) => (
          <span className="text-muted-foreground tabular-nums">{row.min_level ?? "\u2014"}</span>
        ),
      },
      {
        id: "max_level",
        header: t("stock.maxLevel"),
        cell: (row: (typeof allStocks)[number]) => (
          <span className="text-muted-foreground tabular-nums">{row.max_level ?? "\u2014"}</span>
        ),
      },
      {
        id: "reserved",
        header: t("stock.reserved"),
        cell: (row: (typeof allStocks)[number]) => (
          <span className="text-muted-foreground tabular-nums">
            {(row as Record<string, unknown>).reserved != null
              ? String((row as Record<string, unknown>).reserved)
              : "\u2014"}
          </span>
        ),
      },
      {
        id: "location",
        header: t("stock.location"),
        cell: (row: (typeof allStocks)[number]) => (
          <span className="text-muted-foreground">
            {(row as Record<string, unknown>).location != null
              ? String((row as Record<string, unknown>).location)
              : "\u2014"}
          </span>
        ),
      },
      {
        id: "last_movement",
        header: t("stock.lastMovement"),
        cell: (row: (typeof allStocks)[number]) => {
          const val = (row as Record<string, unknown>).last_movement_at
          if (!val) return <span className="text-muted-foreground">{"\u2014"}</span>
          const d = new Date(val as string)
          return <span className="text-muted-foreground text-xs">{d.toLocaleDateString()}</span>
        },
      },
      {
        id: "status",
        header: t("common.status"),
        cell: (row: (typeof allStocks)[number]) => statusBadge(getStockStatus(row), t),
      },
    ],
    [getProductName, t]
  )

  return (
    <>
      <PageHeader title={t("stock.title")} description={t("stock.description")}>
        <Button variant="outline" onClick={openStockCountSheet}>
          {t("stock.startStockCount")}
        </Button>
        <Button
          onClick={() => {
            resetMovementForm()
            setMovementOpen(true)
          }}
        >
          {t("stock.recordMovement")}
        </Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <HugeiconsIcon
              icon={Search01Icon}
              size={16}
              className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
            />
            <Input
              placeholder={t("stock.searchByProductName")}
              value={search}
              onChange={handleSearchChange}
              className="pl-9"
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          data={stocks}
          getRowId={(row) => row.product_id}
          isLoading={isLoading}
          emptyMessage={t("stock.noStockItems")}
          rowActions={(row) => (
            <>
              <DropdownMenuItem onClick={() => openAdjustSheet(row)}>
                {t("stock.adjustStock")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openLevelsSheet(row)}>
                {t("stock.updateLevels")}
              </DropdownMenuItem>
            </>
          )}
        />
      </div>

      {/* Record Movement Sheet */}
      <Sheet open={movementOpen} onOpenChange={setMovementOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("stock.recordStockMovement")}</SheetTitle>
            <SheetDescription>{t("stock.recordMovementDescription")}</SheetDescription>
          </SheetHeader>
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault()
              recordMovement.mutate()
            }}
          >
            <SheetBody>
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="movement-product">{t("common.product")}</Label>
                  <Select
                    value={movementProductId}
                    onValueChange={(val) => setMovementProductId(val ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("stock.selectProduct")} />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="movement-type">{t("stock.movementType")}</Label>
                  <Select
                    value={movementType}
                    onValueChange={(val) => setMovementType(val ?? "in")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">{t("stock.in")}</SelectItem>
                      <SelectItem value="out">{t("stock.outMovement")}</SelectItem>
                      <SelectItem value="adjustment">{t("stock.adjustment")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="movement-qty">{t("common.quantity")}</Label>
                  <Input
                    id="movement-qty"
                    type="number"
                    min={1}
                    required
                    value={movementQty}
                    onChange={(e) => setMovementQty(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="movement-desc">{t("stock.descriptionOptional")}</Label>
                  <Textarea
                    id="movement-desc"
                    value={movementDescription}
                    onChange={(e) => setMovementDescription(e.target.value)}
                  />
                </div>
              </div>
            </SheetBody>
            <SheetFooter>
              <Button variant="outline" type="button" onClick={() => setMovementOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={!movementProductId || !movementQty || recordMovement.isPending}
              >
                {recordMovement.isPending ? t("common.saving") : t("stock.recordMovement")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Update Stock Levels Sheet */}
      <Sheet open={levelsOpen} onOpenChange={setLevelsOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("stock.updateLevels")}</SheetTitle>
            <SheetDescription>
              {t("stock.setMinMaxLevels", { name: levelsProductName })}
            </SheetDescription>
          </SheetHeader>
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault()
              updateLevels.mutate()
            }}
          >
            <SheetBody>
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="levels-min">{t("stock.minLevel")}</Label>
                  <Input
                    id="levels-min"
                    type="number"
                    min={0}
                    value={levelsMin}
                    onChange={(e) => setLevelsMin(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="levels-max">{t("stock.maxLevel")}</Label>
                  <Input
                    id="levels-max"
                    type="number"
                    min={0}
                    value={levelsMax}
                    onChange={(e) => setLevelsMax(e.target.value)}
                  />
                </div>
              </div>
            </SheetBody>
            <SheetFooter>
              <Button variant="outline" type="button" onClick={() => setLevelsOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={updateLevels.isPending}>
                {updateLevels.isPending ? t("common.saving") : t("stock.updateLevels")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Stock Count Sheet */}
      <Sheet open={countOpen} onOpenChange={setCountOpen}>
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t("stock.stockCount")}</SheetTitle>
            <SheetDescription>{t("stock.stockCountDescription")}</SheetDescription>
          </SheetHeader>
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault()
              submitStockCount.mutate()
            }}
          >
            <SheetBody>
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="count-notes">{t("stock.notesOptional")}</Label>
                  <Textarea
                    id="count-notes"
                    value={countNotes}
                    onChange={(e) => setCountNotes(e.target.value)}
                    placeholder={t("stock.weeklyStockCount")}
                  />
                </div>
                <div className="grid gap-1">
                  <div className="grid grid-cols-[1fr_80px_80px_60px] gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
                    <span>{t("common.product")}</span>
                    <span className="text-right">{t("stock.system")}</span>
                    <span className="text-right">{t("stock.actual")}</span>
                    <span className="text-right">{t("stock.diff")}</span>
                  </div>
                  {allStocks.map((item) => {
                    const actual = countQuantities[item.product_id] ?? ""
                    const diff = actual !== "" ? Number(actual) - item.quantity : null
                    return (
                      <div
                        key={item.product_id}
                        className="grid grid-cols-[1fr_80px_80px_60px] items-center gap-2 py-1"
                      >
                        <span className="truncate text-sm">{getProductName(item.product_id)}</span>
                        <span className="text-right text-sm tabular-nums text-muted-foreground">
                          {item.quantity}
                        </span>
                        <Input
                          type="number"
                          min={0}
                          className="h-8 text-right text-sm tabular-nums"
                          value={actual}
                          onChange={(e) =>
                            setCountQuantities((prev) => ({
                              ...prev,
                              [item.product_id]: e.target.value,
                            }))
                          }
                        />
                        <span
                          className={`text-right text-sm tabular-nums ${
                            diff == null
                              ? "text-muted-foreground"
                              : diff === 0
                                ? "text-muted-foreground"
                                : diff > 0
                                  ? "text-green-600"
                                  : "text-destructive font-medium"
                          }`}
                        >
                          {diff == null ? "\u2014" : diff > 0 ? `+${diff}` : diff}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </SheetBody>
            <SheetFooter>
              <Button variant="outline" type="button" onClick={() => setCountOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={submitStockCount.isPending}>
                {submitStockCount.isPending ? t("common.submitting") : t("stock.submitCount")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
