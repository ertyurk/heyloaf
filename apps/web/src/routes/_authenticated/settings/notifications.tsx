import { Button } from "@heyloaf/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@heyloaf/ui/components/card"
import { Checkbox } from "@heyloaf/ui/components/checkbox"
import { Label } from "@heyloaf/ui/components/label"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  component: NotificationSettingsPage,
})

interface NotificationForm {
  low_stock_alerts: boolean
  overdue_invoice_alerts: boolean
}

const STORAGE_KEY = "heyloaf:notification-settings"

const defaultForm: NotificationForm = {
  low_stock_alerts: false,
  overdue_invoice_alerts: false,
}

function loadSettings(): NotificationForm {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaultForm, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return defaultForm
}

function NotificationSettingsPage() {
  const [form, setForm] = useState<NotificationForm>(defaultForm)

  useEffect(() => {
    setForm(loadSettings())
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
    toast.success("Notification settings saved")
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
                <Button type="submit">Save Changes</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
