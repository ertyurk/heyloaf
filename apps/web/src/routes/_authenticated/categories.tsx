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
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"
import { useDebounce } from "@/hooks/use-debounce"

type Category = components["schemas"]["Category"]

export const Route = createFileRoute("/_authenticated/categories")({
  component: CategoriesPage,
})

function CategoriesPage() {
  const { t } = useTranslation()
  const client = useApi()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Search and filters
  const [searchQuery, setSearchQuery] = useState("")
  const [posFilter, setPosFilter] = useState<string | undefined>("all")
  const debouncedSearch = useDebounce(searchQuery)

  const POS_VISIBILITY_OPTIONS = useMemo(
    () => [
      { value: "all", label: t("common.all") },
      { value: "visible", label: t("categories.visible") },
      { value: "hidden", label: t("categories.hidden") },
    ],
    [t]
  )

  // Create form state
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    parent_id: "",
    display_order: "0",
    pos_visible: true,
  })

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    parent_id: "",
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

  const columns = useMemo(
    () => [
      {
        id: "name",
        header: t("common.name"),
        cell: (row: Category) => <span className="font-medium">{row.name}</span>,
      },
      {
        id: "description",
        header: t("common.description"),
        cell: (row: Category) => (
          <span className="text-muted-foreground">{row.description ?? "-"}</span>
        ),
      },
      {
        id: "parent",
        header: t("categories.parent"),
        cell: (row: Category) => (
          <span className="text-muted-foreground">
            {row.parent_id ? (categories.find((c) => c.id === row.parent_id)?.name ?? "-") : "-"}
          </span>
        ),
      },
      {
        id: "pos_visible",
        header: t("categories.posVisible"),
        cell: (row: Category) => (
          <Badge variant={row.pos_visible ? "default" : "secondary"}>
            {row.pos_visible ? t("categories.visible") : t("categories.hidden")}
          </Badge>
        ),
      },
      {
        id: "display_order",
        header: t("categories.displayOrder"),
        cell: (row: Category) => <span className="text-muted-foreground">{row.display_order}</span>,
      },
    ],
    [t, categories]
  )

  const createMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: createForm.name,
        display_order: Number(createForm.display_order),
        pos_visible: createForm.pos_visible,
        ...(createForm.description ? { description: createForm.description } : {}),
        ...(createForm.parent_id ? { parent_id: createForm.parent_id } : {}),
      }
      const { error } = await client.POST("/api/categories", { body })
      if (error)
        throw new Error((error as { message?: string }).message ?? "Failed to create category")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      setCreateOpen(false)
      resetCreateForm()
      toast.success(t("categories.categoryCreated"))
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
        ...(editForm.parent_id ? { parent_id: editForm.parent_id } : { parent_id: null }),
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
      toast.success(t("categories.categoryUpdated"))
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
      setConfirmDeleteId(null)
      toast.success(t("categories.categoryDeleted"))
    },
    onError: (err: Error) => {
      setConfirmDeleteId(null)
      toast.error(err.message)
    },
  })

  function resetCreateForm() {
    setCreateForm({
      name: "",
      description: "",
      parent_id: "",
      display_order: "0",
      pos_visible: true,
    })
  }

  function openEditSheet(category: Category) {
    setEditingCategory(category)
    setEditForm({
      name: category.name ?? "",
      description: category.description ?? "",
      parent_id: category.parent_id ?? "",
      display_order: (category.display_order ?? 0).toString(),
      pos_visible: category.pos_visible ?? true,
    })
    setEditOpen(true)
  }

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault()
    createMutation.mutate()
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    updateMutation.mutate()
  }

  function confirmDelete() {
    if (confirmDeleteId) {
      deleteMutation.mutate(confirmDeleteId)
    }
  }

  return (
    <>
      <PageHeader title={t("categories.title")} description={t("categories.description")}>
        <Button onClick={() => setCreateOpen(true)}>{t("categories.newCategory")}</Button>
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
              placeholder={t("categories.searchCategories")}
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <AdvancedSelect
            options={POS_VISIBILITY_OPTIONS}
            value={posFilter}
            onValueChange={setPosFilter}
            placeholder={t("common.all")}
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
          emptyMessage={t("categories.noCategoriesFound")}
          onRowClick={openEditSheet}
          rowActions={(row) => (
            <>
              <DropdownMenuItem onClick={() => openEditSheet(row)}>
                {t("common.edit")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmDeleteId(row.id)}>
                {t("common.delete")}
              </DropdownMenuItem>
            </>
          )}
        />
      </div>

      {/* Create Category Sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("categories.createCategory")}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleCreateSubmit} className="flex flex-col flex-1 overflow-hidden">
            <SheetBody className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="create-cat-name">{t("common.name")} *</Label>
                <Input
                  id="create-cat-name"
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="create-cat-description">{t("common.description")}</Label>
                <Input
                  id="create-cat-description"
                  value={createForm.description}
                  onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("categories.parentCategory")}</Label>
                <Select
                  value={createForm.parent_id}
                  onValueChange={(val) => setCreateForm((f) => ({ ...f, parent_id: val ?? "" }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("categories.noneTopLevel")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t("categories.noneTopLevel")}</SelectItem>
                    {categories.map((cat: Category) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="create-cat-display-order">{t("categories.displayOrder")}</Label>
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
                <Label htmlFor="create-cat-pos-visible">{t("categories.posVisible")}</Label>
              </div>
            </SheetBody>
            <SheetFooter>
              <SheetClose render={<Button variant="outline" />}>{t("common.cancel")}</SheetClose>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? t("common.creating") : t("common.create")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!confirmDeleteId}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
        description={t("categories.confirmDeleteCategory")}
        isPending={deleteMutation.isPending}
      />

      {/* Edit Category Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("categories.editCategory")}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleEditSubmit} className="flex flex-col flex-1 overflow-hidden">
            <SheetBody className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-cat-name">{t("common.name")} *</Label>
                <Input
                  id="edit-cat-name"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-cat-description">{t("common.description")}</Label>
                <Input
                  id="edit-cat-description"
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("categories.parentCategory")}</Label>
                <Select
                  value={editForm.parent_id}
                  onValueChange={(val) => setEditForm((f) => ({ ...f, parent_id: val ?? "" }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("categories.noneTopLevel")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t("categories.noneTopLevel")}</SelectItem>
                    {categories
                      .filter((cat: Category) => cat.id !== editingCategory?.id)
                      .map((cat: Category) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-cat-display-order">{t("categories.displayOrder")}</Label>
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
                <Label htmlFor="edit-cat-pos-visible">{t("categories.posVisible")}</Label>
              </div>
            </SheetBody>
            <SheetFooter>
              <SheetClose render={<Button variant="outline" />}>{t("common.cancel")}</SheetClose>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t("common.saving") : t("common.save")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
