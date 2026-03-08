import { Button } from "@heyloaf/ui/components/button"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
})

function getRelativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) return "just now"
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function NotificationsPage() {
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
      toast.success("All notifications marked as read")
    },
    onError: () => {
      toast.error("Failed to mark all as read")
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
      toast.error("Failed to mark notification as read")
    },
  })

  const notifications = data?.data ?? []

  return (
    <>
      <PageHeader title="Notifications" description="Stay up to date">
        <Button
          variant="outline"
          onClick={() => markAllRead.mutate()}
          disabled={markAllRead.isPending}
        >
          Mark All Read
        </Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notifications.</p>
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
                    {getRelativeTime(notification.created_at)}
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
