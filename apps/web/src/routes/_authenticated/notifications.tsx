import { Button } from "@heyloaf/ui/components/button"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
})

function getRelativeTime(
  dateStr: string,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) return t("notifications.justNow")
  if (diffMinutes < 60) return t("notifications.minutesAgo", { count: diffMinutes })
  if (diffHours < 24) return t("notifications.hoursAgo", { count: diffHours })
  if (diffDays < 7) return t("notifications.daysAgo", { count: diffDays })
  return date.toLocaleDateString()
}

function NotificationsPage() {
  const { t } = useTranslation()
  const client = useApi()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await client.GET("/api/notifications")
      return res.data
    },
  })

  const markAllRead = useMutation({
    mutationFn: async () => {
      await client.POST("/api/notifications/read-all" as never)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
      toast.success(t("notifications.allMarkedRead"))
    },
    onError: () => {
      toast.error(t("notifications.failedToMarkAllRead"))
    },
  })

  const markOneRead = useMutation({
    mutationFn: async (id: string) => {
      await client.POST(`/api/notifications/${id}/read` as never)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
    onError: () => {
      toast.error(t("notifications.failedToMarkRead"))
    },
  })

  const notifications = data?.data ?? []

  return (
    <>
      <PageHeader title={t("notifications.title")} description={t("notifications.description")}>
        <Button
          variant="outline"
          onClick={() => markAllRead.mutate()}
          disabled={markAllRead.isPending}
        >
          {t("notifications.markAllRead")}
        </Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("notifications.loading")}</p>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("notifications.noNotifications")}</p>
        ) : (
          <div className="space-y-2">
            {notifications.map((notification) => (
              <button
                type="button"
                key={notification.id}
                className={`w-full rounded-lg border p-4 text-start transition-colors ${
                  !notification.is_read ? "bg-muted/50 cursor-pointer hover:bg-muted/70" : ""
                }`}
                onClick={() => {
                  if (!notification.is_read) {
                    markOneRead.mutate(notification.id)
                  }
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {!notification.is_read && (
                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                      )}
                      <p className="text-sm font-medium">{notification.title}</p>
                    </div>
                    {notification.message && (
                      <p className="text-sm text-muted-foreground">{notification.message}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {getRelativeTime(notification.created_at, t)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
