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

type Category = components["schemas"]["Category"]

export const Route = createFileRoute("/_authenticated/categories")({
  component: CategoriesPage,
})

const POS_VISIBILITY_OPTIONS = [
  { value: "", label: "All" },
  { value: "visible", label: "Visible" },
  { value: "hidden", label: "Hidden" },
]

function CategoriesPage() {
  const client = useApi()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)

  // Search and filters
  const [searchQuery, setSearchQuery] = useState("")
  const [posFilter, setPosFilter] = useState<string | undefined>("")
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
    description: "",
    display_order: "0",
    pos_visible: true,
  })

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    display_order: "0",
    pos_visible: true,
  })

  const { data, isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await client.GET("/api/categories")
      return data
    },
  })

  const categories = data?.data ?? []

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    return categories.filter((c) => {
      if (q && !c.name?.toLowerCase().includes(q)) return false
      if (posFilter === "visible" && !c.pos_visible) return false
      if (posFilter === "hidden" && c.pos_visible) return false
      return true
    })
  }, [categories, debouncedSearch, posFilter])

  const columns = [
    {
      id: "name",
      header: "Name",
      cell: (row: Category) => <span className="font-medium">{row.name}</span>,
    },
    {
      id: "description",
      header: "Description",
      cell: (row: Category) => (
        <span className="text-muted-foreground">{row.description ?? "-"}</span>
      ),
    },
    {
      id: "parent",
      header: "Parent",
      cell: (row: Category) => (
        <span className="text-muted-foreground">
          {row.parent_id ? (categories.find((c) => c.id === row.parent_id)?.name ?? "-") : "-"}
        </span>
      ),
    },
    {
      id: "pos_visible",
      header: "POS Visible",
      cell: (row: Category) => (
        <Badge variant={row.pos_visible ? "default" : "secondary"}>
          {row.pos_visible ? "Visible" : "Hidden"}
        </Badge>
      ),
    },
    {
      id: "display_order",
      header: "Display Order",
      cell: (row: Category) => <span className="text-muted-foreground">{row.display_order}</span>,
    },
  ]

  const createMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: createForm.name,
        display_order: Number(createForm.display_order),
        pos_visible: createForm.pos_visible,
        ...(createForm.description ? { description: createForm.description } : {}),
      }
      const { error } = await client.POST("/api/categories", { body })
      if (error)
        throw new Error((error as { message?: string }).message ?? "Failed to create category")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      setCreateOpen(false)
      resetCreateForm()
      toast.success("Category created successfully")
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingCategory) return
      const body = {
        name: editForm.name,
        display_order: Number(editForm.display_order),
        pos_visible: editForm.pos_visible,
        ...(editForm.description ? { description: editForm.description } : {}),
      }
      const { error } = await client.PUT("/api/categories/{id}", {
        params: { path: { id: editingCategory.id } },
        body,
      })
      if (error)
        throw new Error((error as { message?: string }).message ?? "Failed to update category")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      setEditOpen(false)
      setEditingCategory(null)
      toast.success("Category updated successfully")
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.DELETE("/api/categories/{id}", {
        params: { path: { id } },
      })
      if (error)
        throw new Error((error as { message?: string }).message ?? "Failed to delete category")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      toast.success("Category deleted successfully")
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  function resetCreateForm() {
    setCreateForm({
      name: "",
      description: "",
      display_order: "0",
      pos_visible: true,
    })
  }

  function openEditSheet(category: Category) {
    setEditingCategory(category)
    setEditForm({
      name: category.name ?? "",
      description: category.description ?? "",
      display_order: (category.display_order ?? 0).toString(),
      pos_visible: category.pos_visible ?? true,
    })
    setEditOpen(true)
  }

  function handleDelete(id: string) {
    if (window.confirm("Are you sure you want to delete this category?")) {
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
      <PageHeader title="Categories" description="Organize your products into categories">
        <Button onClick={() => setCreateOpen(true)}>New Category</Button>
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
              placeholder="Search categories..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          <AdvancedSelect
            options={POS_VISIBILITY_OPTIONS}
            value={posFilter}
            onValueChange={setPosFilter}
            placeholder="All"
            searchable={false}
            className="w-40"
            aria-label="Filter by POS visibility"
          />
        </div>

        {/* DataTable */}
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No categories found. Add your first category to get started."
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

      {/* Create Category Sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Create Category</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleCreateSubmit} className="flex flex-col flex-1 overflow-hidden">
            <SheetBody className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="create-cat-name">Name *</Label>
                <Input
                  id="create-cat-name"
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="create-cat-description">Description</Label>
                <Input
                  id="create-cat-description"
                  value={createForm.description}
                  onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="create-cat-display-order">Display Order</Label>
                <Input
                  id="create-cat-display-order"
                  type="number"
                  value={createForm.display_order}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      display_order: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="create-cat-pos-visible"
                  checked={createForm.pos_visible}
                  onCheckedChange={(checked) =>
                    setCreateForm((f) => ({
                      ...f,
                      pos_visible: checked === true,
                    }))
                  }
                />
                <Label htmlFor="create-cat-pos-visible">POS Visible</Label>
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

      {/* Edit Category Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Edit Category</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleEditSubmit} className="flex flex-col flex-1 overflow-hidden">
            <SheetBody className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-cat-name">Name *</Label>
                <Input
                  id="edit-cat-name"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-cat-description">Description</Label>
                <Input
                  id="edit-cat-description"
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-cat-display-order">Display Order</Label>
                <Input
                  id="edit-cat-display-order"
                  type="number"
                  value={editForm.display_order}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      display_order: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-cat-pos-visible"
                  checked={editForm.pos_visible}
                  onCheckedChange={(checked) =>
                    setEditForm((f) => ({
                      ...f,
                      pos_visible: checked === true,
                    }))
                  }
                />
                <Label htmlFor="edit-cat-pos-visible">POS Visible</Label>
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
