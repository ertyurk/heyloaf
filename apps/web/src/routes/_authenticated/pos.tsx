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
import { useTranslation } from "react-i18next"
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

// --- Barcode detection helpers (outside component to reduce complexity) ---
function isInputElement(target: HTMLElement): boolean {
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  )
}

function isSinglePrintableChar(e: KeyboardEvent): boolean {
  return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
}

function buildPaymentLabel(
  splitMode: boolean,
  splitPayments: SplitPaymentRow[],
  paymentMethodId: string,
  getName: (id: string) => string
): string {
  if (splitMode) {
    return splitPayments
      .map((r) => `${getName(r.methodId)}: ${formatCurrency(r.amount)}`)
      .join(", ")
  }
  return getName(paymentMethodId)
}

function buildPaymentInfo(
  splitMode: boolean,
  splitPayments: SplitPaymentRow[],
  paymentMethodId: string
): Record<string, unknown> {
  if (splitMode) {
    return {
      payments: splitPayments.map((r) => ({
        payment_method_id: r.methodId,
        amount: r.amount,
      })),
    }
  }
  if (paymentMethodId) {
    return { payment_method_id: paymentMethodId }
  }
  return {}
}

function loadSavedCart(): CartItem[] {
  try {
    const saved = localStorage.getItem("heyloaf-pos-cart")
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

function filterProducts(products: Product[], categoryId: string | null, search: string): Product[] {
  let result = products
  if (categoryId) {
    result = result.filter((p) => p.category_id === categoryId)
  }
  if (search) {
    const q = search.toLowerCase()
    result = result.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.code?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q)
    )
  }
  return result
}

// --- Receipt Sheet component ---
interface ReceiptSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: {
    items: CartItem[]
    subtotal: number
    taxTotal: number
    grandTotal: number
    paymentMethod: string
    date: Date
  } | null
  companyName: string
}

function ReceiptSheet({ open, onOpenChange, order, companyName }: ReceiptSheetProps) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" id="pos-receipt-sheet" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("pos.receipt")}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {order && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-lg font-bold">{companyName}</p>
                <p className="text-xs text-muted-foreground">
                  {order.date.toLocaleDateString()} {order.date.toLocaleTimeString()}
                </p>
              </div>
              <Separator />
              <div className="space-y-1.5">
                {order.items.map((item) => (
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
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("common.subtotal")}</span>
                  <span className="tabular-nums">{formatCurrency(order.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("common.tax")}</span>
                  <span className="tabular-nums">{formatCurrency(order.taxTotal)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>{t("common.total")}</span>
                  <span className="tabular-nums">{formatCurrency(order.grandTotal)}</span>
                </div>
              </div>
              <Separator />
              <div className="text-sm">
                <span className="text-muted-foreground">{t("pos.payment")}: </span>
                <span>{order.paymentMethod}</span>
              </div>
            </div>
          )}
        </SheetBody>
        <SheetFooter className="no-print">
          <Button variant="outline" onClick={() => window.print()}>
            {t("common.print")}
          </Button>
          <SheetClose render={<Button>{t("common.close")}</Button>} />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// --- Split Payment UI component ---
interface SplitPaymentPanelProps {
  splitPayments: SplitPaymentRow[]
  paymentMethods: { id: string; name: string }[]
  splitTotal: number
  grandTotal: number
  onUpdateRow: (index: number, field: "methodId" | "amount", value: string | number) => void
  onRemoveRow: (index: number) => void
  onAddRow: () => void
  onCancel: () => void
}

function SplitPaymentPanel({
  splitPayments,
  paymentMethods,
  splitTotal,
  grandTotal,
  onUpdateRow,
  onRemoveRow,
  onAddRow,
  onCancel,
}: SplitPaymentPanelProps) {
  const { t } = useTranslation()
  return (
    <div className="mb-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{t("pos.splitPayment")}</span>
        <Button variant="ghost" size="sm" className="h-6 px-1 text-xs" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
      {splitPayments.map((row) => (
        <div key={row.methodId} className="flex items-center gap-1.5">
          <Select
            value={row.methodId}
            onValueChange={(val) => {
              const idx = splitPayments.findIndex((r) => r.methodId === row.methodId)
              if (idx >= 0) onUpdateRow(idx, "methodId", val as string)
            }}
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
            onChange={(e) => {
              const idx = splitPayments.findIndex((r) => r.methodId === row.methodId)
              if (idx >= 0) onUpdateRow(idx, "amount", Number.parseFloat(e.target.value) || 0)
            }}
            className="h-8 w-24 text-xs tabular-nums"
            placeholder="0.00"
          />
          {splitPayments.length > 2 && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6 text-destructive"
              onClick={() => {
                const idx = splitPayments.findIndex((r) => r.methodId === row.methodId)
                if (idx >= 0) onRemoveRow(idx)
              }}
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
          onClick={onAddRow}
        >
          {t("pos.addMethod")}
        </Button>
        <span
          className={`text-xs tabular-nums ${
            Math.abs(splitTotal - grandTotal) > 0.01 ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {formatCurrency(splitTotal)} / {formatCurrency(grandTotal)}
        </span>
      </div>
    </div>
  )
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: POS page is inherently complex with cart, payments, and keyboard handling
function PosPage() {
  const { t } = useTranslation()
  const client = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const company = useAuthStore((s) => s.company)

  const [cart, setCart] = useState<CartItem[]>(loadSavedCart)
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

  // Park cart label state (replaces window.prompt)
  const [parkLabelOpen, setParkLabelOpen] = useState(false)
  const [parkLabel, setParkLabel] = useState("")

  // Barcode scanner state
  const barcodeBuffer = useRef("")
  const barcodeTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const lastKeyTime = useRef(0)
  const [barcodeActive, setBarcodeActive] = useState(false)

  // Persist cart to localStorage
  useEffect(() => {
    localStorage.setItem("heyloaf-pos-cart", JSON.stringify(cart))
  }, [cart])

  // Debounce cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [])

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
  const filteredProducts = useMemo(
    () => filterProducts(posProducts, selectedCategory, debouncedSearch),
    [posProducts, selectedCategory, debouncedSearch]
  )

  // Get price for a product
  const getProductPrice = useCallback(
    (product: Product): number => {
      const priceItem = priceMap.get(product.id)
      if (priceItem) return priceItem.price
      return 0
    },
    [priceMap]
  )

  // Get tax rate for a product (prefer price list vat_rate, fall back to product tax_rate)
  const getProductTaxRate = useCallback(
    (product: Product): number => {
      const priceItem = priceMap.get(product.id)
      if (priceItem?.vat_rate != null) return priceItem.vat_rate
      return product.tax_rate ?? 0
    },
    [priceMap]
  )

  // Cart operations
  const addToCart = useCallback(
    (product: Product) => {
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
    },
    [getProductPrice, getProductTaxRate]
  )

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

  const setItemQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((item) => item.productId !== productId))
      return
    }
    setCart((prev) =>
      prev.map((item) => (item.productId === productId ? { ...item, quantity } : item))
    )
  }, [])

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

  const updateSplitRow = useCallback(
    (index: number, field: "methodId" | "amount", value: string | number) => {
      setSplitPayments((prev) =>
        prev.map((row, i) => {
          if (i !== index) return row
          if (field === "methodId") return { ...row, methodId: value as string }
          return { ...row, amount: value as number }
        })
      )
    },
    []
  )

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
    const initial: SplitPaymentRow[] = paymentMethods
      .slice(0, 2)
      .map((pm, i) => ({ methodId: pm.id, amount: i === 0 ? grandTotal : 0 }))
    setSplitPayments(initial)
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

      const paymentInfo = buildPaymentInfo(splitMode, splitPayments, paymentMethodId)

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
      const paymentLabel = buildPaymentLabel(
        splitMode,
        splitPayments,
        paymentMethodId,
        getPaymentMethodName
      )
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
      toast.success(t("pos.orderPlaced"))
    },
    onError: () => {
      toast.error(t("pos.failedToPlaceOrder"))
    },
  })

  // --- Park/Retrieve carts ---
  function openParkDialog() {
    if (cart.length === 0) return
    setParkLabel("")
    setParkLabelOpen(true)
  }

  function confirmParkCart() {
    if (!parkLabel.trim()) return
    const parked: ParkedCart = {
      id: crypto.randomUUID(),
      label: parkLabel.trim(),
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
    setParkLabelOpen(false)
    setParkLabel("")
    toast.success(t("pos.cartParked"))
  }

  function retrieveCart(parked: ParkedCart) {
    setCart(parked.items)
    const updated = parkedCarts.filter((c) => c.id !== parked.id)
    setParkedCarts(updated)
    saveParkedCarts(updated)
    toast.success(t("pos.cartRetrieved"))
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
        toast.success(t("pos.addedProduct", { name: product.name }))
      } else {
        toast.error(t("pos.productNotFoundForBarcode", { barcode: trimmed }))
      }
    },
    [posProducts, addToCart, t]
  )

  // Barcode scanner keydown listener
  useEffect(() => {
    function clearBarcodeBuffer() {
      barcodeBuffer.current = ""
      setBarcodeActive(false)
    }

    function resetBarcodeTimer() {
      if (barcodeTimer.current) clearTimeout(barcodeTimer.current)
      barcodeTimer.current = setTimeout(clearBarcodeBuffer, 100)
    }

    function handleBarcodeEnter(e: KeyboardEvent): boolean {
      if (e.key !== "Enter" || barcodeBuffer.current.length <= 2) return false
      e.preventDefault()
      handleBarcodeInput(barcodeBuffer.current)
      barcodeBuffer.current = ""
      setBarcodeActive(false)
      if (barcodeTimer.current) clearTimeout(barcodeTimer.current)
      return true
    }

    function appendToBuffer(char: string) {
      barcodeBuffer.current += char
      setBarcodeActive(barcodeBuffer.current.length > 2)
      resetBarcodeTimer()
    }

    function handleBarcodeChar(e: KeyboardEvent, timeDiff: number) {
      if (!isSinglePrintableChar(e)) return
      const isRapid = timeDiff < 50
      const bufferActive = barcodeBuffer.current.length > 0

      if (!isRapid && !bufferActive) {
        barcodeBuffer.current = e.key
        resetBarcodeTimer()
        return
      }
      // Fresh start when first char wasn't rapid
      if (!bufferActive) {
        barcodeBuffer.current = e.key
      } else {
        appendToBuffer(e.key)
      }
      if (!bufferActive) resetBarcodeTimer()
      if (barcodeBuffer.current.length > 2) e.preventDefault()
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isInputElement(e.target as HTMLElement)) return
      const now = Date.now()
      const timeDiff = now - lastKeyTime.current
      lastKeyTime.current = now
      if (handleBarcodeEnter(e)) return
      handleBarcodeChar(e, timeDiff)
    }

    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [handleBarcodeInput])

  // Keyboard shortcuts
  const handlePlaceOrder = useCallback(() => {
    if (cart.length > 0 && !placeOrder.isPending) {
      if (splitMode && !splitValid) {
        toast.error(t("pos.splitAmountsMustEqual"))
        return
      }
      placeOrder.mutate()
    }
  }, [cart.length, placeOrder, splitMode, splitValid, t])

  const handleExit = useCallback(() => {
    navigate({ to: "/dashboard" })
  }, [navigate])

  // F-key and numpad keyboard shortcut handler
  useEffect(() => {
    function parseFKeyIndex(key: string): number {
      const m = key.match(/^F(\d)$/)
      if (!m) return -1
      return Number.parseInt(m[1]!, 10) - 1
    }

    function handleFKeyShortcut(e: KeyboardEvent) {
      const idx = parseFKeyIndex(e.key)
      if (idx < 0 || idx >= paymentMethods.length) return
      e.preventDefault()
      const methodId = paymentMethods[idx]!.id
      if (!splitMode || splitPayments.length === 0) {
        setPaymentMethodId(methodId)
        return
      }
      const emptyIdx = splitPayments.findIndex((r) => r.amount === 0)
      if (emptyIdx >= 0) updateSplitRow(emptyIdx, "methodId", methodId)
    }

    function handleNumpadShortcut(e: KeyboardEvent) {
      if (selectedCartIndex < 0 || selectedCartIndex >= cart.length) return
      if (!/^(Numpad)?\d$/.test(e.code)) return
      const digit = Number.parseInt(e.key, 10)
      if (Number.isNaN(digit)) return
      e.preventDefault()
      const item = cart[selectedCartIndex]!
      setItemQuantity(item.productId, digit === 0 ? 10 : digit)
    }

    function handleKeyDown(e: KeyboardEvent) {
      const isInput = isInputElement(e.target as HTMLElement)

      if (e.key === "Enter" && !e.repeat && !isInput && barcodeBuffer.current.length <= 2) {
        e.preventDefault()
        handlePlaceOrder()
      }

      if (e.key === "Escape") {
        handleExit()
      }

      handleFKeyShortcut(e)

      if (!isInput) {
        handleNumpadShortcut(e)
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
    setItemQuantity,
    updateSplitRow,
  ])

  // Auto-select default payment method
  useEffect(() => {
    if (!paymentMethodId && paymentMethods.length > 0) {
      const defaultPm = paymentMethods.find((pm) => pm.is_default)
      setPaymentMethodId(defaultPm?.id ?? paymentMethods[0]!.id)
    }
  }, [paymentMethods, paymentMethodId])

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
          <span className="text-sm font-bold tracking-tight text-background">{t("pos.title")}</span>
          {barcodeActive && (
            <Badge variant="secondary" className="text-xs">
              {t("pos.scanning")}
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
            {t("common.exit")}
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
                aria-pressed={selectedCategory === null}
                className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  selectedCategory === null
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                }`}
              >
                {t("pos.allCategories")}
              </button>
              {posCategories.map((cat: Category) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  aria-pressed={selectedCategory === cat.id}
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
                placeholder={t("pos.searchProducts")}
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
                    role="button"
                    tabIndex={0}
                    onClick={() => addToCart(product)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        addToCart(product)
                      }
                    }}
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
                  {t("pos.noProductsFound")}
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
              <span className="text-sm font-medium">{t("pos.cart")}</span>
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
                onClick={openParkDialog}
              >
                {t("pos.park")}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                      {t("pos.parked")}
                      {parkedCarts.length > 0 ? ` (${parkedCarts.length})` : ""}
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" sideOffset={4}>
                  {parkedCarts.length === 0 && (
                    <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                      {t("pos.noParkedCarts")}
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
                          {t("common.delete")}
                        </button>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {pc.itemCount} {t("pos.items")} &middot; {formatCurrency(pc.total)} &middot;{" "}
                        {new Date(pc.timestamp).toLocaleTimeString()}
                      </span>
                    </DropdownMenuItem>
                  ))}
                  {parkedCarts.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1 text-xs text-muted-foreground">
                        {t("pos.clickToRetrieve")}
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
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {t("pos.cartIsEmpty")}
                </div>
              )}
              {cart.map((item, index) => (
                <button
                  type="button"
                  key={item.productId}
                  className={`flex w-full items-center gap-2 rounded-md border p-2 text-left ${
                    selectedCartIndex === index ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => setSelectedCartIndex(index)}
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
                </button>
              ))}
            </div>
          </ScrollArea>

          {/* Cart footer with totals */}
          <div className="shrink-0 border-t">
            <div className="space-y-1 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("common.subtotal")}</span>
                <span className="tabular-nums">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("common.tax")}</span>
                <span className="tabular-nums">{formatCurrency(taxTotal)}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-base font-semibold">
                <span>{t("common.total")}</span>
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
                      <SelectValue placeholder={t("pos.paymentMethod")} />
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
                    {t("pos.splitPayment")}
                  </Button>
                </>
              ) : (
                <SplitPaymentPanel
                  splitPayments={splitPayments}
                  paymentMethods={paymentMethods}
                  splitTotal={splitTotal}
                  grandTotal={grandTotal}
                  onUpdateRow={updateSplitRow}
                  onRemoveRow={removeSplitRow}
                  onAddRow={addSplitRow}
                  onCancel={exitSplitMode}
                />
              )}

              <Button
                className="w-full"
                size="lg"
                disabled={cart.length === 0 || placeOrder.isPending || (splitMode && !splitValid)}
                onClick={() => {
                  if (splitMode && !splitValid) {
                    toast.error(t("pos.splitAmountsMustEqual"))
                    return
                  }
                  placeOrder.mutate()
                }}
              >
                {placeOrder.isPending ? t("pos.placing") : t("pos.placeOrder")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ReceiptSheet
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        order={lastOrder}
        companyName={company?.name ?? "Company"}
      />

      {/* Park Cart Label Sheet (replaces window.prompt) */}
      <Sheet open={parkLabelOpen} onOpenChange={setParkLabelOpen}>
        <SheetContent side="right" className="sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>{t("pos.park")}</SheetTitle>
          </SheetHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              confirmParkCart()
            }}
            className="flex flex-1 flex-col"
          >
            <SheetBody className="grid gap-4">
              <div className="grid gap-2">
                <Input
                  autoFocus
                  value={parkLabel}
                  onChange={(e) => setParkLabel(e.target.value)}
                  placeholder={t("pos.parkCartPlaceholder")}
                  required
                />
              </div>
            </SheetBody>
            <SheetFooter>
              <Button variant="outline" type="button" onClick={() => setParkLabelOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={!parkLabel.trim()}>
                {t("pos.park")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
