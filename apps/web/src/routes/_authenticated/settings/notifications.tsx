import { Button } from "@heyloaf/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@heyloaf/ui/components/card"
import { Checkbox } from "@heyloaf/ui/components/checkbox"
import { Label } from "@heyloaf/ui/components/label"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  component: NotificationSettingsPage,
})

interface NotificationForm {
  low_stock_alerts: boolean
  overdue_invoice_alerts: boolean
}

const defaultForm: NotificationForm = {
  low_stock_alerts: false,
  overdue_invoice_alerts: false,
}

function NotificationSettingsPage() {
  const client = useApi()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<NotificationForm>(defaultForm)

  const { data, isLoading } = useQuery({
    queryKey: ["company"],
    queryFn: async () => {
      const res = await client.GET("/api/company")
      return res.data
    },
  })

  const company = data?.data

  useEffect(() => {
    if (company) {
      const notifications = (company.settings as Record<string, unknown>)?.notifications as
        | Record<string, unknown>
        | undefined
      if (notifications) {
        setForm({
          low_stock_alerts: Boolean(notifications.low_stock_alerts ?? defaultForm.low_stock_alerts),
          overdue_invoice_alerts: Boolean(
            notifications.overdue_invoice_alerts ?? defaultForm.overdue_invoice_alerts
          ),
        })
      }
    }
  }, [company])

  const updateMutation = useMutation({
    mutationFn: async (notificationSettings: NotificationForm) => {
      if (!company) throw new Error("Company not loaded")
      const res = await client.PUT("/api/company", {
        body: {
          name: company.name,
          tax_number: company.tax_number,
          tax_office: company.tax_office,
          address: company.address,
          phone: company.phone,
          email: company.email,
          website: company.website,
          default_currency: company.default_currency,
          default_tax_rate: company.default_tax_rate,
          default_language: company.default_language,
          timezone: company.timezone,
          settings: {
            notifications: {
              low_stock_alerts: notificationSettings.low_stock_alerts,
              overdue_invoice_alerts: notificationSettings.overdue_invoice_alerts,
            },
          },
        },
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company"] })
      toast.success("Notification settings saved")
    },
    onError: () => toast.error("Failed to save notification settings"),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    updateMutation.mutate(form)
  }

  if (isLoading) {
    return (
      <>
        <PageHeader
          title="Notification Settings"
          description="Configure alerts and notifications"
        />
        <p className="text-muted-foreground py-8 text-center text-sm">Loading...</p>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Notification Settings" description="Configure alerts and notifications" />

      <div className="space-y-4 p-6">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="low_stock_alerts"
                  checked={form.low_stock_alerts}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, low_stock_alerts: checked === true }))
                  }
                />
                <div className="grid gap-0.5">
                  <Label htmlFor="low_stock_alerts">Low stock alerts</Label>
                  <p className="text-muted-foreground text-xs">
                    Get notified when product stock falls below the minimum level.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="overdue_invoice_alerts"
                  checked={form.overdue_invoice_alerts}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, overdue_invoice_alerts: checked === true }))
                  }
                />
                <div className="grid gap-0.5">
                  <Label htmlFor="overdue_invoice_alerts">Overdue invoice alerts</Label>
                  <p className="text-muted-foreground text-xs">
                    Get notified when invoices pass their due date.
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
