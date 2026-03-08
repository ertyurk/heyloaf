import { Button } from "@heyloaf/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@heyloaf/ui/components/card"
import { Input } from "@heyloaf/ui/components/input"
import { Label } from "@heyloaf/ui/components/label"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

export const Route = createFileRoute("/_authenticated/settings/stock")({
  component: StockSettingsPage,
})

interface StockForm {
  default_min_stock_level: string
  stock_precision_kg: string
  stock_precision_pieces: string
}

const defaultForm: StockForm = {
  default_min_stock_level: "0",
  stock_precision_kg: "3",
  stock_precision_pieces: "0",
}

function StockSettingsPage() {
  const client = useApi()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<StockForm>(defaultForm)

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
      const stock = (company.settings as Record<string, unknown>)?.stock as
        | Record<string, unknown>
        | undefined
      if (stock) {
        setForm({
          default_min_stock_level: String(
            stock.default_min_stock_level ?? defaultForm.default_min_stock_level
          ),
          stock_precision_kg: String(stock.stock_precision_kg ?? defaultForm.stock_precision_kg),
          stock_precision_pieces: String(
            stock.stock_precision_pieces ?? defaultForm.stock_precision_pieces
          ),
        })
      }
    }
  }, [company])

  const updateMutation = useMutation({
    mutationFn: async (stockSettings: StockForm) => {
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
            stock: {
              default_min_stock_level: Number(stockSettings.default_min_stock_level),
              stock_precision_kg: Number(stockSettings.stock_precision_kg),
              stock_precision_pieces: Number(stockSettings.stock_precision_pieces),
            },
          },
        },
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company"] })
      toast.success("Stock settings saved")
    },
    onError: () => toast.error("Failed to save stock settings"),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    updateMutation.mutate(form)
  }

  function updateField(field: keyof StockForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  if (isLoading) {
    return (
      <>
        <PageHeader title="Stock Settings" description="Configure inventory tracking defaults" />
        <p className="text-muted-foreground py-8 text-center text-sm">Loading...</p>
      </>
    )
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
