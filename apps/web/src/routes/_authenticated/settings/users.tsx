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
import { useTranslation } from "react-i18next"
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

const MODULES = [
  { key: "products", label: "Products" },
  { key: "stock", label: "Stock" },
  { key: "production", label: "Production" },
  { key: "pos", label: "POS" },
  { key: "sales", label: "Sales" },
  { key: "purchase", label: "Purchase" },
  { key: "finance", label: "Finance" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" },
] as const

const LEVELS = [
  { value: "none", label: "None" },
  { value: "viewer", label: "Viewer" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" },
] as const

type Permissions = Record<string, string>

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

function PermissionsEditor({
  permissions,
  onChange,
}: {
  permissions: Permissions
  onChange: (perms: Permissions) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-2">
      <Label>{t("settings.users.modulePermissions")}</Label>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-3 py-2 text-left font-medium">{t("settings.users.module")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("settings.users.level")}</th>
            </tr>
          </thead>
          <tbody>
            {MODULES.map((mod) => (
              <tr key={mod.key} className="border-b last:border-b-0">
                <td className="px-3 py-1.5">{mod.label}</td>
                <td className="px-3 py-1.5">
                  <Select
                    value={permissions[mod.key] ?? "none"}
                    onValueChange={(val) => onChange({ ...permissions, [mod.key]: val ?? "none" })}
                  >
                    <SelectTrigger size="sm" className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVELS.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function UsersPage() {
  const { t } = useTranslation()
  const client = useApi()
  const queryClient = useQueryClient()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [form, setForm] = useState<InviteForm>(emptyForm)

  // Permissions editor sheet state
  const [permSheetOpen, setPermSheetOpen] = useState(false)
  const [permUserId, setPermUserId] = useState<string | null>(null)
  const [permUserName, setPermUserName] = useState("")
  const [permValues, setPermValues] = useState<Permissions>({})

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
      toast.success(t("settings.users.userInvited"))
      closeSheet()
    },
    onError: () => toast.error(t("settings.users.failedToInvite")),
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
      toast.success(t("settings.users.roleUpdated"))
    },
    onError: () => toast.error(t("settings.users.failedToUpdateRole")),
  })

  const updatePermsMutation = useMutation({
    mutationFn: async ({ id, permissions }: { id: string; permissions: Permissions }) => {
      const res = await client.PUT("/api/users/{id}/permissions", {
        params: { path: { id } },
        body: { permissions },
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
      toast.success(t("settings.users.permissionsUpdated"))
      setPermSheetOpen(false)
    },
    onError: () => toast.error(t("settings.users.failedToUpdatePermissions")),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE("/api/users/{id}", {
        params: { path: { id } },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
      toast.success(t("settings.users.userRemoved"))
    },
    onError: () => toast.error(t("settings.users.failedToRemove")),
  })

  function openCreate() {
    setForm(emptyForm)
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
    setForm(emptyForm)
  }

  function openPermissions(row: { user_id: string; name: string; permissions?: unknown }) {
    setPermUserId(row.user_id)
    setPermUserName(row.name)
    setPermValues(
      row.permissions && typeof row.permissions === "object" ? (row.permissions as Permissions) : {}
    )
    setPermSheetOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.email || form.password.length < 8) return
    createMutation.mutate(form)
  }

  function handlePermSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!permUserId) return
    updatePermsMutation.mutate({ id: permUserId, permissions: permValues })
  }

  return (
    <>
      <PageHeader title={t("settings.users.title")} description={t("settings.users.description")}>
        <Button onClick={openCreate}>{t("settings.users.inviteUser")}</Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        <DataTable
          columns={[
            {
              id: "name",
              header: t("common.name"),
              cell: (row) => row.name,
            },
            {
              id: "email",
              header: t("common.email"),
              cell: (row) => row.email,
            },
            {
              id: "role",
              header: t("settings.users.role"),
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
          emptyMessage={t("settings.users.noUsersFound")}
          rowActions={(row) => (
            <>
              {row.role !== "admin" && (
                <DropdownMenuItem onClick={() => openPermissions(row)}>
                  {t("settings.users.permissions")}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => deleteMutation.mutate(row.user_id)}>
                {t("common.remove")}
              </DropdownMenuItem>
            </>
          )}
        />
      </div>

      {/* Invite user sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("settings.users.inviteUser")}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
            <SheetBody className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">{t("common.name")}</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">{t("common.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">{t("settings.users.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  minLength={8}
                  required
                />
                <p className="text-muted-foreground text-xs">{t("settings.users.passwordHint")}</p>
              </div>
              <div className="grid gap-2">
                <Label>{t("settings.users.role")}</Label>
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
                {createMutation.isPending
                  ? t("settings.users.inviting")
                  : t("settings.users.inviteUser")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Permissions editor sheet */}
      <Sheet open={permSheetOpen} onOpenChange={setPermSheetOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("settings.users.permissionsFor", { name: permUserName })}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handlePermSubmit} className="flex flex-1 flex-col">
            <SheetBody className="grid gap-4">
              <PermissionsEditor permissions={permValues} onChange={setPermValues} />
            </SheetBody>
            <SheetFooter>
              <Button type="submit" disabled={updatePermsMutation.isPending}>
                {updatePermsMutation.isPending
                  ? t("common.saving")
                  : t("settings.users.savePermissions")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
