import { AdvancedSelect } from "@heyloaf/ui/components/advanced-select"
import { Badge } from "@heyloaf/ui/components/badge"
import { DataTable } from "@heyloaf/ui/components/data-table"
import { DateRangeFilter } from "@heyloaf/ui/components/date-range-filter"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@heyloaf/ui/components/sheet"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

export const Route = createFileRoute("/_authenticated/settings/audit")({
  component: AuditLogsPage,
})

interface AuditLogEntry {
  id: string
  user_id: string
  entity_type: string
  entity_id: string
  action: string
  changes: Record<string, unknown> | null
  created_at: string
}

const entityTypeOptions = [
  { value: "__all__", label: "All Entities" },
  { value: "contact", label: "Contact" },
  { value: "product", label: "Product" },
  { value: "order", label: "Order" },
  { value: "invoice", label: "Invoice" },
  { value: "stock", label: "Stock" },
  { value: "price_list", label: "Price List" },
  { value: "user", label: "User" },
]

const actionOptions = [
  { value: "__all__", label: "All Actions" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
]

const actionBadgeClass: Record<string, string> = {
  create: "bg-green-100 text-green-800",
  update: "bg-blue-100 text-blue-800",
  delete: "bg-red-100 text-red-800",
}

function formatTimestamp(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function AuditLogsPage() {
  const client = useApi()

  const [entityTypeFilter, setEntityTypeFilter] = useState("__all__")
  const [actionFilter, setActionFilter] = useState("__all__")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null)

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await client.GET("/api/users")
      return res.data
    },
  })

  const users = usersData?.data ?? []

  const { data: auditData, isLoading } = useQuery({
    queryKey: ["audit-logs", entityTypeFilter, actionFilter, dateFrom, dateTo],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (entityTypeFilter !== "__all__") params.entity_type = entityTypeFilter
      if (actionFilter !== "__all__") params.action = actionFilter
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      const res = await client.GET(
        "/api/audit-logs" as never,
        {
          params: { query: params },
        } as never
      )
      return (res as { data?: { data?: AuditLogEntry[] } }).data
    },
  })

  const logs: AuditLogEntry[] = (auditData as { data?: AuditLogEntry[] })?.data ?? []

  const filteredLogs = useMemo(() => {
    return [...logs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }, [logs])

  const columns = useMemo(
    () => [
      {
        id: "timestamp",
        header: "Timestamp",
        cell: (row: AuditLogEntry) => (
          <span className="text-muted-foreground text-sm">{formatTimestamp(row.created_at)}</span>
        ),
      },
      {
        id: "user",
        header: "User",
        cell: (row: AuditLogEntry) =>
          users.find((u) => u.user_id === row.user_id)?.name ?? row.user_id.slice(0, 8),
      },
      {
        id: "entity_type",
        header: "Entity Type",
        cell: (row: AuditLogEntry) => (
          <Badge variant="outline" className="capitalize">
            {row.entity_type}
          </Badge>
        ),
      },
      {
        id: "entity_id",
        header: "Entity ID",
        cell: (row: AuditLogEntry) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.entity_id.slice(0, 8)}...
          </span>
        ),
      },
      {
        id: "action",
        header: "Action",
        cell: (row: AuditLogEntry) => (
          <Badge className={actionBadgeClass[row.action] ?? "bg-muted text-muted-foreground"}>
            {row.action.charAt(0).toUpperCase() + row.action.slice(1)}
          </Badge>
        ),
      },
      {
        id: "changes",
        header: "Changes",
        cell: (row: AuditLogEntry) => (
          <span className="text-xs text-muted-foreground">
            {row.changes ? `${Object.keys(row.changes).length} field(s)` : "\u2014"}
          </span>
        ),
      },
    ],
    [users]
  )

  return (
    <>
      <PageHeader title="Audit Logs" description="System activity history" />

      <div className="space-y-4 p-6">
        <div className="flex items-center gap-4">
          <AdvancedSelect
            options={entityTypeOptions}
            value={entityTypeFilter}
            onValueChange={(v) => setEntityTypeFilter(v ?? "__all__")}
            placeholder="Entity Type"
            searchable={false}
            className="w-40"
          />
          <AdvancedSelect
            options={actionOptions}
            value={actionFilter}
            onValueChange={(v) => setActionFilter(v ?? "__all__")}
            placeholder="Action"
            searchable={false}
            className="w-36"
          />
          <DateRangeFilter
            from={dateFrom}
            to={dateTo}
            onChange={(from, to) => {
              setDateFrom(from)
              setDateTo(to)
            }}
          />
        </div>

        <DataTable
          columns={columns}
          data={filteredLogs}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No audit logs found."
          onRowClick={(row) => setSelectedLog(row)}
        />
      </div>

      <Sheet
        open={selectedLog !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedLog(null)
        }}
      >
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Audit Log Detail</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {selectedLog && (
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground mb-1">Timestamp</p>
                    <p className="font-medium">{formatTimestamp(selectedLog.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">User</p>
                    <p className="font-medium">
                      {users.find((u) => u.user_id === selectedLog.user_id)?.name ??
                        selectedLog.user_id}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Entity Type</p>
                    <Badge variant="outline" className="capitalize">
                      {selectedLog.entity_type}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Action</p>
                    <Badge
                      className={
                        actionBadgeClass[selectedLog.action] ?? "bg-muted text-muted-foreground"
                      }
                    >
                      {selectedLog.action.charAt(0).toUpperCase() + selectedLog.action.slice(1)}
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1 text-sm">Entity ID</p>
                  <p className="font-mono text-sm">{selectedLog.entity_id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1 text-sm">Changes</p>
                  {selectedLog.changes ? (
                    <pre className="rounded-md bg-muted p-3 text-xs overflow-auto max-h-96">
                      {JSON.stringify(selectedLog.changes, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground">No change data available.</p>
                  )}
                </div>
              </div>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  )
}
