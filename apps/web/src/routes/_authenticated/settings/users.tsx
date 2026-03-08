import { Button } from "@heyloaf/ui/components/button"
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

export const Route = createFileRoute("/_authenticated/settings/users")({
  component: UsersPage,
})

const roles = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "cashier", label: "Cashier" },
  { value: "user", label: "User" },
] as const

interface InviteForm {
  name: string
  email: string
  password: string
  role: string
}

const emptyForm: InviteForm = {
  name: "",
  email: "",
  password: "",
  role: "cashier",
}

function UsersPage() {
  const client = useApi()
  const queryClient = useQueryClient()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [form, setForm] = useState<InviteForm>(emptyForm)

  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await client.GET("/api/users")
      return res.data
    },
  })

  const users = data?.data ?? []

  const createMutation = useMutation({
    mutationFn: async (body: InviteForm) => {
      const res = await client.POST("/api/users", { body })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
      toast.success("User invited")
      closeSheet()
    },
    onError: () => toast.error("Failed to invite user"),
  })

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const res = await client.PUT("/api/users/{id}/role", {
        params: { path: { id } },
        body: { role },
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
      toast.success("User role updated")
    },
    onError: () => toast.error("Failed to update role"),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE("/api/users/{id}", {
        params: { path: { id } },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
      toast.success("User removed")
    },
    onError: () => toast.error("Failed to remove user"),
  })

  function openCreate() {
    setForm(emptyForm)
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
    setForm(emptyForm)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.email || form.password.length < 8) return
    createMutation.mutate(form)
  }

  return (
    <>
      <PageHeader title="Users" description="Manage team members and permissions">
        <Button onClick={openCreate}>Invite User</Button>
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
              id: "email",
              header: "Email",
              cell: (row) => row.email,
            },
            {
              id: "role",
              header: "Role",
              cell: (row) => (
                <Select
                  value={row.role}
                  onValueChange={(val) =>
                    updateRoleMutation.mutate({
                      id: row.user_id,
                      role: val ?? "",
                    })
                  }
                >
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ),
            },
          ]}
          data={users}
          getRowId={(row) => row.user_id}
          isLoading={isLoading}
          emptyMessage="No users found."
          rowActions={(row) => (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => deleteMutation.mutate(row.user_id)}>
                Remove
              </DropdownMenuItem>
            </>
          )}
        />
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Invite User</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
            <SheetBody className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  minLength={8}
                  required
                />
                <p className="text-muted-foreground text-xs">Minimum 8 characters</p>
              </div>
              <div className="grid gap-2">
                <Label>Role</Label>
                <Select
                  value={form.role}
                  onValueChange={(val) => setForm((f) => ({ ...f, role: val ?? "" }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </SheetBody>
            <SheetFooter>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Inviting..." : "Invite User"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
