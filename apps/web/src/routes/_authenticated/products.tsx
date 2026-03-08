import type { components } from "@heyloaf/api-client"
import { AdvancedSelect } from "@heyloaf/ui/components/advanced-select"
import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { Checkbox } from "@heyloaf/ui/components/checkbox"
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
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@heyloaf/ui/components/sheet"
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

type Product = components["schemas"]["Product"]
type Category = components["schemas"]["Category"]

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
})

const TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "raw", label: "Raw" },
  { value: "semi", label: "Semi" },
  { value: "finished", label: "Finished" },
  { value: "commercial", label: "Commercial" },
  { value: "consumable", label: "Consumable" },
]

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "inactive", label: "Inactive" },
  { value: "active", label: "Active" },
]

const SALE_UNIT_TYPE_OPTIONS = [
  { value: "piece", label: "Piece" },
  { value: "kg", label: "Kg" },
  { value: "litre", label: "Litre" },
]

const PLU_TYPE_OPTIONS = [
  { value: "weight", label: "Weight" },
  { value: "piece", label: "Piece" },
]

function ProductsPage() {
  const client = useApi()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  // Search and filters
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<string | undefined>("")
  const [statusFilter, setStatusFilter] = useState<string | undefined>("")
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null)
  const [debouncedSearch, setDebouncedSearch] = useState("")

  function handleSearchChange(value: string) {
    setSearchQuery(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(value)
    }, 300)
  }

  // Create form state
  const [createForm, setCreateForm] = useState({
    name: "",
    code: "",
    barcode: "",
    category_id: "",
    product_type: "finished",
    unit_of_measure: "piece",
    tax_rate: "",
    stock_tracking: false,
    sale_unit_type: "piece",
    plu_type: "piece",
    plu_code: "",
    scale_enabled: false,
    min_stock_level: "",
  })

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: "",
    code: "",
    barcode: "",
    category_id: "",
    status: "active",
    stock_status: "",
    unit_of_measure: "piece",
    tax_rate: "",
    stock_tracking: false,
    sale_unit_type: "piece",
    plu_type: "piece",
    plu_code: "",
    scale_enabled: false,
    min_stock_level: "",
  })

  const { data, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await client.GET("/api/products")
      return data
    },
  })

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await client.GET("/api/categories")
      return data
    },
  })

  const products = data?.data ?? []
  const categories = categoriesData?.data ?? []

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    return products.filter((p) => {
      if (q && !p.name?.toLowerCase().includes(q) && !p.code?.toLowerCase().includes(q)) {
        return false
      }
      if (typeFilter && p.product_type !== typeFilter) return false
      if (statusFilter && p.status !== statusFilter) return false
      return true
    })
  }, [products, debouncedSearch, typeFilter, statusFilter])

  const columns = [
    {
      id: "code",
      header: "Code",
      cell: (row: Product) => <span className="text-muted-foreground">{row.code ?? "-"}</span>,
    },
    {
      id: "name",
      header: "Name",
      cell: (row: Product) => <span className="font-medium">{row.name}</span>,
    },
    {
      id: "category",
      header: "Category",
      cell: (row: Product) => (
        <span className="text-muted-foreground">
          {categories.find((c: Category) => c.id === row.category_id)?.name ?? "-"}
        </span>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: (row: Product) => <span className="text-muted-foreground">{row.product_type}</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: (row: Product) => (
        <Badge variant={row.status === "active" ? "default" : "secondary"}>
          {row.status === "active" ? "Active" : row.status === "draft" ? "Draft" : "Inactive"}
        </Badge>
      ),
    },
  ]

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: {
        name: string
        product_type: string
        unit_of_measure: string
        stock_tracking?: boolean
        code?: string | null
        barcode?: string | null
        category_id?: string | null
        tax_rate?: number | null
      } = {
        name: createForm.name,
        product_type: createForm.product_type,
        unit_of_measure: createForm.unit_of_measure,
        stock_tracking: createForm.stock_tracking,
      }
      if (createForm.code) body.code = createForm.code
      if (createForm.barcode) body.barcode = createForm.barcode
      if (createForm.category_id) body.category_id = createForm.category_id
      if (createForm.tax_rate) body.tax_rate = Number(createForm.tax_rate)
      const { error } = await client.POST("/api/products", {
        body,
      })
      if (error)
        throw new Error((error as { message?: string }).message ?? "Failed to create product")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      setCreateOpen(false)
      resetCreateForm()
      toast.success("Product created successfully")
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  function buildUpdateBody() {
    return {
      name: editForm.name,
      unit_of_measure: editForm.unit_of_measure,
      stock_tracking: editForm.stock_tracking,
      scale_enabled: editForm.plu_type === "piece" ? false : editForm.scale_enabled,
      status: editForm.status,
      stock_status: editForm.stock_status,
      code: editForm.code || null,
      barcode: editForm.barcode || null,
      category_id: editForm.category_id || null,
      tax_rate: editForm.tax_rate ? Number(editForm.tax_rate) : null,
      sale_unit_type: editForm.sale_unit_type || null,
      plu_type: editForm.plu_type || null,
      plu_code: editForm.plu_code || null,
      min_stock_level: editForm.min_stock_level ? Number(editForm.min_stock_level) : null,
    }
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingProduct) return
      const { error } = await client.PUT("/api/products/{id}", {
        params: { path: { id: editingProduct.id } },
        body: buildUpdateBody(),
      })
      if (error)
        throw new Error((error as { message?: string }).message ?? "Failed to update product")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      setEditOpen(false)
      setEditingProduct(null)
      toast.success("Product updated successfully")
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.DELETE("/api/products/{id}", {
        params: { path: { id } },
      })
      if (error)
        throw new Error((error as { message?: string }).message ?? "Failed to delete product")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      toast.success("Product deleted successfully")
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  function resetCreateForm() {
    setCreateForm({
      name: "",
      code: "",
      barcode: "",
      category_id: "",
      product_type: "finished",
      unit_of_measure: "piece",
      tax_rate: "",
      stock_tracking: false,
      sale_unit_type: "piece",
      plu_type: "piece",
      plu_code: "",
      scale_enabled: false,
      min_stock_level: "",
    })
  }

  function openEditSheet(product: Product) {
    setEditingProduct(product)
    setEditForm({
      name: product.name ?? "",
      code: product.code ?? "",
      barcode: product.barcode ?? "",
      category_id: product.category_id ?? "",
      status: product.status ?? "active",
      stock_status: product.stock_status ?? "",
      unit_of_measure: product.unit_of_measure ?? "piece",
      tax_rate: product.tax_rate?.toString() ?? "",
      stock_tracking: product.stock_tracking ?? false,
      sale_unit_type: product.sale_unit_type ?? "piece",
      plu_type: product.plu_type ?? "piece",
      plu_code: product.plu_code ?? "",
      scale_enabled: product.scale_enabled ?? false,
      min_stock_level: product.min_stock_level?.toString() ?? "",
    })
    setEditOpen(true)
  }

  function handleDelete(id: string) {
    if (window.confirm("Are you sure you want to delete this product?")) {
      deleteMutation.mutate(id)
    }
  }

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault()
    createMutation.mutate()
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    updateMutation.mutate()
  }

  return (
    <>
      <PageHeader title="Products" description="Manage your product catalog">
        <Button onClick={() => setCreateOpen(true)}>New Product</Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        {/* Filter bar */}
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
          <AdvancedSelect
            options={TYPE_OPTIONS}
            value={typeFilter}
            onValueChange={setTypeFilter}
            placeholder="All Types"
            searchable={false}
            className="w-40"
            aria-label="Filter by type"
          />
          <AdvancedSelect
            options={STATUS_OPTIONS}
            value={statusFilter}
            onValueChange={setStatusFilter}
            placeholder="All Statuses"
            searchable={false}
            className="w-40"
            aria-label="Filter by status"
          />
        </div>

        {/* DataTable */}
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No products found. Add your first product to get started."
          onRowClick={openEditSheet}
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

      {/* Create Product Sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Create Product</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleCreateSubmit} className="flex flex-col flex-1 overflow-hidden">
            <SheetBody className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="create-name">Name *</Label>
                <Input
                  id="create-name"
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="create-code">Code</Label>
                <Input
                  id="create-code"
                  value={createForm.code}
                  onChange={(e) => setCreateForm((f) => ({ ...f, code: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="create-barcode">Barcode</Label>
                <Input
                  id="create-barcode"
                  value={createForm.barcode}
                  onChange={(e) => setCreateForm((f) => ({ ...f, barcode: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select
                  value={createForm.category_id}
                  onValueChange={(val) => setCreateForm((f) => ({ ...f, category_id: val ?? "" }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {categories.map((cat: Category) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Product Type</Label>
                <Select
                  value={createForm.product_type}
                  onValueChange={(val) => setCreateForm((f) => ({ ...f, product_type: val ?? "" }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="raw">Raw</SelectItem>
                    <SelectItem value="semi">Semi</SelectItem>
                    <SelectItem value="finished">Finished</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="consumable">Consumable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Unit of Measure</Label>
                <Select
                  value={createForm.unit_of_measure}
                  onValueChange={(val) =>
                    setCreateForm((f) => ({ ...f, unit_of_measure: val ?? "" }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="piece">Piece</SelectItem>
                    <SelectItem value="kg">Kg</SelectItem>
                    <SelectItem value="liter">Liter</SelectItem>
                    <SelectItem value="gram">Gram</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="create-tax-rate">Tax Rate</Label>
                <Input
                  id="create-tax-rate"
                  type="number"
                  step="0.01"
                  value={createForm.tax_rate}
                  onChange={(e) => setCreateForm((f) => ({ ...f, tax_rate: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="create-stock-tracking"
                  checked={createForm.stock_tracking}
                  onCheckedChange={(checked) =>
                    setCreateForm((f) => ({
                      ...f,
                      stock_tracking: checked === true,
                    }))
                  }
                />
                <Label htmlFor="create-stock-tracking">Stock Tracking</Label>
              </div>

              {/* Sale Settings */}
              <div className="border-t pt-4 mt-2">
                <p className="text-sm font-medium mb-3">Sale Settings</p>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>Sale Unit Type</Label>
                    <AdvancedSelect
                      options={SALE_UNIT_TYPE_OPTIONS}
                      value={createForm.sale_unit_type}
                      onValueChange={(val) =>
                        setCreateForm((f) => ({ ...f, sale_unit_type: val ?? "piece" }))
                      }
                      searchable={false}
                      className="w-full"
                      aria-label="Sale unit type"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>PLU Type</Label>
                    <AdvancedSelect
                      options={PLU_TYPE_OPTIONS}
                      value={createForm.plu_type}
                      onValueChange={(val) =>
                        setCreateForm((f) => ({
                          ...f,
                          plu_type: val ?? "piece",
                          ...(val === "piece" ? { scale_enabled: false } : {}),
                        }))
                      }
                      searchable={false}
                      className="w-full"
                      aria-label="PLU type"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="create-plu-code">PLU Code</Label>
                    <Input
                      id="create-plu-code"
                      value={createForm.plu_code}
                      onChange={(e) => setCreateForm((f) => ({ ...f, plu_code: e.target.value }))}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="create-scale-enabled"
                      checked={createForm.scale_enabled}
                      disabled={createForm.plu_type === "piece"}
                      onCheckedChange={(checked) =>
                        setCreateForm((f) => ({
                          ...f,
                          scale_enabled: checked === true,
                        }))
                      }
                    />
                    <Label htmlFor="create-scale-enabled">Scale Enabled</Label>
                    {createForm.plu_type === "piece" && (
                      <span className="text-xs text-muted-foreground">
                        (disabled for piece PLU type)
                      </span>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="create-min-stock-level">Min Stock Level</Label>
                    <Input
                      id="create-min-stock-level"
                      type="number"
                      step="0.01"
                      value={createForm.min_stock_level}
                      onChange={(e) =>
                        setCreateForm((f) => ({ ...f, min_stock_level: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>
            </SheetBody>
            <SheetFooter>
              <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Edit Product Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Edit Product</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleEditSubmit} className="flex flex-col flex-1 overflow-hidden">
            <SheetBody className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Name *</Label>
                <Input
                  id="edit-name"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-code">Code</Label>
                <Input
                  id="edit-code"
                  value={editForm.code}
                  onChange={(e) => setEditForm((f) => ({ ...f, code: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-barcode">Barcode</Label>
                <Input
                  id="edit-barcode"
                  value={editForm.barcode}
                  onChange={(e) => setEditForm((f) => ({ ...f, barcode: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select
                  value={editForm.category_id}
                  onValueChange={(val) => setEditForm((f) => ({ ...f, category_id: val ?? "" }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {categories.map((cat: Category) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Product Type</Label>
                <Input value={editingProduct?.product_type ?? ""} disabled className="capitalize" />
                <p className="text-xs text-muted-foreground">
                  Product type cannot be changed after creation.
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(val) => setEditForm((f) => ({ ...f, status: val ?? "" }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Unit of Measure</Label>
                <Select
                  value={editForm.unit_of_measure}
                  onValueChange={(val) =>
                    setEditForm((f) => ({ ...f, unit_of_measure: val ?? "" }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="piece">Piece</SelectItem>
                    <SelectItem value="kg">Kg</SelectItem>
                    <SelectItem value="liter">Liter</SelectItem>
                    <SelectItem value="gram">Gram</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-tax-rate">Tax Rate</Label>
                <Input
                  id="edit-tax-rate"
                  type="number"
                  step="0.01"
                  value={editForm.tax_rate}
                  onChange={(e) => setEditForm((f) => ({ ...f, tax_rate: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-stock-tracking"
                  checked={editForm.stock_tracking}
                  onCheckedChange={(checked) =>
                    setEditForm((f) => ({
                      ...f,
                      stock_tracking: checked === true,
                    }))
                  }
                />
                <Label htmlFor="edit-stock-tracking">Stock Tracking</Label>
              </div>

              {/* Sale Settings */}
              <div className="border-t pt-4 mt-2">
                <p className="text-sm font-medium mb-3">Sale Settings</p>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>Sale Unit Type</Label>
                    <AdvancedSelect
                      options={SALE_UNIT_TYPE_OPTIONS}
                      value={editForm.sale_unit_type}
                      onValueChange={(val) =>
                        setEditForm((f) => ({ ...f, sale_unit_type: val ?? "piece" }))
                      }
                      searchable={false}
                      className="w-full"
                      aria-label="Sale unit type"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>PLU Type</Label>
                    <AdvancedSelect
                      options={PLU_TYPE_OPTIONS}
                      value={editForm.plu_type}
                      onValueChange={(val) =>
                        setEditForm((f) => ({
                          ...f,
                          plu_type: val ?? "piece",
                          ...(val === "piece" ? { scale_enabled: false } : {}),
                        }))
                      }
                      searchable={false}
                      className="w-full"
                      aria-label="PLU type"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-plu-code">PLU Code</Label>
                    <Input
                      id="edit-plu-code"
                      value={editForm.plu_code}
                      onChange={(e) => setEditForm((f) => ({ ...f, plu_code: e.target.value }))}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="edit-scale-enabled"
                      checked={editForm.scale_enabled}
                      disabled={editForm.plu_type === "piece"}
                      onCheckedChange={(checked) =>
                        setEditForm((f) => ({
                          ...f,
                          scale_enabled: checked === true,
                        }))
                      }
                    />
                    <Label htmlFor="edit-scale-enabled">Scale Enabled</Label>
                    {editForm.plu_type === "piece" && (
                      <span className="text-xs text-muted-foreground">
                        (disabled for piece PLU type)
                      </span>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-min-stock-level">Min Stock Level</Label>
                    <Input
                      id="edit-min-stock-level"
                      type="number"
                      step="0.01"
                      value={editForm.min_stock_level}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, min_stock_level: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>
            </SheetBody>
            <SheetFooter>
              <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
