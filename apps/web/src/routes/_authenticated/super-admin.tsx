import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@heyloaf/ui/components/card"
import { DataTable } from "@heyloaf/ui/components/data-table"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@heyloaf/ui/components/tabs"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"
import { useAuthStore } from "@/lib/auth"

export const Route = createFileRoute("/_authenticated/super-admin")({
  component: SuperAdminGuard,
})

function SuperAdminGuard() {
  const navigate = useNavigate()
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)

  useEffect(() => {
    if (hasHydrated && !isSuperAdmin) {
      navigate({ to: "/dashboard" })
    }
  }, [hasHydrated, isSuperAdmin, navigate])

  if (!hasHydrated || !isSuperAdmin) return null

  return <SuperAdminPage />
}

interface CompanyWithUserCount {
  id: string
  name: string
  is_active: boolean
  created_at: string
  user_count: number
}

interface SuperAdminUser {
  id: string
  name: string
  email: string
  company_count: number
  created_at: string
  is_super_admin: boolean
}

function SuperAdminPage() {
  const { t } = useTranslation()
  const client = useApi()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState("companies")
  const [createOpen, setCreateOpen] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState("")

  const { data: companiesData, isLoading: companiesLoading } = useQuery({
    queryKey: ["super-admin", "companies"],
    queryFn: async () => {
      const res = await client.GET("/api/super-admin/companies")
      return res.data
    },
    enabled: activeTab === "companies",
  })

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["super-admin", "users"],
    queryFn: async () => {
      const res = await client.GET("/api/super-admin/users")
      return res.data
    },
    enabled: activeTab === "users",
  })

  const companies = (companiesData?.data ?? []) as CompanyWithUserCount[]
  const users = (usersData?.data ?? []) as SuperAdminUser[]

  const createCompanyMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await client.POST("/api/super-admin/companies", {
        body: { name },
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "companies"] })
      setCreateOpen(false)
      setNewCompanyName("")
      toast.success(t("superAdmin.companyCreated"))
    },
    onError: () => toast.error(t("superAdmin.failedToCreate")),
  })

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      await client.PUT("/api/super-admin/companies/{id}/deactivate", {
        params: { path: { id } },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "companies"] })
      toast.success(t("superAdmin.companyDeactivated"))
    },
    onError: () => toast.error(t("superAdmin.failedToDeactivate")),
  })

  const companyColumns = useMemo(
    () => [
      {
        id: "name",
        header: t("common.name"),
        cell: (row: CompanyWithUserCount) => <span className="font-medium">{row.name}</span>,
      },
      {
        id: "user_count",
        header: t("superAdmin.userCount"),
        cell: (row: CompanyWithUserCount) => <span className="tabular-nums">{row.user_count}</span>,
      },
      {
        id: "status",
        header: t("common.status"),
        cell: (row: CompanyWithUserCount) => (
          <Badge variant={row.is_active ? "default" : "secondary"}>
            {row.is_active ? t("common.active") : t("common.inactive")}
          </Badge>
        ),
      },
      {
        id: "created_at",
        header: t("superAdmin.createdAt"),
        cell: (row: CompanyWithUserCount) => (
          <span className="text-muted-foreground text-sm">
            {new Date(row.created_at).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: (row: CompanyWithUserCount) =>
          row.is_active ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => deactivateMutation.mutate(row.id)}
              disabled={deactivateMutation.isPending}
            >
              {t("superAdmin.deactivate")}
            </Button>
          ) : null,
      },
    ],
    [t, deactivateMutation]
  )

  const userColumns = useMemo(
    () => [
      {
        id: "name",
        header: t("common.name"),
        cell: (row: SuperAdminUser) => <span className="font-medium">{row.name}</span>,
      },
      {
        id: "email",
        header: t("superAdmin.email"),
        cell: (row: SuperAdminUser) => <span className="text-muted-foreground">{row.email}</span>,
      },
      {
        id: "company_count",
        header: t("superAdmin.companyCount"),
        cell: (row: SuperAdminUser) => <span className="tabular-nums">{row.company_count}</span>,
      },
      {
        id: "is_super_admin",
        header: t("superAdmin.role"),
        cell: (row: SuperAdminUser) =>
          row.is_super_admin ? (
            <Badge variant="default">{t("superAdmin.superAdmin")}</Badge>
          ) : (
            <Badge variant="outline">{t("superAdmin.user")}</Badge>
          ),
      },
      {
        id: "created_at",
        header: t("superAdmin.createdAt"),
        cell: (row: SuperAdminUser) => (
          <span className="text-muted-foreground text-sm">
            {new Date(row.created_at).toLocaleDateString()}
          </span>
        ),
      },
    ],
    [t]
  )

  return (
    <>
      <PageHeader title={t("superAdmin.title")} description={t("superAdmin.description")} />

      <div className="space-y-4 p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="companies">{t("superAdmin.companies")}</TabsTrigger>
              <TabsTrigger value="users">{t("superAdmin.users")}</TabsTrigger>
            </TabsList>

            {activeTab === "companies" && (
              <Button onClick={() => setCreateOpen(true)}>{t("superAdmin.createCompany")}</Button>
            )}
          </div>

          <TabsContent value="companies">
            {companiesLoading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>{t("superAdmin.allCompanies")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <DataTable
                    columns={companyColumns}
                    data={companies}
                    getRowId={(row) => row.id}
                    emptyMessage={t("superAdmin.noCompanies")}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="users">
            {usersLoading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>{t("superAdmin.allUsers")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <DataTable
                    columns={userColumns}
                    data={users}
                    getRowId={(row) => row.id}
                    emptyMessage={t("superAdmin.noUsers")}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("superAdmin.createCompany")}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <form
              id="create-company-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (newCompanyName.trim()) {
                  createCompanyMutation.mutate(newCompanyName.trim())
                }
              }}
              className="space-y-4"
            >
              <div className="grid gap-2">
                <Label htmlFor="company-name">{t("superAdmin.companyName")}</Label>
                <Input
                  id="company-name"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder={t("superAdmin.companyNamePlaceholder")}
                  required
                />
              </div>
            </form>
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              form="create-company-form"
              disabled={createCompanyMutation.isPending || !newCompanyName.trim()}
            >
              {createCompanyMutation.isPending ? t("common.creating") : t("common.create")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}
