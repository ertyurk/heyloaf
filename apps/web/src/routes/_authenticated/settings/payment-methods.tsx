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

export const Route = createFileRoute("/_authenticated/settings/payment-methods")({
  component: PaymentMethodsPage,
})

interface PaymentMethodForm {
  name: string
  is_default: boolean
  is_active: boolean
  display_order: number
}

const emptyForm: PaymentMethodForm = {
  name: "",
  is_default: false,
  is_active: true,
  display_order: 0,
}

function PaymentMethodsPage() {
  const client = useApi()
  const queryClient = useQueryClient()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PaymentMethodForm>(emptyForm)

  const { data, isLoading } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: async () => {
      const res = await client.GET("/api/payment-methods")
      return res.data
    },
  })

  const methods = data?.data ?? []

  const createMutation = useMutation({
    mutationFn: async (body: Pick<PaymentMethodForm, "name" | "is_default" | "display_order">) => {
      const res = await client.POST("/api/payment-methods", { body })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-methods"] })
      toast.success("Payment method created")
      closeSheet()
    },
    onError: () => toast.error("Failed to create payment method"),
  })

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string
      body: Pick<PaymentMethodForm, "name" | "is_active" | "display_order">
    }) => {
      const res = await client.PUT("/api/payment-methods/{id}", {
        params: { path: { id } },
        body,
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-methods"] })
      toast.success("Payment method updated")
      closeSheet()
    },
    onError: () => toast.error("Failed to update payment method"),
  })

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      await client.POST("/api/payment-methods/{id}/default", {
        params: { path: { id } },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-methods"] })
      toast.success("Default payment method updated")
    },
    onError: () => toast.error("Failed to set default"),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE("/api/payment-methods/{id}", {
        params: { path: { id } },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-methods"] })
      toast.success("Payment method deleted")
    },
    onError: () => toast.error("Failed to delete payment method"),
  })

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setSheetOpen(true)
  }

  function openEdit(method: (typeof methods)[number]) {
    setEditingId(method.id)
    setForm({
      name: method.name ?? "",
      is_default: method.is_default ?? false,
      is_active: true,
      display_order: method.display_order ?? 0,
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
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        body: {
          name: form.name,
          is_active: form.is_active,
          display_order: form.display_order,
        },
      })
    } else {
      createMutation.mutate({
        name: form.name,
        is_default: form.is_default,
        display_order: form.display_order,
      })
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <>
      <PageHeader title="Payment Methods" description="Set up accepted payment methods">
        <Button onClick={openCreate}>Add Method</Button>
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
              id: "is_default",
              header: "Default",
              cell: (row) => (row.is_default ? <Badge>Default</Badge> : null),
            },
            {
              id: "display_order",
              header: "Sort Order",
              cell: (row) => row.display_order,
            },
          ]}
          data={methods}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No payment methods configured yet."
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
            <SheetTitle>{editingId ? "Edit Payment Method" : "Add Payment Method"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
            <SheetBody className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Cash"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="display_order">Display Order</Label>
                <Input
                  id="display_order"
                  type="number"
                  value={form.display_order}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      display_order: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                />
              </div>
              {!editingId && (
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
              )}
              {editingId && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="is_active"
                    checked={form.is_active}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({ ...f, is_active: checked === true }))
                    }
                  />
                  <Label htmlFor="is_active">Active</Label>
                </div>
              )}
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
