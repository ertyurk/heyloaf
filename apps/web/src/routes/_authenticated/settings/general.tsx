import { Button } from "@heyloaf/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@heyloaf/ui/components/card"
import { Input } from "@heyloaf/ui/components/input"
import { Label } from "@heyloaf/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@heyloaf/ui/components/select"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

export const Route = createFileRoute("/_authenticated/settings/general")({
  component: GeneralSettingsPage,
})

interface GeneralForm {
  default_tax_rate: string
  default_currency: string
  timezone: string
  default_language: string
}

const emptyForm: GeneralForm = {
  default_tax_rate: "",
  default_currency: "",
  timezone: "",
  default_language: "",
}

function GeneralSettingsPage() {
  const client = useApi()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<GeneralForm>(emptyForm)

  const { data, isLoading } = useQuery({
    queryKey: ["company"],
    queryFn: async () => {
      const res = await client.GET("/api/company")
      return res.data
    },
  })

  const company = data?.data

  const { data: currenciesData } = useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const res = await client.GET("/api/currencies")
      return res.data
    },
  })

  const currencies = currenciesData?.data ?? []

  useEffect(() => {
    if (company) {
      setForm({
        default_tax_rate: String(company.default_tax_rate ?? ""),
        default_currency: company.default_currency ?? "",
        timezone: company.timezone ?? "",
        default_language: company.default_language ?? "",
      })
    }
  }, [company])

  const updateMutation = useMutation({
    mutationFn: async (body: {
      default_tax_rate: number
      default_currency: string
      timezone: string
      default_language: string
    }) => {
      const res = await client.PUT("/api/company", {
        body: {
          name: company?.name ?? "",
          ...body,
        },
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company"] })
      toast.success("General settings saved")
    },
    onError: () => toast.error("Failed to save general settings"),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    updateMutation.mutate({
      default_tax_rate: Number(form.default_tax_rate) || 0,
      default_currency: form.default_currency,
      timezone: form.timezone,
      default_language: form.default_language,
    })
  }

  function updateField(field: keyof GeneralForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  if (isLoading) {
    return (
      <>
        <PageHeader title="General Settings" description="Default preferences for your workspace" />
        <p className="text-muted-foreground py-8 text-center text-sm">Loading...</p>
      </>
    )
  }

  return (
    <>
      <PageHeader title="General Settings" description="Default preferences for your workspace" />

      <div className="space-y-4 p-6">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Defaults</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="default_tax_rate">Default Tax Rate (%)</Label>
                  <Input
                    id="default_tax_rate"
                    type="number"
                    step="any"
                    min="0"
                    max="100"
                    value={form.default_tax_rate}
                    onChange={(e) => updateField("default_tax_rate", e.target.value)}
                    placeholder="18"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="default_currency">Default Currency</Label>
                  <Select
                    value={form.default_currency}
                    onValueChange={(val) => updateField("default_currency", val as string)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((c) => (
                        <SelectItem key={c.id} value={c.code ?? ""}>
                          {c.code} — {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input
                    id="timezone"
                    value={form.timezone}
                    onChange={(e) => updateField("timezone", e.target.value)}
                    placeholder="Europe/Istanbul"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="default_language">Default Language</Label>
                  <Select
                    value={form.default_language}
                    onValueChange={(val) => updateField("default_language", val as string)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="tr">Turkish</SelectItem>
                    </SelectContent>
                  </Select>
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
