import type { components } from "@heyloaf/api-client"
import { AdvancedSelect } from "@heyloaf/ui/components/advanced-select"
import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { DataTable } from "@heyloaf/ui/components/data-table"
import { Input } from "@heyloaf/ui/components/input"
import { Label } from "@heyloaf/ui/components/label"
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

interface RecipeData {
  batch_size: number
  materials: { product_id: string; quantity: number; unit: string }[]
  notes?: string
}

let nextMaterialKey = 0
function createMaterialKey() {
  nextMaterialKey += 1
  return `mat-${nextMaterialKey}`
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
          key: createMaterialKey(),
          product_id: m.product_id,
          quantity: m.quantity,
          unit: m.unit,
        })) ?? []
      )
    } else {
      setBatchSize(1)
      setNotes("")
      setMaterials([])
    }
    setEditorOpen(true)
  }

  function addMaterial() {
    setMaterials((prev) => [
      ...prev,
      { key: createMaterialKey(), product_id: "", quantity: 0, unit: "kg" },
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

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editingProduct) return
      const body = {
        batch_size: batchSize,
        materials: materials
          .filter((m) => m.product_id)
          .map((m) => ({
            product_id: m.product_id,
            quantity: Number(m.quantity),
            unit: m.unit,
          })),
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
