import type { components } from "@heyloaf/api-client"
import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { Card, CardContent } from "@heyloaf/ui/components/card"
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
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { useApi } from "@/hooks/use-api"
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

function PosPage() {
  const client = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

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
      await client.POST(
        "/api/orders" as never,
        {
          body: {
            items,
            ...(paymentMethodId ? { payment_method_id: paymentMethodId } : {}),
          },
        } as never
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      setCart([])
      localStorage.removeItem("heyloaf-pos-cart")
      setPaymentMethodId("")
      toast.success("Order placed")
    },
    onError: () => {
      toast.error("Failed to place order")
    },
  })

  // Keyboard shortcuts
  const handlePlaceOrder = useCallback(() => {
    if (cart.length > 0 && !placeOrder.isPending) {
      placeOrder.mutate()
    }
  }, [cart.length, placeOrder])

  const handleExit = useCallback(() => {
    navigate({ to: "/dashboard" })
  }, [navigate])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter" && !e.repeat) {
        const tag = (e.target as HTMLElement).tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
        e.preventDefault()
        handlePlaceOrder()
      }
      if (e.key === "Escape") {
        handleExit()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handlePlaceOrder, handleExit])

  // Auto-select default payment method
  useEffect(() => {
    if (!paymentMethodId && paymentMethods.length > 0) {
      const defaultPm = paymentMethods.find((pm) => pm.is_default)
      setPaymentMethodId(defaultPm?.id ?? paymentMethods[0]!.id)
    }
  }, [paymentMethods, paymentMethodId])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b bg-foreground px-4">
        <span className="text-sm font-bold tracking-tight text-background">Point of Sale</span>
        <Button
          variant="ghost"
          size="sm"
          className="text-background hover:bg-background/20 hover:text-background"
          onClick={handleExit}
        >
          Exit
        </Button>
      </div>

      {/* Main content: 3-column layout */}
      <div className="flex flex-1 overflow-hidden">
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
          {/* Cart header */}
          <div className="flex h-10 shrink-0 items-center border-b px-4">
            <span className="text-sm font-medium">Cart</span>
            {cart.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {cart.reduce((sum, item) => sum + item.quantity, 0)}
              </Badge>
            )}
          </div>

          {/* Cart items */}
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-1 p-2">
              {cart.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">Cart is empty</div>
              )}
              {cart.map((item) => (
                <div key={item.productId} className="flex items-center gap-2 rounded-md border p-2">
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
                      onClick={() => updateQuantity(item.productId, -1)}
                    >
                      -
                    </Button>
                    <span className="w-6 text-center text-sm tabular-nums">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => updateQuantity(item.productId, 1)}
                    >
                      +
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive"
                      onClick={() => removeFromCart(item.productId)}
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
                className="w-full"
                size="lg"
                disabled={cart.length === 0 || placeOrder.isPending}
                onClick={() => placeOrder.mutate()}
              >
                {placeOrder.isPending ? "Placing..." : "Place Order"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
