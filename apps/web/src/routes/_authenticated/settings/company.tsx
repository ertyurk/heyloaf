import { Button } from "@heyloaf/ui/components/button"
import { Input } from "@heyloaf/ui/components/input"
import { Label } from "@heyloaf/ui/components/label"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

export const Route = createFileRoute("/_authenticated/settings/company")({
  component: CompanyPage,
})

interface CompanyForm {
  name: string
  tax_number: string
  tax_office: string
  address: string
  phone: string
  email: string
  website: string
  default_currency: string
  default_tax_rate: string
  default_language: string
  timezone: string
}

const emptyForm: CompanyForm = {
  name: "",
  tax_number: "",
  tax_office: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  default_currency: "",
  default_tax_rate: "",
  default_language: "",
  timezone: "",
}

function CompanyPage() {
  const client = useApi()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<CompanyForm>(emptyForm)

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
      setForm({
        name: company.name ?? "",
        tax_number: company.tax_number ?? "",
        tax_office: company.tax_office ?? "",
        address: company.address ?? "",
        phone: company.phone ?? "",
        email: company.email ?? "",
        website: company.website ?? "",
        default_currency: company.default_currency ?? "",
        default_tax_rate: String(company.default_tax_rate ?? ""),
        default_language: company.default_language ?? "",
        timezone: company.timezone ?? "",
      })
    }
  }, [company])

  const updateMutation = useMutation({
    mutationFn: async (body: {
      name: string
      tax_number?: string
      tax_office?: string
      address?: string
      phone?: string
      email?: string
      website?: string
      default_currency: string
      default_tax_rate: number
      default_language: string
      timezone: string
    }) => {
      const res = await client.PUT("/api/company", { body })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company"] })
      toast.success("Company settings saved")
    },
    onError: () => toast.error("Failed to save company settings"),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name) return
    updateMutation.mutate({
      name: form.name,
      tax_number: form.tax_number || undefined,
      tax_office: form.tax_office || undefined,
      address: form.address || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      website: form.website || undefined,
      default_currency: form.default_currency,
      default_tax_rate: Number(form.default_tax_rate),
      default_language: form.default_language,
      timezone: form.timezone,
    })
  }

  function updateField(field: keyof CompanyForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  if (isLoading) {
    return (
      <>
        <PageHeader title="Company Settings" description="Manage your company profile" />
        <p className="text-muted-foreground py-8 text-center text-sm">Loading...</p>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Company Settings" description="Manage your company profile" />

      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6 p-6">
        <div className="grid gap-2">
          <Label htmlFor="name">Company Name</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="tax_number">Tax Number</Label>
            <Input
              id="tax_number"
              value={form.tax_number}
              onChange={(e) => updateField("tax_number", e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tax_office">Tax Office</Label>
            <Input
              id="tax_office"
              value={form.tax_office}
              onChange={(e) => updateField("tax_office", e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="address">Address</Label>
          <Input
            id="address"
            value={form.address}
            onChange={(e) => updateField("address", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => updateField("phone", e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            type="url"
            value={form.website}
            onChange={(e) => updateField("website", e.target.value)}
            placeholder="https://"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="default_currency">Default Currency</Label>
            <Input
              id="default_currency"
              value={form.default_currency}
              onChange={(e) => updateField("default_currency", e.target.value)}
              placeholder="TRY"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="default_tax_rate">Default Tax Rate</Label>
            <Input
              id="default_tax_rate"
              value={form.default_tax_rate}
              onChange={(e) => updateField("default_tax_rate", e.target.value)}
              placeholder="18"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="default_language">Default Language</Label>
            <Input
              id="default_language"
              value={form.default_language}
              onChange={(e) => updateField("default_language", e.target.value)}
              placeholder="en"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              value={form.timezone}
              onChange={(e) => updateField("timezone", e.target.value)}
              placeholder="Europe/Istanbul"
            />
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </>
  )
}
