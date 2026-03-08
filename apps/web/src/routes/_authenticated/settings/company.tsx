import { Button } from "@heyloaf/ui/components/button"
import { Input } from "@heyloaf/ui/components/input"
import { Label } from "@heyloaf/ui/components/label"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"
import { useAuthStore } from "@/lib/auth"

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
  logo_url: string
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
  logo_url: "",
  default_currency: "",
  default_tax_rate: "",
  default_language: "",
  timezone: "",
}

const API_BASE_URL =
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8083`
    : "http://localhost:8083"

function CompanyPage() {
  const client = useApi()
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

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
        logo_url: company.logo_url ?? "",
        default_currency: company.default_currency ?? "",
        default_tax_rate: String(company.default_tax_rate ?? ""),
        default_language: company.default_language ?? "",
        timezone: company.timezone ?? "",
      })
    }
  }, [company])

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(`${API_BASE_URL}/api/uploads`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err?.error?.message ?? "Upload failed")
      }
      const json = await res.json()
      const url: string = json.data.url
      setForm((f) => ({ ...f, logo_url: url }))
      toast.success("Logo uploaded")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploadingLogo(false)
      if (logoInputRef.current) logoInputRef.current.value = ""
    }
  }

  const updateMutation = useMutation({
    mutationFn: async (body: {
      name: string
      tax_number?: string
      tax_office?: string
      address?: string
      phone?: string
      email?: string
      website?: string
      logo_url?: string
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
      logo_url: form.logo_url || undefined,
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
        {/* Logo Upload */}
        <div className="grid gap-2">
          <Label>Company Logo</Label>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
              {form.logo_url ? (
                <img
                  src={`${API_BASE_URL}${form.logo_url}`}
                  alt="Company logo"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-muted-foreground text-xs">No logo</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                className="hidden"
                onChange={handleLogoUpload}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingLogo}
                onClick={() => logoInputRef.current?.click()}
              >
                {uploadingLogo ? "Uploading..." : "Upload Logo"}
              </Button>
              <p className="text-muted-foreground text-xs">JPEG, PNG, WebP, or SVG. Max 5MB.</p>
            </div>
          </div>
        </div>

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
