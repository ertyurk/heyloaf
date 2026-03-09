import type { components } from "@heyloaf/api-client"
import { AdvancedSelect } from "@heyloaf/ui/components/advanced-select"
import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { DataTable } from "@heyloaf/ui/components/data-table"
import { Input } from "@heyloaf/ui/components/input"
import { Label } from "@heyloaf/ui/components/label"
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
import { Textarea } from "@heyloaf/ui/components/textarea"
import { cn } from "@heyloaf/ui/lib/utils"
import ArrowDown01Icon from "@hugeicons/core-free-icons/ArrowDown01Icon"
import ArrowUp01Icon from "@hugeicons/core-free-icons/ArrowUp01Icon"
import DragDropVerticalIcon from "@hugeicons/core-free-icons/DragDropVerticalIcon"
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

type Product = components["schemas"]["Product"]

export const Route = createFileRoute("/_authenticated/recipes")({
  component: RecipesPage,
})

interface RecipeMaterial {
  key: string
  product_id: string
  quantity: number
  unit: string
}

interface RecipeVariant {
  key: string
  name: string
  price_modifier: number
  notes: string
  material_overrides: RecipeMaterial[]
  expanded: boolean
}

interface RecipeData {
  batch_size: number
  materials: { product_id: string; quantity: number; unit: string }[]
  variants?: {
    name: string
    material_overrides: { product_id: string; quantity: number; unit: string }[]
    price_modifier?: number
    notes?: string
  }[]
  notes?: string
}

interface DragHandlers {
  onDragStart: (e: React.DragEvent, variantKey: string, index: number) => void
  onDragOver: (e: React.DragEvent, variantKey: string, index: number) => void
  onDrop: (e: React.DragEvent, variantKey: string, targetIndex: number) => void
  onDragEnd: () => void
  onListDrop: (e: React.DragEvent, variantKey: string) => void
  onListDragOver: (e: React.DragEvent, variantKey: string) => void
  onListDragLeave: (e: React.DragEvent) => void
  dragIndex: { variantKey: string; index: number } | null
  dropTarget: { variantKey: string; index: number } | null
  poolDragOver: string | null
}

interface VariantBodyProps {
  variant: RecipeVariant
  materialOptions: { value: string; label: string }[]
  updateVariant: <F extends keyof RecipeVariant>(
    key: string,
    field: F,
    value: RecipeVariant[F]
  ) => void
  addVariantOverride: (variantKey: string) => void
  removeVariantOverride: (variantKey: string, overrideKey: string) => void
  updateVariantOverride: (
    variantKey: string,
    overrideKey: string,
    field: "product_id" | "quantity" | "unit",
    value: string | number
  ) => void
  removeVariant: (key: string) => void
  drag: DragHandlers
}

function VariantBody({
  variant,
  materialOptions,
  updateVariant,
  addVariantOverride,
  removeVariantOverride,
  updateVariantOverride,
  removeVariant,
  drag,
}: VariantBodyProps) {
  const { t } = useTranslation()
  return (
    <div className="border-t p-3 space-y-3">
      <div className="grid gap-2">
        <Label className="text-xs">{t("recipes.variantName")}</Label>
        <Input
          value={variant.name}
          onChange={(e) => updateVariant(variant.key, "name", e.target.value)}
          placeholder={t("recipes.variantNamePlaceholder")}
        />
      </div>

      <div className="grid gap-2">
        <Label className="text-xs">{t("recipes.priceModifier")}</Label>
        <Input
          type="number"
          step="0.01"
          value={variant.price_modifier}
          onChange={(e) => updateVariant(variant.key, "price_modifier", Number(e.target.value))}
          placeholder="0.00"
        />
        <p className="text-xs text-muted-foreground">{t("recipes.priceModifierDescription")}</p>
      </div>

      <div className="grid gap-2">
        <Label className="text-xs">{t("recipes.productionNotes")}</Label>
        <Textarea
          value={variant.notes}
          onChange={(e) => updateVariant(variant.key, "notes", e.target.value)}
          placeholder={t("recipes.notesPlaceholder")}
          rows={2}
        />
      </div>

      {/* Material overrides */}
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">{t("recipes.materialOverrides")}</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => addVariantOverride(variant.key)}
          >
            {t("recipes.addOverride")}
          </Button>
        </div>

        <div
          role="listbox"
          aria-label={`${variant.name || "Variant"} material overrides`}
          onDrop={(e) => drag.onListDrop(e, variant.key)}
          onDragOver={(e) => drag.onListDragOver(e, variant.key)}
          onDragLeave={drag.onListDragLeave}
          className={cn(
            "min-h-[40px] rounded-md transition-colors",
            drag.poolDragOver === variant.key &&
              variant.material_overrides.length === 0 &&
              "border-2 border-dashed border-primary/50 bg-primary/5"
          )}
        >
          {variant.material_overrides.length === 0 && (
            <p className="text-xs text-muted-foreground py-2 text-center">
              {drag.poolDragOver === variant.key ? "Drop material here" : t("recipes.noOverrides")}
            </p>
          )}

          <div className="space-y-1">
            {variant.material_overrides.map((ovr, ovrIdx) => (
              <div key={ovr.key}>
                {/* Drop indicator line */}
                {drag.dropTarget?.variantKey === variant.key &&
                  drag.dropTarget.index === ovrIdx &&
                  drag.dragIndex !== null &&
                  drag.dragIndex.index !== ovrIdx && (
                    <div className="h-0.5 bg-primary rounded-full mx-2 my-0.5 transition-all" />
                  )}
                <div
                  role="option"
                  tabIndex={0}
                  aria-selected={false}
                  draggable
                  onDragStart={(e) => drag.onDragStart(e, variant.key, ovrIdx)}
                  onDragOver={(e) => drag.onDragOver(e, variant.key, ovrIdx)}
                  onDrop={(e) => drag.onDrop(e, variant.key, ovrIdx)}
                  onDragEnd={drag.onDragEnd}
                  className={cn(
                    "rounded-md border border-dashed p-2 space-y-2 transition-all",
                    drag.dragIndex?.variantKey === variant.key &&
                      drag.dragIndex.index === ovrIdx &&
                      "opacity-40 scale-[0.98]"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors">
                        <HugeiconsIcon icon={DragDropVerticalIcon} size={14} />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {t("recipes.overrideNumber", { number: ovrIdx + 1 })}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-xs text-destructive"
                      onClick={() => removeVariantOverride(variant.key, ovr.key)}
                    >
                      {t("common.remove")}
                    </Button>
                  </div>

                  <AdvancedSelect
                    options={materialOptions}
                    value={ovr.product_id}
                    onValueChange={(val) =>
                      updateVariantOverride(variant.key, ovr.key, "product_id", val ?? "")
                    }
                    placeholder={t("stock.selectProduct")}
                    searchable
                    aria-label={`Variant ${variant.name || "unnamed"} override ${ovrIdx + 1}`}
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1">
                      <Label className="text-xs">{t("common.quantity")}</Label>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        value={ovr.quantity}
                        onChange={(e) =>
                          updateVariantOverride(
                            variant.key,
                            ovr.key,
                            "quantity",
                            Number(e.target.value)
                          )
                        }
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs">{t("common.unit")}</Label>
                      <Input
                        value={ovr.unit}
                        onChange={(e) =>
                          updateVariantOverride(variant.key, ovr.key, "unit", e.target.value)
                        }
                        placeholder="kg, g, L, pcs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {/* Drop indicator at end of overrides list */}
            {variant.material_overrides.length > 0 &&
              drag.dropTarget === null &&
              drag.poolDragOver === variant.key && (
                <div className="h-0.5 bg-primary rounded-full mx-2 my-1 transition-all" />
              )}
          </div>
        </div>
      </div>

      {/* Delete variant */}
      <div className="flex justify-end pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => removeVariant(variant.key)}
        >
          {t("recipes.deleteVariant")}
        </Button>
      </div>
    </div>
  )
}

function RecipesPage() {
  const { t } = useTranslation()
  const client = useApi()
  const queryClient = useQueryClient()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  // Search
  const [searchQuery, setSearchQuery] = useState("")
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null)
  const [debouncedSearch, setDebouncedSearch] = useState("")

  function handleSearchChange(value: string) {
    setSearchQuery(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(value)
    }, 300)
  }

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [])

  // Recipe form state
  const [batchSize, setBatchSize] = useState(1)
  const [notes, setNotes] = useState("")
  const [materials, setMaterials] = useState<RecipeMaterial[]>([])
  const [variants, setVariants] = useState<RecipeVariant[]>([])

  // Drag & drop state for materials
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const [poolDragOver, setPoolDragOver] = useState(false)

  // Drag & drop state for variant overrides (keyed by variant key)
  const [variantDragIndex, setVariantDragIndex] = useState<{
    variantKey: string
    index: number
  } | null>(null)
  const [variantDropTarget, setVariantDropTarget] = useState<{
    variantKey: string
    index: number
  } | null>(null)
  const [variantPoolDragOver, setVariantPoolDragOver] = useState<string | null>(null)

  // Material pool search
  const [poolSearch, setPoolSearch] = useState("")
  const [poolExpanded, setPoolExpanded] = useState(false)

  // --- Master material drag handlers ---

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", String(index))
  }, [])

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault()
      // Only handle reorder when dragging an existing material
      if (dragIndex !== null) {
        e.dataTransfer.dropEffect = "move"
        setDropTargetIndex(index)
      }
    },
    [dragIndex]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault()

      // Handle drop from material pool
      const productId = e.dataTransfer.getData("product-id")
      if (productId) {
        setMaterials((prev) => {
          const newMaterial: RecipeMaterial = {
            key: crypto.randomUUID(),
            product_id: productId,
            quantity: 0,
            unit: "kg",
          }
          const items = [...prev]
          items.splice(targetIndex, 0, newMaterial)
          return items
        })
        setDropTargetIndex(null)
        setPoolDragOver(false)
        return
      }

      // Handle reorder
      if (dragIndex === null || dragIndex === targetIndex) {
        setDropTargetIndex(null)
        return
      }
      setMaterials((prev) => {
        const items = [...prev]
        const [removed] = items.splice(dragIndex, 1)
        items.splice(targetIndex, 0, removed)
        return items
      })
      setDragIndex(null)
      setDropTargetIndex(null)
    },
    [dragIndex]
  )

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setDropTargetIndex(null)
    setPoolDragOver(false)
  }, [])

  // Handle drop on the empty materials list / zone
  const handleListDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const productId = e.dataTransfer.getData("product-id")
    if (productId) {
      setMaterials((prev) => [
        ...prev,
        {
          key: crypto.randomUUID(),
          product_id: productId,
          quantity: 0,
          unit: "kg",
        },
      ])
    }
    setPoolDragOver(false)
    setDropTargetIndex(null)
  }, [])

  const handleListDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
    setPoolDragOver(true)
  }, [])

  const handleListDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving the actual container
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setPoolDragOver(false)
      setDropTargetIndex(null)
    }
  }, [])

  // --- Variant override drag handlers ---

  const handleVariantDragStart = useCallback(
    (e: React.DragEvent, variantKey: string, index: number) => {
      setVariantDragIndex({ variantKey, index })
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/plain", String(index))
    },
    []
  )

  const handleVariantDragOver = useCallback(
    (e: React.DragEvent, variantKey: string, index: number) => {
      e.preventDefault()
      if (variantDragIndex !== null && variantDragIndex.variantKey === variantKey) {
        e.dataTransfer.dropEffect = "move"
        setVariantDropTarget({ variantKey, index })
      }
    },
    [variantDragIndex]
  )

  const handleVariantDrop = useCallback(
    (e: React.DragEvent, variantKey: string, targetIndex: number) => {
      e.preventDefault()

      // Handle drop from material pool
      const productId = e.dataTransfer.getData("product-id")
      if (productId) {
        setVariants((prev) =>
          prev.map((v) =>
            v.key === variantKey
              ? {
                  ...v,
                  material_overrides: [
                    ...v.material_overrides.slice(0, targetIndex),
                    {
                      key: crypto.randomUUID(),
                      product_id: productId,
                      quantity: 0,
                      unit: "kg",
                    },
                    ...v.material_overrides.slice(targetIndex),
                  ],
                }
              : v
          )
        )
        setVariantDropTarget(null)
        setVariantPoolDragOver(null)
        return
      }

      // Handle reorder within same variant
      if (
        variantDragIndex === null ||
        variantDragIndex.variantKey !== variantKey ||
        variantDragIndex.index === targetIndex
      ) {
        setVariantDropTarget(null)
        return
      }
      setVariants((prev) =>
        prev.map((v) => {
          if (v.key !== variantKey) return v
          const items = [...v.material_overrides]
          const [removed] = items.splice(variantDragIndex.index, 1)
          items.splice(targetIndex, 0, removed)
          return { ...v, material_overrides: items }
        })
      )
      setVariantDragIndex(null)
      setVariantDropTarget(null)
    },
    [variantDragIndex]
  )

  const handleVariantDragEnd = useCallback(() => {
    setVariantDragIndex(null)
    setVariantDropTarget(null)
    setVariantPoolDragOver(null)
  }, [])

  const handleVariantListDrop = useCallback((e: React.DragEvent, variantKey: string) => {
    e.preventDefault()
    const productId = e.dataTransfer.getData("product-id")
    if (productId) {
      setVariants((prev) =>
        prev.map((v) =>
          v.key === variantKey
            ? {
                ...v,
                material_overrides: [
                  ...v.material_overrides,
                  {
                    key: crypto.randomUUID(),
                    product_id: productId,
                    quantity: 0,
                    unit: "kg",
                  },
                ],
              }
            : v
        )
      )
    }
    setVariantPoolDragOver(null)
    setVariantDropTarget(null)
  }, [])

  const handleVariantListDragOver = useCallback((e: React.DragEvent, variantKey: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
    setVariantPoolDragOver(variantKey)
  }, [])

  const handleVariantListDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setVariantPoolDragOver(null)
      setVariantDropTarget(null)
    }
  }, [])

  // Fetch all products
  const { data: productsData, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await client.GET("/api/products")
      return data
    },
  })

  const allProducts = productsData?.data ?? []

  // Filter to only SEMI and FINISHED products for the table
  const recipeProducts = useMemo(() => {
    return allProducts.filter((p) => p.product_type === "semi" || p.product_type === "finished")
  }, [allProducts])

  // Products that can be used as materials (RAW, SEMI, COMMERCIAL)
  const materialOptions = useMemo(() => {
    return allProducts
      .filter(
        (p) =>
          p.product_type === "raw" || p.product_type === "semi" || p.product_type === "commercial"
      )
      .map((p) => ({
        value: p.id,
        label: `${p.name}${p.code ? ` (${p.code})` : ""}`,
      }))
  }, [allProducts])

  // Products available in the drag pool (filtered by pool search)
  const materialPoolProducts = useMemo(() => {
    const pool = allProducts.filter(
      (p) =>
        p.product_type === "raw" || p.product_type === "semi" || p.product_type === "commercial"
    )
    if (!poolSearch.trim()) return pool
    const q = poolSearch.toLowerCase()
    return pool.filter(
      (p) => p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q)
    )
  }, [allProducts, poolSearch])

  // Search filter
  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    return recipeProducts.filter((p) => {
      if (q && !p.name?.toLowerCase().includes(q) && !p.code?.toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [recipeProducts, debouncedSearch])

  function getRecipeInfo(product: Product) {
    const recipe = product.recipe as RecipeData | null
    if (!recipe) return { batchSize: "-", materialsCount: 0 }
    return {
      batchSize: recipe.batch_size ?? "-",
      materialsCount: recipe.materials?.length ?? 0,
    }
  }

  const columns = useMemo(
    () => [
      {
        id: "name",
        header: t("recipes.productName"),
        cell: (row: Product) => <span className="font-medium">{row.name}</span>,
      },
      {
        id: "type",
        header: t("common.type"),
        cell: (row: Product) => (
          <Badge variant="secondary" className="capitalize">
            {row.product_type}
          </Badge>
        ),
      },
      {
        id: "batch_size",
        header: t("recipes.batchSize"),
        cell: (row: Product) => (
          <span className="text-muted-foreground">{getRecipeInfo(row).batchSize}</span>
        ),
      },
      {
        id: "materials_count",
        header: t("recipes.materials"),
        cell: (row: Product) => {
          const count = getRecipeInfo(row).materialsCount
          return <span className="text-muted-foreground">{count > 0 ? count : "-"}</span>
        },
      },
      {
        id: "status",
        header: t("recipes.recipe"),
        cell: (row: Product) => {
          const hasRecipe =
            row.recipe &&
            typeof row.recipe === "object" &&
            (row.recipe as RecipeData).materials?.length > 0
          return hasRecipe ? (
            <Badge variant="default">{t("recipes.defined")}</Badge>
          ) : (
            <Badge variant="secondary">{t("recipes.notSet")}</Badge>
          )
        },
      },
    ],
    [t, getRecipeInfo]
  )

  function openRecipeEditor(product: Product) {
    setEditingProduct(product)
    const recipe = product.recipe as RecipeData | null
    if (recipe) {
      setBatchSize(recipe.batch_size ?? 1)
      setNotes(recipe.notes ?? "")
      setMaterials(
        recipe.materials?.map((m) => ({
          key: crypto.randomUUID(),
          product_id: m.product_id,
          quantity: m.quantity,
          unit: m.unit,
        })) ?? []
      )
      setVariants(
        recipe.variants?.map((v) => ({
          key: crypto.randomUUID(),
          name: v.name,
          price_modifier: v.price_modifier ?? 0,
          notes: v.notes ?? "",
          material_overrides:
            v.material_overrides?.map((m) => ({
              key: crypto.randomUUID(),
              product_id: m.product_id,
              quantity: m.quantity,
              unit: m.unit,
            })) ?? [],
          expanded: false,
        })) ?? []
      )
    } else {
      setBatchSize(1)
      setNotes("")
      setMaterials([])
      setVariants([])
    }
    setEditorOpen(true)
  }

  // --- Master material helpers ---

  function addMaterial() {
    setMaterials((prev) => [
      ...prev,
      { key: crypto.randomUUID(), product_id: "", quantity: 0, unit: "kg" },
    ])
  }

  function removeMaterial(key: string) {
    setMaterials((prev) => prev.filter((m) => m.key !== key))
  }

  function updateMaterial(
    key: string,
    field: "product_id" | "quantity" | "unit",
    value: string | number
  ) {
    setMaterials((prev) => prev.map((m) => (m.key === key ? { ...m, [field]: value } : m)))
  }

  // --- Variant helpers ---

  function addVariant() {
    setVariants((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        name: "",
        price_modifier: 0,
        notes: "",
        material_overrides: [],
        expanded: true,
      },
    ])
  }

  function removeVariant(key: string) {
    setVariants((prev) => prev.filter((v) => v.key !== key))
  }

  function updateVariant<F extends keyof RecipeVariant>(
    key: string,
    field: F,
    value: RecipeVariant[F]
  ) {
    setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, [field]: value } : v)))
  }

  function toggleVariant(key: string) {
    setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, expanded: !v.expanded } : v)))
  }

  function addVariantOverride(variantKey: string) {
    setVariants((prev) =>
      prev.map((v) =>
        v.key === variantKey
          ? {
              ...v,
              material_overrides: [
                ...v.material_overrides,
                { key: crypto.randomUUID(), product_id: "", quantity: 0, unit: "kg" },
              ],
            }
          : v
      )
    )
  }

  function removeVariantOverride(variantKey: string, overrideKey: string) {
    setVariants((prev) =>
      prev.map((v) =>
        v.key === variantKey
          ? {
              ...v,
              material_overrides: v.material_overrides.filter((m) => m.key !== overrideKey),
            }
          : v
      )
    )
  }

  function updateVariantOverride(
    variantKey: string,
    overrideKey: string,
    field: "product_id" | "quantity" | "unit",
    value: string | number
  ) {
    setVariants((prev) =>
      prev.map((v) =>
        v.key === variantKey
          ? {
              ...v,
              material_overrides: v.material_overrides.map((m) =>
                m.key === overrideKey ? { ...m, [field]: value } : m
              ),
            }
          : v
      )
    )
  }

  // --- Save ---

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editingProduct) return
      const variantsPayload = variants
        .filter((v) => v.name.trim())
        .map((v) => ({
          name: v.name.trim(),
          price_modifier: v.price_modifier || undefined,
          notes: v.notes.trim() || undefined,
          material_overrides: v.material_overrides
            .filter((m) => m.product_id)
            .map((m) => ({
              product_id: m.product_id,
              quantity: Number(m.quantity),
              unit: m.unit,
            })),
        }))
      const body = {
        batch_size: batchSize,
        materials: materials
          .filter((m) => m.product_id)
          .map((m) => ({
            product_id: m.product_id,
            quantity: Number(m.quantity),
            unit: m.unit,
          })),
        variants: variantsPayload.length > 0 ? variantsPayload : undefined,
        notes: notes || undefined,
      }
      const { error } = await client.PUT(
        `/api/products/${editingProduct.id}/recipe` as never,
        { body } as never
      )
      if (error) throw new Error((error as { message?: string }).message ?? "Failed to save recipe")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      setEditorOpen(false)
      setEditingProduct(null)
      toast.success(t("recipes.recipeSaved"))
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    saveMutation.mutate()
  }

  return (
    <>
      <PageHeader title={t("recipes.title")} description={t("recipes.description")} />

      <div className="space-y-4 p-6">
        {/* Search bar */}
        <div className="flex items-center gap-4">
          <div className="relative w-64">
            <HugeiconsIcon
              icon={Search01Icon}
              size={16}
              className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
            />
            <Input
              placeholder={t("recipes.searchProducts")}
              className="pl-9"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
        </div>

        {/* DataTable */}
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage={t("recipes.noRecipeProducts")}
          onRowClick={openRecipeEditor}
        />
      </div>

      {/* Recipe Editor Sheet */}
      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent side="right" className="sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{t("recipes.recipeFor", { name: editingProduct?.name ?? "" })}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
            <SheetBody className="grid gap-4">
              {/* Material Pool */}
              <div className="rounded-md border bg-muted/30">
                <button
                  type="button"
                  className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => setPoolExpanded(!poolExpanded)}
                >
                  <div className="flex items-center gap-2">
                    <HugeiconsIcon
                      icon={poolExpanded ? ArrowUp01Icon : ArrowDown01Icon}
                      size={14}
                      className="text-muted-foreground"
                    />
                    <span className="text-sm font-medium">{t("recipes.materials")}</span>
                    <span className="text-xs text-muted-foreground">
                      Drag products into materials list
                    </span>
                  </div>
                </button>
                {poolExpanded && (
                  <div className="border-t p-3 space-y-2">
                    <div className="relative">
                      <HugeiconsIcon
                        icon={Search01Icon}
                        size={14}
                        className="text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2"
                      />
                      <Input
                        placeholder="Search materials..."
                        className="pl-8 h-8 text-xs"
                        value={poolSearch}
                        onChange={(e) => setPoolSearch(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                      {materialPoolProducts.length === 0 && (
                        <p className="text-xs text-muted-foreground py-2 w-full text-center">
                          No matching products
                        </p>
                      )}
                      {materialPoolProducts.map((product) => (
                        <div
                          key={product.id}
                          role="option"
                          tabIndex={0}
                          aria-selected={false}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("product-id", product.id)
                            e.dataTransfer.effectAllowed = "copy"
                          }}
                          className="cursor-grab active:cursor-grabbing border rounded px-2 py-1 text-xs bg-background hover:bg-accent transition-colors select-none"
                        >
                          <span className="font-medium">{product.name}</span>
                          {product.code && (
                            <span className="text-muted-foreground ml-1">({product.code})</span>
                          )}
                          <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">
                            {product.product_type}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="batch-size">{t("recipes.batchSize")}</Label>
                <Input
                  id="batch-size"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">{t("recipes.batchSizeDescription")}</p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="recipe-notes">{t("common.notes")}</Label>
                <Textarea
                  id="recipe-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t("recipes.optionalRecipeNotes")}
                  rows={2}
                />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>{t("recipes.materials")}</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addMaterial}>
                    {t("recipes.addMaterial")}
                  </Button>
                </div>

                <div
                  role="listbox"
                  aria-label="Recipe materials"
                  onDrop={handleListDrop}
                  onDragOver={handleListDragOver}
                  onDragLeave={handleListDragLeave}
                  className={cn(
                    "min-h-[60px] rounded-md transition-colors",
                    poolDragOver &&
                      materials.length === 0 &&
                      "border-2 border-dashed border-primary/50 bg-primary/5"
                  )}
                >
                  {materials.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      {poolDragOver ? "Drop material here" : t("recipes.noMaterialsAdded")}
                    </p>
                  )}

                  <div className="space-y-1">
                    {materials.map((mat, idx) => (
                      <div key={mat.key}>
                        {/* Drop indicator line */}
                        {dropTargetIndex === idx && dragIndex !== null && dragIndex !== idx && (
                          <div className="h-0.5 bg-primary rounded-full mx-3 my-0.5 transition-all" />
                        )}
                        <div
                          role="option"
                          tabIndex={0}
                          aria-selected={false}
                          draggable
                          onDragStart={(e) => handleDragStart(e, idx)}
                          onDragOver={(e) => handleDragOver(e, idx)}
                          onDrop={(e) => handleDrop(e, idx)}
                          onDragEnd={handleDragEnd}
                          className={cn(
                            "rounded-md border p-3 space-y-2 transition-all",
                            dragIndex === idx && "opacity-40 scale-[0.98]",
                            dropTargetIndex === idx &&
                              dragIndex === null &&
                              "border-primary/50 bg-primary/5"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors">
                                <HugeiconsIcon icon={DragDropVerticalIcon} size={16} />
                              </div>
                              <span className="text-xs text-muted-foreground font-medium">
                                {t("recipes.materialNumber", { number: idx + 1 })}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-destructive"
                              onClick={() => removeMaterial(mat.key)}
                            >
                              {t("common.remove")}
                            </Button>
                          </div>

                          <div className="grid gap-2">
                            <AdvancedSelect
                              options={materialOptions}
                              value={mat.product_id}
                              onValueChange={(val) =>
                                updateMaterial(mat.key, "product_id", val ?? "")
                              }
                              placeholder={t("stock.selectProduct")}
                              searchable
                              aria-label={`Material ${idx + 1} product`}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="grid gap-1">
                              <Label className="text-xs">{t("common.quantity")}</Label>
                              <Input
                                type="number"
                                step="0.001"
                                min="0"
                                value={mat.quantity}
                                onChange={(e) =>
                                  updateMaterial(mat.key, "quantity", Number(e.target.value))
                                }
                              />
                            </div>
                            <div className="grid gap-1">
                              <Label className="text-xs">{t("common.unit")}</Label>
                              <Input
                                value={mat.unit}
                                onChange={(e) => updateMaterial(mat.key, "unit", e.target.value)}
                                placeholder="kg, g, L, pcs"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {/* Drop indicator at end of list */}
                    {materials.length > 0 && dropTargetIndex === null && poolDragOver && (
                      <div className="h-0.5 bg-primary rounded-full mx-3 my-1 transition-all" />
                    )}
                  </div>
                </div>
              </div>

              {/* Variants Section */}
              <Separator />

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t("recipes.variants")}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("recipes.variantsDescription")}
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                    {t("recipes.addVariant")}
                  </Button>
                </div>

                {variants.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    {t("recipes.noVariantsYet")}
                  </p>
                )}

                <div className="space-y-3">
                  {variants.map((variant) => (
                    <div key={variant.key} className="rounded-md border">
                      {/* Variant header - click to expand/collapse */}
                      <button
                        type="button"
                        className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
                        onClick={() => toggleVariant(variant.key)}
                      >
                        <div className="flex items-center gap-2">
                          <HugeiconsIcon
                            icon={variant.expanded ? ArrowUp01Icon : ArrowDown01Icon}
                            size={14}
                            className="text-muted-foreground"
                          />
                          <span className="text-sm font-medium">
                            {variant.name || t("recipes.unnamedVariant")}
                          </span>
                          {variant.price_modifier !== 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {variant.price_modifier > 0 ? "+" : ""}
                              {variant.price_modifier}
                            </Badge>
                          )}
                          {variant.material_overrides.length > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {variant.material_overrides.length}{" "}
                              {variant.material_overrides.length !== 1
                                ? t("recipes.overrides")
                                : t("recipes.override")}
                            </Badge>
                          )}
                        </div>
                      </button>

                      {/* Variant body */}
                      {variant.expanded && (
                        <VariantBody
                          variant={variant}
                          materialOptions={materialOptions}
                          updateVariant={updateVariant}
                          addVariantOverride={addVariantOverride}
                          removeVariantOverride={removeVariantOverride}
                          updateVariantOverride={updateVariantOverride}
                          removeVariant={removeVariant}
                          drag={{
                            onDragStart: handleVariantDragStart,
                            onDragOver: handleVariantDragOver,
                            onDrop: handleVariantDrop,
                            onDragEnd: handleVariantDragEnd,
                            onListDrop: handleVariantListDrop,
                            onListDragOver: handleVariantListDragOver,
                            onListDragLeave: handleVariantListDragLeave,
                            dragIndex: variantDragIndex,
                            dropTarget: variantDropTarget,
                            poolDragOver: variantPoolDragOver,
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </SheetBody>
            <SheetFooter>
              <SheetClose render={<Button variant="outline" />}>{t("common.cancel")}</SheetClose>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? t("common.saving") : t("recipes.saveRecipe")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
