import { Button } from "@heyloaf/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@heyloaf/ui/components/card"
import { Input } from "@heyloaf/ui/components/input"
import { Label } from "@heyloaf/ui/components/label"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"

export const Route = createFileRoute("/_authenticated/settings/stock")({
  component: StockSettingsPage,
})

interface StockForm {
  default_min_stock_level: string
  stock_precision_kg: string
  stock_precision_pieces: string
}

const STORAGE_KEY = "heyloaf:stock-settings"

const defaultForm: StockForm = {
  default_min_stock_level: "0",
  stock_precision_kg: "3",
  stock_precision_pieces: "0",
}

function loadSettings(): StockForm {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaultForm, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return defaultForm
}

function StockSettingsPage() {
  const [form, setForm] = useState<StockForm>(defaultForm)

  useEffect(() => {
    setForm(loadSettings())
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
    toast.success("Stock settings saved")
  }

  function updateField(field: keyof StockForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  return (
    <>
      <PageHeader title="Stock Settings" description="Configure inventory tracking defaults" />

      <div className="space-y-4 p-6">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Stock Defaults</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-2">
                <Label htmlFor="default_min_stock_level">Default Minimum Stock Level</Label>
                <Input
                  id="default_min_stock_level"
                  type="number"
                  min="0"
                  step="1"
                  value={form.default_min_stock_level}
                  onChange={(e) => updateField("default_min_stock_level", e.target.value)}
                  placeholder="0"
                />
                <p className="text-muted-foreground text-xs">
                  Alert threshold when stock falls below this quantity.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="stock_precision_kg">Stock Precision — KG</Label>
                  <Input
                    id="stock_precision_kg"
                    type="number"
                    min="0"
                    max="6"
                    step="1"
                    value={form.stock_precision_kg}
                    onChange={(e) => updateField("stock_precision_kg", e.target.value)}
                    placeholder="3"
                  />
                  <p className="text-muted-foreground text-xs">
                    Decimal places for weight-based items.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="stock_precision_pieces">Stock Precision — Pieces</Label>
                  <Input
                    id="stock_precision_pieces"
                    type="number"
                    min="0"
                    max="6"
                    step="1"
                    value={form.stock_precision_pieces}
                    onChange={(e) => updateField("stock_precision_pieces", e.target.value)}
                    placeholder="0"
                  />
                  <p className="text-muted-foreground text-xs">
                    Decimal places for piece-counted items.
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
