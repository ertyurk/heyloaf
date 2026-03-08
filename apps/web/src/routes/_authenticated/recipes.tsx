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
import ArrowDown01Icon from "@hugeicons/core-free-icons/ArrowDown01Icon"
import ArrowUp01Icon from "@hugeicons/core-free-icons/ArrowUp01Icon"
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useRef, useState } from "react"
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

function RecipesPage() {
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

  // Recipe form state
  const [batchSize, setBatchSize] = useState(1)
  const [notes, setNotes] = useState("")
  const [materials, setMaterials] = useState<RecipeMaterial[]>([])
  const [variants, setVariants] = useState<RecipeVariant[]>([])

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

  const columns = [
    {
      id: "name",
      header: "Product Name",
      cell: (row: Product) => <span className="font-medium">{row.name}</span>,
    },
    {
      id: "type",
      header: "Type",
      cell: (row: Product) => (
        <Badge variant="secondary" className="capitalize">
          {row.product_type}
        </Badge>
      ),
    },
    {
      id: "batch_size",
      header: "Batch Size",
      cell: (row: Product) => (
        <span className="text-muted-foreground">{getRecipeInfo(row).batchSize}</span>
      ),
    },
    {
      id: "materials_count",
      header: "Materials",
      cell: (row: Product) => {
        const count = getRecipeInfo(row).materialsCount
        return <span className="text-muted-foreground">{count > 0 ? count : "-"}</span>
      },
    },
    {
      id: "status",
      header: "Recipe",
      cell: (row: Product) => {
        const hasRecipe =
          row.recipe &&
          typeof row.recipe === "object" &&
          (row.recipe as RecipeData).materials?.length > 0
        return hasRecipe ? (
          <Badge variant="default">Defined</Badge>
        ) : (
          <Badge variant="secondary">Not set</Badge>
        )
      },
    },
  ]

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
      toast.success("Recipe saved successfully")
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
      <PageHeader title="Recipes" description="Manage product recipes and bills of materials" />

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
              placeholder="Search products..."
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
          emptyMessage="No products with recipe support found. Create SEMI or FINISHED products first."
          onRowClick={openRecipeEditor}
        />
      </div>

      {/* Recipe Editor Sheet */}
      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Recipe: {editingProduct?.name ?? ""}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
            <SheetBody className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="batch-size">Batch Size</Label>
                <Input
                  id="batch-size"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">How many units this recipe produces</p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="recipe-notes">Notes</Label>
                <Textarea
                  id="recipe-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional recipe notes..."
                  rows={2}
                />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>Materials</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addMaterial}>
                    Add Material
                  </Button>
                </div>

                {materials.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No materials added yet. Click "Add Material" to start building the recipe.
                  </p>
                )}

                <div className="space-y-3">
                  {materials.map((mat, idx) => (
                    <div key={mat.key} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-medium">
                          Material {idx + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-destructive"
                          onClick={() => removeMaterial(mat.key)}
                        >
                          Remove
                        </Button>
                      </div>

                      <div className="grid gap-2">
                        <AdvancedSelect
                          options={materialOptions}
                          value={mat.product_id}
                          onValueChange={(val) => updateMaterial(mat.key, "product_id", val ?? "")}
                          placeholder="Select product"
                          searchable
                          aria-label={`Material ${idx + 1} product`}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="grid gap-1">
                          <Label className="text-xs">Quantity</Label>
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
                          <Label className="text-xs">Unit</Label>
                          <Input
                            value={mat.unit}
                            onChange={(e) => updateMaterial(mat.key, "unit", e.target.value)}
                            placeholder="kg, g, L, pcs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Variants Section */}
              <Separator />

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Variants</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Named variations with material overrides and price modifiers
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                    Add Variant
                  </Button>
                </div>

                {variants.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No variants yet. Add variants like "Chocolate", "Gluten-Free", etc.
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
                            {variant.name || "Unnamed variant"}
                          </span>
                          {variant.price_modifier !== 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {variant.price_modifier > 0 ? "+" : ""}
                              {variant.price_modifier}
                            </Badge>
                          )}
                          {variant.material_overrides.length > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {variant.material_overrides.length} override
                              {variant.material_overrides.length !== 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>
                      </button>

                      {/* Variant body */}
                      {variant.expanded && (
                        <div className="border-t p-3 space-y-3">
                          <div className="grid gap-2">
                            <Label className="text-xs">Variant Name</Label>
                            <Input
                              value={variant.name}
                              onChange={(e) => updateVariant(variant.key, "name", e.target.value)}
                              placeholder='e.g., "Chocolate", "Gluten-Free"'
                            />
                          </div>

                          <div className="grid gap-2">
                            <Label className="text-xs">Price Modifier</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={variant.price_modifier}
                              onChange={(e) =>
                                updateVariant(variant.key, "price_modifier", Number(e.target.value))
                              }
                              placeholder="0.00"
                            />
                            <p className="text-xs text-muted-foreground">
                              Positive to add, negative to subtract from base price
                            </p>
                          </div>

                          <div className="grid gap-2">
                            <Label className="text-xs">Production Notes</Label>
                            <Textarea
                              value={variant.notes}
                              onChange={(e) => updateVariant(variant.key, "notes", e.target.value)}
                              placeholder="Notes specific to this variant..."
                              rows={2}
                            />
                          </div>

                          {/* Material overrides */}
                          <div className="grid gap-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs">Material Overrides</Label>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => addVariantOverride(variant.key)}
                              >
                                Add Override
                              </Button>
                            </div>

                            {variant.material_overrides.length === 0 && (
                              <p className="text-xs text-muted-foreground py-2 text-center">
                                No overrides. Add materials to change from the master recipe.
                              </p>
                            )}

                            <div className="space-y-2">
                              {variant.material_overrides.map((ovr, ovrIdx) => (
                                <div
                                  key={ovr.key}
                                  className="rounded-md border border-dashed p-2 space-y-2"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">
                                      Override {ovrIdx + 1}
                                    </span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 px-1.5 text-xs text-destructive"
                                      onClick={() => removeVariantOverride(variant.key, ovr.key)}
                                    >
                                      Remove
                                    </Button>
                                  </div>

                                  <AdvancedSelect
                                    options={materialOptions}
                                    value={ovr.product_id}
                                    onValueChange={(val) =>
                                      updateVariantOverride(
                                        variant.key,
                                        ovr.key,
                                        "product_id",
                                        val ?? ""
                                      )
                                    }
                                    placeholder="Select product"
                                    searchable
                                    aria-label={`Variant ${variant.name || "unnamed"} override ${ovrIdx + 1}`}
                                  />

                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="grid gap-1">
                                      <Label className="text-xs">Quantity</Label>
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
                                      <Label className="text-xs">Unit</Label>
                                      <Input
                                        value={ovr.unit}
                                        onChange={(e) =>
                                          updateVariantOverride(
                                            variant.key,
                                            ovr.key,
                                            "unit",
                                            e.target.value
                                          )
                                        }
                                        placeholder="kg, g, L, pcs"
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}
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
                              Delete Variant
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </SheetBody>
            <SheetFooter>
              <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save Recipe"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
