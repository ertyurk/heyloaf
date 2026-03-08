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
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@heyloaf/ui/components/sheet"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

export const Route = createFileRoute("/_authenticated/settings/price-lists")({
  component: PriceListsPage,
})

const channelTypes = [
  { value: "pos", label: "POS" },
  { value: "marketplace", label: "Marketplace" },
  { value: "wholesale", label: "Wholesale" },
  { value: "online", label: "Online" },
] as const

interface PriceListForm {
  name: string
  channel_type: string
  marketplace_channel_id: string
  city: string
  is_default: boolean
}

const emptyForm: PriceListForm = {
  name: "",
  channel_type: "pos",
  marketplace_channel_id: "",
  city: "",
  is_default: false,
}

function PriceListsPage() {
  const client = useApi()
  const queryClient = useQueryClient()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PriceListForm>(emptyForm)

  const { data, isLoading } = useQuery({
    queryKey: ["price-lists"],
    queryFn: async () => {
      const res = await client.GET("/api/price-lists")
      return res.data
    },
  })

  const priceLists = data?.data ?? []

  const createMutation = useMutation({
    mutationFn: async (body: {
      name: string
      channel_type: string
      marketplace_channel_id?: string
      city?: string
      is_default: boolean
    }) => {
      const res = await client.POST("/api/price-lists", { body })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-lists"] })
      toast.success("Price list created")
      closeSheet()
    },
    onError: () => toast.error("Failed to create price list"),
  })

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string
      body: {
        name: string
        channel_type: string
        marketplace_channel_id?: string
        city?: string
        is_default: boolean
      }
    }) => {
      const res = await client.PUT("/api/price-lists/{id}", {
        params: { path: { id } },
        body,
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-lists"] })
      toast.success("Price list updated")
      closeSheet()
    },
    onError: () => toast.error("Failed to update price list"),
  })

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      await client.POST("/api/price-lists/{id}/default", {
        params: { path: { id } },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-lists"] })
      toast.success("Default price list updated")
    },
    onError: () => toast.error("Failed to set default"),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE("/api/price-lists/{id}", {
        params: { path: { id } },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-lists"] })
      toast.success("Price list deleted")
    },
    onError: () => toast.error("Failed to delete price list"),
  })

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setSheetOpen(true)
  }

  function openEdit(list: (typeof priceLists)[number]) {
    setEditingId(list.id)
    setForm({
      name: list.name ?? "",
      channel_type: list.channel_type ?? "pos",
      marketplace_channel_id: "",
      city: "",
      is_default: list.is_default ?? false,
    })
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name) return
    const body = {
      name: form.name,
      channel_type: form.channel_type,
      marketplace_channel_id: form.marketplace_channel_id || undefined,
      city: form.city || undefined,
      is_default: form.is_default,
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, body })
    } else {
      createMutation.mutate(body)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <>
      <PageHeader title="Price Lists" description="Manage pricing tiers and schedules">
        <Button onClick={openCreate}>Add Price List</Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        <DataTable
          columns={[
            {
              id: "name",
              header: "Name",
              cell: (row) => row.name,
            },
            {
              id: "channel_type",
              header: "Type",
              cell: (row) => <span className="capitalize">{row.channel_type}</span>,
            },
            {
              id: "is_default",
              header: "Default",
              cell: (row) => (row.is_default ? <Badge>Default</Badge> : null),
            },
            {
              id: "created_at",
              header: "Created",
              cell: (row) => row.created_at ?? "-",
            },
          ]}
          data={priceLists}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No price lists configured yet."
          onRowClick={openEdit}
          rowActions={(row) => (
            <>
              <DropdownMenuItem onClick={() => openEdit(row)}>Edit</DropdownMenuItem>
              {!row.is_default && (
                <DropdownMenuItem onClick={() => setDefaultMutation.mutate(row.id)}>
                  Set Default
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => deleteMutation.mutate(row.id)}>
                Delete
              </DropdownMenuItem>
            </>
          )}
        />
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editingId ? "Edit Price List" : "Add Price List"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
            <SheetBody className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Default Price List"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>Channel Type</Label>
                <Select
                  value={form.channel_type}
                  onValueChange={(val) => setForm((f) => ({ ...f, channel_type: val ?? "" }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {channelTypes.map((ct) => (
                      <SelectItem key={ct.value} value={ct.value}>
                        {ct.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.channel_type === "marketplace" && (
                <div className="grid gap-2">
                  <Label htmlFor="marketplace_channel_id">Marketplace Channel ID</Label>
                  <Input
                    id="marketplace_channel_id"
                    value={form.marketplace_channel_id}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        marketplace_channel_id: e.target.value,
                      }))
                    }
                  />
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_default"
                  checked={form.is_default}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, is_default: checked === true }))
                  }
                />
                <Label htmlFor="is_default">Set as default</Label>
              </div>
            </SheetBody>
            <SheetFooter>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : editingId ? "Update" : "Create"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
