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
import { useCallback, useMemo, useRef, useState } from "react"
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

function statusBadge(status: string) {
  switch (status) {
    case "ok":
      return <Badge variant="default">OK</Badge>
    case "low":
      return (
        <Badge variant="secondary" className="text-orange-600">
          Low
        </Badge>
      )
    case "out":
      return <Badge variant="destructive">Out</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

function StockPage() {
  const client = useApi()
  const queryClient = useQueryClient()

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
      toast.success("Stock movement recorded")
    },
    onError: () => {
      toast.error("Failed to record stock movement")
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
      toast.success("Stock levels updated")
    },
    onError: () => {
      toast.error("Failed to update stock levels")
    },
  })

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
        header: "Product",
        cell: (row: (typeof allStocks)[number]) => (
          <span className="font-medium">{getProductName(row.product_id)}</span>
        ),
      },
      {
        id: "quantity",
        header: "Quantity",
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
        header: "Min Level",
        cell: (row: (typeof allStocks)[number]) => (
          <span className="text-muted-foreground tabular-nums">{row.min_level ?? "\u2014"}</span>
        ),
      },
      {
        id: "max_level",
        header: "Max Level",
        cell: (row: (typeof allStocks)[number]) => (
          <span className="text-muted-foreground tabular-nums">{row.max_level ?? "\u2014"}</span>
        ),
      },
      {
        id: "reserved",
        header: "Reserved",
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
        header: "Location",
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
        header: "Last Movement",
        cell: (row: (typeof allStocks)[number]) => {
          const val = (row as Record<string, unknown>).last_movement_at
          if (!val) return <span className="text-muted-foreground">{"\u2014"}</span>
          const d = new Date(val as string)
          return <span className="text-muted-foreground text-xs">{d.toLocaleDateString()}</span>
        },
      },
      {
        id: "status",
        header: "Status",
        cell: (row: (typeof allStocks)[number]) => statusBadge(getStockStatus(row)),
      },
    ],
    [getProductName]
  )

  return (
    <>
      <PageHeader title="Stock" description="Inventory levels and movements">
        <Button
          onClick={() => {
            resetMovementForm()
            setMovementOpen(true)
          }}
        >
          Record Movement
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
              placeholder="Search by product name..."
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
          emptyMessage="No stock items found."
          rowActions={(row) => (
            <>
              <DropdownMenuItem onClick={() => openAdjustSheet(row)}>Adjust Stock</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openLevelsSheet(row)}>
                Update Levels
              </DropdownMenuItem>
            </>
          )}
        />
      </div>

      {/* Record Movement Sheet */}
      <Sheet open={movementOpen} onOpenChange={setMovementOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Record Stock Movement</SheetTitle>
            <SheetDescription>
              Record an incoming, outgoing, or adjustment movement.
            </SheetDescription>
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
                  <Label htmlFor="movement-product">Product</Label>
                  <Select
                    value={movementProductId}
                    onValueChange={(val) => setMovementProductId(val ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a product" />
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
                  <Label htmlFor="movement-type">Movement Type</Label>
                  <Select
                    value={movementType}
                    onValueChange={(val) => setMovementType(val ?? "in")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">In</SelectItem>
                      <SelectItem value="out">Out</SelectItem>
                      <SelectItem value="adjustment">Adjustment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="movement-qty">Quantity</Label>
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
                  <Label htmlFor="movement-desc">Description (optional)</Label>
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
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!movementProductId || !movementQty || recordMovement.isPending}
              >
                {recordMovement.isPending ? "Saving..." : "Record Movement"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Update Stock Levels Sheet */}
      <Sheet open={levelsOpen} onOpenChange={setLevelsOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Update Levels</SheetTitle>
            <SheetDescription>Set min/max levels for {levelsProductName}.</SheetDescription>
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
                  <Label htmlFor="levels-min">Min Level</Label>
                  <Input
                    id="levels-min"
                    type="number"
                    min={0}
                    value={levelsMin}
                    onChange={(e) => setLevelsMin(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="levels-max">Max Level</Label>
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
                Cancel
              </Button>
              <Button type="submit" disabled={updateLevels.isPending}>
                {updateLevels.isPending ? "Saving..." : "Update Levels"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
