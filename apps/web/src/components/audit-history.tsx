import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@heyloaf/ui/components/sheet"
import Clock01Icon from "@hugeicons/core-free-icons/Clock01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { LocalizedDateRangeFilter } from "@/components/localized-date-range-filter"
import { useApi } from "@/hooks/use-api"

interface AuditLogEntry {
  id: string
  user_id: string
  entity_type: string
  entity_id: string
  action: string
  changes: Record<string, unknown> | null
  created_at: string
}

interface AuditHistoryProps {
  entityType: string
  entityId: string
  trigger?: React.ReactNode
}

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

function renderChangeValue(value: unknown): string {
  if (value === null || value === undefined) return "--"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

export function AuditHistory({ entityType, entityId, trigger }: AuditHistoryProps) {
  const { t } = useTranslation()
  const client = useApi()
  const [open, setOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await client.GET("/api/users")
      return res.data
    },
    enabled: open,
  })

  const users = usersData?.data ?? []

  const { data: auditData, isLoading } = useQuery({
    queryKey: ["audit-logs", entityType, entityId, dateFrom, dateTo],
    queryFn: async () => {
      const params: Record<string, string> = {
        entity_type: entityType,
        entity_id: entityId,
      }
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
    enabled: open,
  })

  const logs: AuditLogEntry[] = useMemo(() => {
    const raw = (auditData as { data?: AuditLogEntry[] })?.data ?? []
    return [...raw].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }, [auditData])

  function getUserName(userId: string): string {
    return users.find((u) => u.user_id === userId)?.name ?? userId.slice(0, 8)
  }

  return (
    <>
      {trigger ? (
        <button type="button" onClick={() => setOpen(true)} className="contents">
          {trigger}
        </button>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <HugeiconsIcon icon={Clock01Icon} size={16} className="mr-1" />
          {t("audit.history")}
        </Button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t("audit.entityHistory")}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <div className="mb-4">
              <LocalizedDateRangeFilter
                from={dateFrom}
                to={dateTo}
                onChange={(from, to) => {
                  setDateFrom(from)
                  setDateTo(to)
                }}
              />
            </div>

            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
              </div>
            )}

            {!isLoading && logs.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">{t("audit.noChanges")}</p>
              </div>
            )}

            {!isLoading && logs.length > 0 && (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />

                <div className="space-y-6">
                  {logs.map((log) => (
                    <div key={log.id} className="relative pl-8">
                      {/* Timeline dot */}
                      <div className="absolute left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-background bg-muted-foreground" />

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            className={
                              actionBadgeClass[log.action] ?? "bg-muted text-muted-foreground"
                            }
                          >
                            {log.action.charAt(0).toUpperCase() + log.action.slice(1)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {t("audit.changedBy")}: {getUserName(log.user_id)}
                          </span>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {formatTimestamp(log.created_at)}
                        </p>

                        {log.changes && Object.keys(log.changes).length > 0 && (
                          <div className="rounded-md border bg-muted/50 overflow-hidden">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b">
                                  <th className="px-2 py-1 text-left font-medium text-muted-foreground">
                                    {t("audit.fieldChanged")}
                                  </th>
                                  <th className="px-2 py-1 text-left font-medium text-muted-foreground">
                                    {t("audit.oldValue")}
                                  </th>
                                  <th className="px-2 py-1 text-left font-medium text-muted-foreground">
                                    {t("audit.newValue")}
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(log.changes).map(([field, value]) => {
                                  const change = value as {
                                    old?: unknown
                                    new?: unknown
                                  } | null
                                  return (
                                    <tr key={field} className="border-b last:border-0">
                                      <td className="px-2 py-1 font-mono">{field}</td>
                                      <td className="px-2 py-1 text-muted-foreground">
                                        {renderChangeValue(change?.old)}
                                      </td>
                                      <td className="px-2 py-1">
                                        {renderChangeValue(change?.new)}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  )
}
