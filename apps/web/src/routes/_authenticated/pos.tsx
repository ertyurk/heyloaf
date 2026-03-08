import type { components } from "@heyloaf/api-client"
import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { Card, CardContent } from "@heyloaf/ui/components/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@heyloaf/ui/components/dropdown-menu"
import { Input } from "@heyloaf/ui/components/input"
import { ScrollArea } from "@heyloaf/ui/components/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@heyloaf/ui/components/select"
import { Separator } from "@heyloaf/ui/components/separator"
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@heyloaf/ui/components/sheet"
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { useApi } from "@/hooks/use-api"
import { useAuthStore } from "@/lib/auth"
import { formatCurrency } from "@/lib/format-currency"

type Product = components["schemas"]["Product"]
type Category = components["schemas"]["Category"]
type PriceListItem = components["schemas"]["PriceListItem"]

export const Route = createFileRoute("/_authenticated/pos")({
  component: PosPage,
})

interface CartItem {
  productId: string
  name: string
  price: number
  taxRate: number
  quantity: number
}

// --- Parked Carts types ---
interface ParkedCart {
  id: string
  label: string
  items: CartItem[]
  total: number
  itemCount: number
  timestamp: number
}

const PARKED_CARTS_KEY = "heyloaf-parked-carts"

function loadParkedCarts(): ParkedCart[] {
  try {
    const raw = localStorage.getItem(PARKED_CARTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveParkedCarts(carts: ParkedCart[]) {
  localStorage.setItem(PARKED_CARTS_KEY, JSON.stringify(carts))
}

// --- Split payment types ---
interface SplitPaymentRow {
  methodId: string
  amount: number
}

function PosPage() {
  const client = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const company = useAuthStore((s) => s.company)

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem("heyloaf-pos-cart")
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const [paymentMethodId, setPaymentMethodId] = useState<string>("")
  const [selectedCartIndex, setSelectedCartIndex] = useState<number>(-1)

  // Receipt state
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [lastOrder, setLastOrder] = useState<{
    items: CartItem[]
    subtotal: number
    taxTotal: number
    grandTotal: number
    paymentMethod: string
    date: Date
  } | null>(null)

  // Split payment state
  const [splitMode, setSplitMode] = useState(false)
  const [splitPayments, setSplitPayments] = useState<SplitPaymentRow[]>([])

  // Parked carts state
  const [parkedCarts, setParkedCarts] = useState<ParkedCart[]>(loadParkedCarts)

  // Barcode scanner state
  const barcodeBuffer = useRef("")
  const barcodeTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const lastKeyTime = useRef(0)
  const [barcodeActive, setBarcodeActive] = useState(false)

  // Persist cart to localStorage
  useEffect(() => {
    localStorage.setItem("heyloaf-pos-cart", JSON.stringify(cart))
  }, [cart])

  function handleSearchChange(value: string) {
    setSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 300)
  }

  // Fetch products
  const { data: productsData } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await client.GET("/api/products")
      return res.data
    },
  })

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await client.GET("/api/categories")
      return res.data
    },
  })

  // Fetch payment methods
  const { data: paymentMethodsData } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: async () => {
      const res = await client.GET("/api/payment-methods")
      return res.data
    },
  })

  // Fetch default price list and its items
  const { data: priceListsData } = useQuery({
    queryKey: ["price-lists"],
    queryFn: async () => {
      const res = await client.GET("/api/price-lists")
      return res.data
    },
  })

  const defaultPriceList = useMemo(() => {
    const lists = priceListsData?.data ?? []
    return lists.find((pl) => pl.is_default) ?? lists[0]
  }, [priceListsData])

  const { data: priceListItemsData } = useQuery({
    queryKey: ["price-list-items", defaultPriceList?.id],
    queryFn: async () => {
      if (!defaultPriceList) return null
      const res = await client.GET("/api/price-lists/{id}/items", {
        params: { path: { id: defaultPriceList.id } },
      })
      return res.data
    },
    enabled: !!defaultPriceList,
  })

  const priceMap = useMemo(() => {
    const map = new Map<string, PriceListItem>()
    const items = priceListItemsData?.data ?? []
    for (const item of items) {
      map.set(item.product_id, item)
    }
    return map
  }, [priceListItemsData])

  const allProducts = productsData?.data ?? []
  const categories = categoriesData?.data ?? []
  const paymentMethods = paymentMethodsData?.data ?? []

  // Filter: only FINISHED and COMMERCIAL, active status
  const posProducts = useMemo(() => {
    return allProducts.filter(
      (p) =>
        p.status === "active" && (p.product_type === "finished" || p.product_type === "commercial")
    )
  }, [allProducts])

  // POS-visible categories
  const posCategories = useMemo(() => {
    return categories.filter((c: Category) => c.pos_visible)
  }, [categories])

  // Filtered products based on category and search
  const filteredProducts = useMemo(() => {
    let result = posProducts
    if (selectedCategory) {
      result = result.filter((p) => p.category_id === selectedCategory)
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.code?.toLowerCase().includes(q) ||
          p.barcode?.toLowerCase().includes(q)
      )
    }
    return result
  }, [posProducts, selectedCategory, debouncedSearch])

  // Get price for a product
  function getProductPrice(product: Product): number {
    const priceItem = priceMap.get(product.id)
    if (priceItem) return priceItem.price
    return 0
  }

  // Get tax rate for a product (prefer price list vat_rate, fall back to product tax_rate)
  function getProductTaxRate(product: Product): number {
    const priceItem = priceMap.get(product.id)
    if (priceItem?.vat_rate != null) return priceItem.vat_rate
    return product.tax_rate ?? 0
  }

  // Cart operations
  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id)
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: getProductPrice(product),
          taxRate: getProductTaxRate(product),
          quantity: 1,
        },
      ]
    })
  }

  function updateQuantity(productId: string, delta: number) {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.productId !== productId) return item
          const newQty = item.quantity + delta
          return newQty > 0 ? { ...item, quantity: newQty } : null
        })
        .filter(Boolean) as CartItem[]
    })
  }

  function setItemQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      removeFromCart(productId)
      return
    }
    setCart((prev) =>
      prev.map((item) => (item.productId === productId ? { ...item, quantity } : item))
    )
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((item) => item.productId !== productId))
  }

  // Totals
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  }, [cart])

  const taxTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity * (item.taxRate / 100), 0)
  }, [cart])

  const grandTotal = subtotal + taxTotal

  // --- Split payment helpers ---
  function addSplitRow() {
    const usedIds = new Set(splitPayments.map((r) => r.methodId))
    const available = paymentMethods.find((pm) => !usedIds.has(pm.id))
    if (!available) return
    setSplitPayments((prev) => [...prev, { methodId: available.id, amount: 0 }])
  }

  function removeSplitRow(index: number) {
    setSplitPayments((prev) => prev.filter((_, i) => i !== index))
  }

  function updateSplitRow(index: number, field: "methodId" | "amount", value: string | number) {
    setSplitPayments((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row
        if (field === "methodId") return { ...row, methodId: value as string }
        return { ...row, amount: value as number }
      })
    )
  }

  const splitTotal = useMemo(() => {
    return splitPayments.reduce((sum, r) => sum + r.amount, 0)
  }, [splitPayments])

  const splitValid = useMemo(() => {
    if (splitPayments.length < 2) return false
    if (Math.abs(splitTotal - grandTotal) > 0.01) return false
    return splitPayments.every((r) => r.amount > 0 && r.methodId)
  }, [splitPayments, splitTotal, grandTotal])

  function initSplitMode() {
    setSplitMode(true)
    if (paymentMethods.length >= 2) {
      setSplitPayments([
        { methodId: paymentMethods[0]!.id, amount: grandTotal },
        { methodId: paymentMethods[1]!.id, amount: 0 },
      ])
    } else if (paymentMethods.length === 1) {
      setSplitPayments([{ methodId: paymentMethods[0]!.id, amount: grandTotal }])
    }
  }

  function exitSplitMode() {
    setSplitMode(false)
    setSplitPayments([])
  }

  // --- Resolve payment method name ---
  function getPaymentMethodName(id: string): string {
    return paymentMethods.find((pm) => pm.id === id)?.name ?? "Unknown"
  }

  // Place order mutation
  const placeOrder = useMutation({
    mutationFn: async () => {
      const items = cart.map((item) => ({
        product_id: item.productId,
        product_name: item.name,
        quantity: item.quantity,
        unit_price: item.price,
        vat_rate: item.taxRate,
        line_total: item.price * item.quantity,
      }))

      const paymentInfo = splitMode
        ? {
            payments: splitPayments.map((r) => ({
              payment_method_id: r.methodId,
              amount: r.amount,
            })),
          }
        : paymentMethodId
          ? { payment_method_id: paymentMethodId }
          : {}

      await client.POST(
        "/api/orders" as never,
        {
          body: {
            items,
            ...paymentInfo,
          },
        } as never
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })

      // Build receipt data before clearing cart
      const paymentLabel = splitMode
        ? splitPayments
            .map((r) => `${getPaymentMethodName(r.methodId)}: ${formatCurrency(r.amount)}`)
            .join(", ")
        : getPaymentMethodName(paymentMethodId)

      setLastOrder({
        items: [...cart],
        subtotal,
        taxTotal,
        grandTotal,
        paymentMethod: paymentLabel,
        date: new Date(),
      })
      setReceiptOpen(true)

      setCart([])
      localStorage.removeItem("heyloaf-pos-cart")
      setPaymentMethodId("")
      exitSplitMode()
      toast.success("Order placed")
    },
    onError: () => {
      toast.error("Failed to place order")
    },
  })

  // --- Park/Retrieve carts ---
  function parkCart() {
    if (cart.length === 0) return
    const label = prompt("Label for parked cart:")
    if (!label) return
    const parked: ParkedCart = {
      id: crypto.randomUUID(),
      label,
      items: [...cart],
      total: grandTotal,
      itemCount: cart.reduce((sum, item) => sum + item.quantity, 0),
      timestamp: Date.now(),
    }
    const updated = [...parkedCarts, parked]
    setParkedCarts(updated)
    saveParkedCarts(updated)
    setCart([])
    localStorage.removeItem("heyloaf-pos-cart")
    toast.success("Cart parked")
  }

  function retrieveCart(parked: ParkedCart) {
    setCart(parked.items)
    const updated = parkedCarts.filter((c) => c.id !== parked.id)
    setParkedCarts(updated)
    saveParkedCarts(updated)
    toast.success("Cart retrieved")
  }

  function deleteParkedCart(id: string) {
    const updated = parkedCarts.filter((c) => c.id !== id)
    setParkedCarts(updated)
    saveParkedCarts(updated)
  }

  // --- Barcode scanner detection ---
  const handleBarcodeInput = useCallback(
    (barcode: string) => {
      const trimmed = barcode.trim()
      if (!trimmed) return
      const product = posProducts.find((p) => p.barcode === trimmed || p.code === trimmed)
      if (product) {
        addToCart(product)
        toast.success(`Added: ${product.name}`)
      } else {
        toast.error(`Product not found for barcode: ${trimmed}`)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posProducts, priceMap]
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      // Ignore if user is typing in a real input (search, quantity, split amount, etc.)
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return
      }

      const now = Date.now()
      const timeDiff = now - lastKeyTime.current
      lastKeyTime.current = now

      // Detect rapid input (barcode scanner sends chars < 50ms apart)
      if (e.key === "Enter" && barcodeBuffer.current.length > 2) {
        e.preventDefault()
        handleBarcodeInput(barcodeBuffer.current)
        barcodeBuffer.current = ""
        setBarcodeActive(false)
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current)
        return
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (timeDiff < 50 || barcodeBuffer.current.length > 0) {
          // Rapid input detected - likely barcode scanner
          if (barcodeBuffer.current.length === 0 && timeDiff >= 50) {
            // First char - not fast enough, just a regular keypress. Start fresh.
            barcodeBuffer.current = e.key
          } else {
            barcodeBuffer.current += e.key
          }
          setBarcodeActive(barcodeBuffer.current.length > 2)

          // Reset buffer after 100ms of no input
          if (barcodeTimer.current) clearTimeout(barcodeTimer.current)
          barcodeTimer.current = setTimeout(() => {
            barcodeBuffer.current = ""
            setBarcodeActive(false)
          }, 100)

          // Prevent the char from appearing elsewhere if we think it's a barcode
          if (barcodeBuffer.current.length > 2) {
            e.preventDefault()
          }
          return
        }
        // Single regular keypress - start buffer but don't prevent default
        barcodeBuffer.current = e.key
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current)
        barcodeTimer.current = setTimeout(() => {
          barcodeBuffer.current = ""
          setBarcodeActive(false)
        }, 100)
      }
    }

    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [handleBarcodeInput])

  // Keyboard shortcuts
  const handlePlaceOrder = useCallback(() => {
    if (cart.length > 0 && !placeOrder.isPending) {
      if (splitMode && !splitValid) {
        toast.error("Split payment amounts must equal the total")
        return
      }
      placeOrder.mutate()
    }
  }, [cart.length, placeOrder, splitMode, splitValid])

  const handleExit = useCallback(() => {
    navigate({ to: "/dashboard" })
  }, [navigate])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"

      // Enter to place order (not from inputs, not if barcode buffer is active)
      if (e.key === "Enter" && !e.repeat && !isInput && barcodeBuffer.current.length <= 2) {
        e.preventDefault()
        handlePlaceOrder()
      }

      // Escape to exit
      if (e.key === "Escape") {
        handleExit()
      }

      // F1-F8: select payment method
      const fKeyMatch = e.key.match(/^F(\d)$/)
      if (fKeyMatch) {
        const idx = Number.parseInt(fKeyMatch[1]!, 10) - 1
        if (idx >= 0 && idx < paymentMethods.length) {
          e.preventDefault()
          if (splitMode && splitPayments.length > 0) {
            // In split mode, set the first empty row's method
            const emptyIdx = splitPayments.findIndex((r) => r.amount === 0)
            if (emptyIdx >= 0) {
              updateSplitRow(emptyIdx, "methodId", paymentMethods[idx]!.id)
            }
          } else {
            setPaymentMethodId(paymentMethods[idx]!.id)
          }
        }
      }

      // Numpad digits for quick quantity on selected cart item
      if (
        !isInput &&
        selectedCartIndex >= 0 &&
        selectedCartIndex < cart.length &&
        /^(Numpad)?\d$/.test(e.code)
      ) {
        const digit = Number.parseInt(e.key, 10)
        if (!Number.isNaN(digit)) {
          e.preventDefault()
          const item = cart[selectedCartIndex]!
          setItemQuantity(item.productId, digit === 0 ? 10 : digit)
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    handlePlaceOrder,
    handleExit,
    paymentMethods,
    splitMode,
    splitPayments,
    cart,
    selectedCartIndex,
  ])

  // Auto-select default payment method
  useEffect(() => {
    if (!paymentMethodId && paymentMethods.length > 0) {
      const defaultPm = paymentMethods.find((pm) => pm.is_default)
      setPaymentMethodId(defaultPm?.id ?? paymentMethods[0]!.id)
    }
  }, [paymentMethods, paymentMethodId])

  // --- Print receipt ---
  function handlePrintReceipt() {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background print:static print:z-auto">
      {/* Print-specific styles */}
      <style>{`
        @media print {
          body > *:not(#pos-receipt-sheet) { display: none !important; }
          [data-slot="sheet-overlay"] { display: none !important; }
          [data-slot="sheet-content"] {
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            border: none !important;
            box-shadow: none !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b bg-foreground px-4 no-print">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold tracking-tight text-background">Point of Sale</span>
          {barcodeActive && (
            <Badge variant="secondary" className="text-xs">
              Scanning...
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-background hover:bg-background/20 hover:text-background"
            onClick={handleExit}
          >
            Exit
          </Button>
        </div>
      </div>

      {/* Main content: 3-column layout */}
      <div className="flex flex-1 overflow-hidden no-print">
        {/* Left: Category sidebar */}
        <div className="flex w-48 shrink-0 flex-col border-r bg-muted">
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-0.5 p-2">
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  selectedCategory === null
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                }`}
              >
                All
              </button>
              {posCategories.map((cat: Category) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    selectedCategory === cat.id
                      ? "bg-background font-medium text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Center: Product grid */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Search bar */}
          <div className="shrink-0 border-b p-3">
            <div className="relative">
              <HugeiconsIcon
                icon={Search01Icon}
                size={16}
                className="text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2"
              />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {/* Grid */}
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-3 gap-2 p-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredProducts.map((product) => {
                const price = getProductPrice(product)
                return (
                  <Card
                    key={product.id}
                    className="cursor-pointer transition-colors hover:bg-accent"
                    onClick={() => addToCart(product)}
                  >
                    <CardContent className="flex flex-col items-start gap-1 p-3">
                      <span className="line-clamp-2 text-sm font-medium leading-tight">
                        {product.name}
                      </span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {price > 0 ? formatCurrency(price) : "--"}
                      </span>
                    </CardContent>
                  </Card>
                )
              })}
              {filteredProducts.length === 0 && (
                <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
                  No products found
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: Cart */}
        <div className="flex w-80 shrink-0 flex-col border-l">
          {/* Cart header with park/retrieve */}
          <div className="flex h-10 shrink-0 items-center justify-between border-b px-4">
            <div className="flex items-center">
              <span className="text-sm font-medium">Cart</span>
              {cart.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {cart.reduce((sum, item) => sum + item.quantity, 0)}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={cart.length === 0}
                onClick={parkCart}
              >
                Park
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                      Parked{parkedCarts.length > 0 ? ` (${parkedCarts.length})` : ""}
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" sideOffset={4}>
                  {parkedCarts.length === 0 && (
                    <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                      No parked carts
                    </div>
                  )}
                  {parkedCarts.map((pc) => (
                    <DropdownMenuItem
                      key={pc.id}
                      onSelect={() => retrieveCart(pc)}
                      className="flex flex-col items-start gap-0.5"
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="font-medium">{pc.label}</span>
                        <button
                          type="button"
                          className="ml-2 text-xs text-destructive hover:underline"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteParkedCart(pc.id)
                          }}
                        >
                          Delete
                        </button>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {pc.itemCount} items &middot; {formatCurrency(pc.total)} &middot;{" "}
                        {new Date(pc.timestamp).toLocaleTimeString()}
                      </span>
                    </DropdownMenuItem>
                  ))}
                  {parkedCarts.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1 text-xs text-muted-foreground">
                        Click to retrieve
                      </div>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Cart items */}
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-1 p-2">
              {cart.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">Cart is empty</div>
              )}
              {cart.map((item, index) => (
                <div
                  key={item.productId}
                  className={`flex items-center gap-2 rounded-md border p-2 cursor-pointer ${
                    selectedCartIndex === index ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => setSelectedCartIndex(index)}
                  onKeyDown={() => {}}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {formatCurrency(item.price)} x {item.quantity}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        updateQuantity(item.productId, -1)
                      }}
                    >
                      -
                    </Button>
                    <span className="w-6 text-center text-sm tabular-nums">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        updateQuantity(item.productId, 1)
                      }}
                    >
                      +
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFromCart(item.productId)
                      }}
                    >
                      &times;
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Cart footer with totals */}
          <div className="shrink-0 border-t">
            <div className="space-y-1 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span className="tabular-nums">{formatCurrency(taxTotal)}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(grandTotal)}</span>
              </div>
            </div>

            <div className="border-t p-3">
              {/* Payment method selection */}
              {!splitMode ? (
                <>
                  <Select
                    value={paymentMethodId}
                    onValueChange={(val) => setPaymentMethodId(val as string)}
                  >
                    <SelectTrigger className="mb-2 w-full">
                      <SelectValue placeholder="Payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((pm) => (
                        <SelectItem key={pm.id} value={pm.id}>
                          {pm.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mb-2 w-full text-xs"
                    disabled={paymentMethods.length < 2}
                    onClick={initSplitMode}
                  >
                    Split Payment
                  </Button>
                </>
              ) : (
                <div className="mb-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Split Payment</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1 text-xs"
                      onClick={exitSplitMode}
                    >
                      Cancel
                    </Button>
                  </div>
                  {splitPayments.map((row, idx) => (
                    <div key={`split-${idx}-${row.methodId}`} className="flex items-center gap-1.5">
                      <Select
                        value={row.methodId}
                        onValueChange={(val) => updateSplitRow(idx, "methodId", val as string)}
                      >
                        <SelectTrigger className="h-8 flex-1 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {paymentMethods.map((pm) => (
                            <SelectItem key={pm.id} value={pm.id}>
                              {pm.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={row.amount || ""}
                        onChange={(e) =>
                          updateSplitRow(idx, "amount", Number.parseFloat(e.target.value) || 0)
                        }
                        className="h-8 w-24 text-xs tabular-nums"
                        placeholder="0.00"
                      />
                      {splitPayments.length > 2 && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-6 w-6 text-destructive"
                          onClick={() => removeSplitRow(idx)}
                        >
                          &times;
                        </Button>
                      )}
                    </div>
                  ))}
                  <div className="flex items-center justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs"
                      disabled={splitPayments.length >= paymentMethods.length}
                      onClick={addSplitRow}
                    >
                      + Add Method
                    </Button>
                    <span
                      className={`text-xs tabular-nums ${
                        Math.abs(splitTotal - grandTotal) > 0.01
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                    >
                      {formatCurrency(splitTotal)} / {formatCurrency(grandTotal)}
                    </span>
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                size="lg"
                disabled={cart.length === 0 || placeOrder.isPending || (splitMode && !splitValid)}
                onClick={() => {
                  if (splitMode && !splitValid) {
                    toast.error("Split payment amounts must equal the total")
                    return
                  }
                  placeOrder.mutate()
                }}
              >
                {placeOrder.isPending ? "Placing..." : "Place Order"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Receipt Sheet */}
      <Sheet open={receiptOpen} onOpenChange={setReceiptOpen}>
        <SheetContent side="right" id="pos-receipt-sheet" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Receipt</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {lastOrder && (
              <div className="space-y-4">
                {/* Company name */}
                <div className="text-center">
                  <p className="text-lg font-bold">{company?.name ?? "Company"}</p>
                  <p className="text-xs text-muted-foreground">
                    {lastOrder.date.toLocaleDateString()} {lastOrder.date.toLocaleTimeString()}
                  </p>
                </div>

                <Separator />

                {/* Items */}
                <div className="space-y-1.5">
                  {lastOrder.items.map((item) => (
                    <div key={item.productId} className="flex items-start justify-between text-sm">
                      <div>
                        <span>{item.name}</span>
                        <span className="ml-1 text-xs text-muted-foreground">x{item.quantity}</span>
                        <span className="ml-1 text-xs text-muted-foreground">
                          @ {formatCurrency(item.price)}
                        </span>
                      </div>
                      <span className="tabular-nums">
                        {formatCurrency(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                <Separator />

                {/* Totals */}
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="tabular-nums">{formatCurrency(lastOrder.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="tabular-nums">{formatCurrency(lastOrder.taxTotal)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>Total</span>
                    <span className="tabular-nums">{formatCurrency(lastOrder.grandTotal)}</span>
                  </div>
                </div>

                <Separator />

                {/* Payment method */}
                <div className="text-sm">
                  <span className="text-muted-foreground">Payment: </span>
                  <span>{lastOrder.paymentMethod}</span>
                </div>
              </div>
            )}
          </SheetBody>
          <SheetFooter className="no-print">
            <Button variant="outline" onClick={handlePrintReceipt}>
              Print
            </Button>
            <SheetClose render={<Button>Close</Button>} />
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
