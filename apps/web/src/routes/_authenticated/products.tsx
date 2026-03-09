import type { components } from "@heyloaf/api-client"
import { AdvancedSelect } from "@heyloaf/ui/components/advanced-select"
import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { Checkbox } from "@heyloaf/ui/components/checkbox"
import { DataTable } from "@heyloaf/ui/components/data-table"
import { DropdownMenuItem, DropdownMenuSeparator } from "@heyloaf/ui/components/dropdown-menu"
import { Input } from "@heyloaf/ui/components/input"
import { Label } from "@heyloaf/ui/components/label"
import { Popover, PopoverContent, PopoverTrigger } from "@heyloaf/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@heyloaf/ui/components/select"
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@heyloaf/ui/components/sheet"
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon"
import Delete01Icon from "@hugeicons/core-free-icons/Delete01Icon"
import Download01Icon from "@hugeicons/core-free-icons/Download01Icon"
import EyeIcon from "@hugeicons/core-free-icons/EyeIcon"
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import QRCode from "qrcode"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { AuditHistory } from "@/components/audit-history"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"
import { useDebounce } from "@/hooks/use-debounce"
import { API_BASE_URL } from "@/lib/api"
import { useAuthStore } from "@/lib/auth"

type Product = components["schemas"]["Product"]
type Category = components["schemas"]["Category"]

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
})

const SALE_UNIT_TYPE_OPTIONS = [
  { value: "piece", label: "Piece" },
  { value: "kg", label: "Kg" },
  { value: "litre", label: "Litre" },
]

const PLU_TYPE_OPTIONS = [
  { value: "weight", label: "Weight" },
  { value: "piece", label: "Piece" },
]

const PURCHASE_VARIANT_PRODUCT_TYPES = ["raw", "commercial", "consumable"]

// --- Purchase Variant type ---
interface PurchaseVariant {
  name: string
  purchase_unit: string
  conversion_qty: number
  barcode: string
  is_default: boolean
}

// --- Shared form fields component ---
interface ProductFormData {
  name: string
  code: string
  barcode: string
  category_id: string
  unit_of_measure: string
  tax_rate: string
  stock_tracking: boolean
  sale_unit_type: string
  plu_type: string
  plu_code: string
  scale_enabled: boolean
  min_stock_level: string
}

interface ProductFormFieldsProps {
  form: ProductFormData
  setForm: React.Dispatch<React.SetStateAction<ProductFormData>>
  categories: Category[]
  imageUrl: string
  imageInputRef: React.RefObject<HTMLInputElement | null>
  uploadingImage: boolean
  onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onUploadClick: () => void
  idPrefix: string
  showStatus?: boolean
  statusValue?: string
  onStatusChange?: (val: string | null) => void
  showProductType?: boolean
  productTypeValue?: string
  onProductTypeChange?: (val: string | null) => void
  productTypeReadonly?: string
  showStockStatus?: boolean
  stockStatusValue?: string
  t: (key: string) => string
}

function ProductFormFields({
  form,
  setForm,
  categories,
  imageUrl,
  imageInputRef,
  uploadingImage,
  onImageChange,
  onUploadClick,
  idPrefix,
  showStatus,
  statusValue,
  onStatusChange,
  showProductType,
  productTypeValue,
  onProductTypeChange,
  productTypeReadonly,
  t,
}: ProductFormFieldsProps) {
  return (
    <>
      {/* Product Image */}
      <div className="grid gap-2">
        <Label>{t("products.productImage")}</Label>
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
            {imageUrl ? (
              <img
                src={`${API_BASE_URL}${imageUrl}`}
                alt={t("common.product")}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-muted-foreground text-xs">{t("products.noImage")}</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={onImageChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadingImage}
              onClick={onUploadClick}
            >
              {uploadingImage ? t("products.uploading") : t("products.uploadImage")}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-name`}>{t("common.name")} *</Label>
        <Input
          id={`${idPrefix}-name`}
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-code`}>{t("common.code")}</Label>
        <Input
          id={`${idPrefix}-code`}
          value={form.code}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-barcode`}>{t("products.barcode")}</Label>
        <Input
          id={`${idPrefix}-barcode`}
          value={form.barcode}
          onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
        />
      </div>
      <div className="grid gap-2">
        <Label>{t("common.category")}</Label>
        <Select
          value={form.category_id}
          onValueChange={(val) => setForm((f) => ({ ...f, category_id: val ?? "" }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("products.selectCategory")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("common.none")}</SelectItem>
            {categories.map((cat: Category) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showProductType && productTypeValue != null && onProductTypeChange && (
        <div className="grid gap-2">
          <Label>{t("products.productType")}</Label>
          <Select value={productTypeValue} onValueChange={onProductTypeChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="raw">{t("products.raw")}</SelectItem>
              <SelectItem value="semi">{t("products.semi")}</SelectItem>
              <SelectItem value="finished">{t("products.finished")}</SelectItem>
              <SelectItem value="commercial">{t("products.commercial")}</SelectItem>
              <SelectItem value="consumable">{t("products.consumable")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {productTypeReadonly != null && (
        <div className="grid gap-2">
          <Label>{t("products.productType")}</Label>
          <Input value={productTypeReadonly} disabled className="capitalize" />
          <p className="text-xs text-muted-foreground">
            {t("products.productTypeCannotBeChanged")}
          </p>
        </div>
      )}

      {showStatus && statusValue != null && onStatusChange && (
        <div className="grid gap-2">
          <Label>{t("common.status")}</Label>
          <Select value={statusValue} onValueChange={onStatusChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">{t("common.draft")}</SelectItem>
              <SelectItem value="inactive">{t("common.inactive")}</SelectItem>
              <SelectItem value="active">{t("common.active")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-2">
        <Label>{t("products.unitOfMeasure")}</Label>
        <Select
          value={form.unit_of_measure}
          onValueChange={(val) => setForm((f) => ({ ...f, unit_of_measure: val ?? "" }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="piece">{t("products.piece")}</SelectItem>
            <SelectItem value="kg">{t("products.kg")}</SelectItem>
            <SelectItem value="liter">{t("products.liter")}</SelectItem>
            <SelectItem value="gram">{t("products.gram")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-tax-rate`}>{t("products.taxRate")}</Label>
        <Input
          id={`${idPrefix}-tax-rate`}
          type="number"
          step="0.01"
          value={form.tax_rate}
          onChange={(e) => setForm((f) => ({ ...f, tax_rate: e.target.value }))}
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${idPrefix}-stock-tracking`}
          checked={form.stock_tracking}
          onCheckedChange={(checked) =>
            setForm((f) => ({
              ...f,
              stock_tracking: checked === true,
            }))
          }
        />
        <Label htmlFor={`${idPrefix}-stock-tracking`}>{t("products.stockTracking")}</Label>
      </div>

      {/* Sale Settings */}
      <div className="border-t pt-4 mt-2">
        <p className="text-sm font-medium mb-3">{t("products.saleSettings")}</p>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>{t("products.saleUnitType")}</Label>
            <AdvancedSelect
              options={SALE_UNIT_TYPE_OPTIONS}
              value={form.sale_unit_type}
              onValueChange={(val) => setForm((f) => ({ ...f, sale_unit_type: val ?? "piece" }))}
              searchable={false}
              className="w-full"
              aria-label={t("products.saleUnitType")}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t("products.pluType")}</Label>
            <AdvancedSelect
              options={PLU_TYPE_OPTIONS}
              value={form.plu_type}
              onValueChange={(val) =>
                setForm((f) => ({
                  ...f,
                  plu_type: val ?? "piece",
                  ...(val === "piece" ? { scale_enabled: false } : {}),
                }))
              }
              searchable={false}
              className="w-full"
              aria-label={t("products.pluType")}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-plu-code`}>{t("products.pluCode")}</Label>
            <Input
              id={`${idPrefix}-plu-code`}
              value={form.plu_code}
              onChange={(e) => setForm((f) => ({ ...f, plu_code: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${idPrefix}-scale-enabled`}
              checked={form.scale_enabled}
              disabled={form.plu_type === "piece"}
              onCheckedChange={(checked) =>
                setForm((f) => ({
                  ...f,
                  scale_enabled: checked === true,
                }))
              }
            />
            <Label htmlFor={`${idPrefix}-scale-enabled`}>{t("products.scaleEnabled")}</Label>
            {form.plu_type === "piece" && (
              <span className="text-xs text-muted-foreground">
                {t("products.disabledForPiecePluType")}
              </span>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-min-stock-level`}>{t("products.minStockLevel")}</Label>
            <Input
              id={`${idPrefix}-min-stock-level`}
              type="number"
              step="0.01"
              value={form.min_stock_level}
              onChange={(e) => setForm((f) => ({ ...f, min_stock_level: e.target.value }))}
            />
          </div>
        </div>
      </div>
    </>
  )
}

// --- QR Code Section ---
function QRCodeSection({ product, t }: { product: Product; t: (key: string) => string }) {
  const [qrUrl, setQrUrl] = useState<string>("")
  const value = product.barcode || product.code || product.id

  useEffect(() => {
    QRCode.toDataURL(value, { width: 128, margin: 1 }).then(setQrUrl)
  }, [value])

  function downloadQR() {
    const link = document.createElement("a")
    link.download = `${product.name}-qr.png`
    link.href = qrUrl
    link.click()
  }

  return (
    <div className="border-t pt-4 mt-2">
      <p className="text-sm font-medium mb-3">{t("products.qrCode")}</p>
      {value ? (
        <div className="flex items-center gap-4">
          {qrUrl && <img src={qrUrl} alt="QR Code" className="h-32 w-32 rounded border" />}
          <Button type="button" variant="outline" size="sm" onClick={downloadQR} disabled={!qrUrl}>
            <HugeiconsIcon icon={Download01Icon} size={14} className="mr-1" />
            {t("products.downloadQR")}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("products.noCodeForQR")}</p>
      )}
    </div>
  )
}

// --- Purchase Variants Section ---
function PurchaseVariantsSection({
  variants,
  setVariants,
  t,
}: {
  variants: PurchaseVariant[]
  setVariants: (v: PurchaseVariant[]) => void
  t: (key: string) => string
}) {
  function addVariant() {
    setVariants([
      ...variants,
      {
        name: "",
        purchase_unit: "",
        conversion_qty: 1,
        barcode: "",
        is_default: variants.length === 0,
      },
    ])
  }

  function removeVariant(index: number) {
    const next = variants.filter((_, i) => i !== index)
    // ensure at least one default if any remain
    if (next.length > 0 && !next.some((v) => v.is_default)) {
      next[0].is_default = true
    }
    setVariants(next)
  }

  function updateVariant(index: number, patch: Partial<PurchaseVariant>) {
    setVariants(
      variants.map((v, i) => {
        if (i !== index) {
          // if the current patch sets is_default true, unset others
          if (patch.is_default) return { ...v, is_default: false }
          return v
        }
        return { ...v, ...patch }
      })
    )
  }

  return (
    <div className="border-t pt-4 mt-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium">{t("products.purchaseVariants")}</p>
        <Button type="button" variant="outline" size="sm" onClick={addVariant}>
          {t("products.addVariant")}
        </Button>
      </div>
      <div className="space-y-3">
        {variants.map((variant, index) => (
          <div key={`variant-${variant.name || index}`} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeVariant(index)}>
                <HugeiconsIcon icon={Delete01Icon} size={14} className="text-destructive" />
                <span className="sr-only">{t("products.removeVariant")}</span>
              </Button>
            </div>
            <div className="grid gap-2">
              <Input
                placeholder={t("products.variantName")}
                value={variant.name}
                onChange={(e) => updateVariant(index, { name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder={t("products.purchaseUnit")}
                value={variant.purchase_unit}
                onChange={(e) => updateVariant(index, { purchase_unit: e.target.value })}
              />
              <Input
                type="number"
                step="0.01"
                placeholder={t("products.conversionQty")}
                value={variant.conversion_qty}
                onChange={(e) =>
                  updateVariant(index, {
                    conversion_qty: Number(e.target.value),
                  })
                }
              />
            </div>
            <Input
              placeholder={t("products.barcode")}
              value={variant.barcode}
              onChange={(e) => updateVariant(index, { barcode: e.target.value })}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id={`variant-default-${index}`}
                checked={variant.is_default}
                onCheckedChange={(checked) =>
                  updateVariant(index, { is_default: checked === true })
                }
              />
              <Label htmlFor={`variant-default-${index}`}>{t("products.defaultVariant")}</Label>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Product Preview Sheet ---
function ProductPreviewSheet({
  product,
  categories,
  open,
  onOpenChange,
  onEdit,
  t,
}: {
  product: Product | null
  categories: Category[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: () => void
  t: (key: string) => string
}) {
  const [qrUrl, setQrUrl] = useState<string>("")

  useEffect(() => {
    if (!product) return
    const value = product.barcode || product.code || product.id
    QRCode.toDataURL(value, { width: 128, margin: 1 }).then(setQrUrl)
  }, [product])

  if (!product) return null

  const categoryName = categories.find((c) => c.id === product.category_id)?.name ?? "-"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>{t("products.quickPreview")}</SheetTitle>
        </SheetHeader>
        <SheetBody className="space-y-4">
          {/* Image */}
          {product.image_url && (
            <div className="flex justify-center">
              <img
                src={`${API_BASE_URL}${product.image_url}`}
                alt={product.name}
                className="h-32 w-32 rounded-lg border object-cover"
              />
            </div>
          )}

          {/* Info card */}
          <div className="space-y-3">
            <div>
              <p className="text-lg font-semibold">{product.name}</p>
              {product.code && (
                <p className="text-sm text-muted-foreground">
                  {t("common.code")}: {product.code}
                </p>
              )}
              {product.barcode && (
                <p className="text-sm text-muted-foreground">
                  {t("products.barcode")}: {product.barcode}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">{t("common.type")}</span>
                <p className="capitalize">{product.product_type}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t("common.status")}</span>
                <div className="mt-0.5">
                  <Badge variant={product.status === "active" ? "default" : "secondary"}>
                    {product.status === "active"
                      ? t("common.active")
                      : product.status === "draft"
                        ? t("common.draft")
                        : t("common.inactive")}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">{t("common.category")}</span>
                <p>{categoryName}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t("products.taxRate")}</span>
                <p>{product.tax_rate ?? "-"}%</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t("products.stockTracking")}</span>
                <p>{product.stock_tracking ? t("common.active") : t("common.inactive")}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t("products.unitOfMeasure")}</span>
                <p className="capitalize">{product.unit_of_measure}</p>
              </div>
            </div>
          </div>

          {/* QR Code */}
          {qrUrl && (
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">{t("products.qrCode")}</p>
              <div className="flex justify-center">
                <img src={qrUrl} alt="QR Code" className="h-32 w-32 rounded border" />
              </div>
            </div>
          )}
        </SheetBody>
        <SheetFooter>
          <SheetClose render={<Button variant="outline" />}>{t("common.close")}</SheetClose>
          <Button
            onClick={() => {
              onOpenChange(false)
              onEdit()
            }}
          >
            {t("common.edit")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// --- Bulk Action Bar ---
function BulkActionBar({
  selectedCount,
  categories,
  onActivate,
  onDeactivate,
  onSetCategory,
  onClear,
  isLoading,
  t,
}: {
  selectedCount: number
  categories: Category[]
  onActivate: () => void
  onDeactivate: () => void
  onSetCategory: (categoryId: string | null) => void
  onClear: () => void
  isLoading: boolean
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-lg border bg-background p-2 shadow-lg">
        <span className="px-2 text-sm font-medium">
          {t("products.selectedCount", { count: selectedCount })}
        </span>
        <Button size="sm" variant="outline" disabled={isLoading} onClick={onActivate}>
          {t("products.bulkActivate")}
        </Button>
        <Button size="sm" variant="outline" disabled={isLoading} onClick={onDeactivate}>
          {t("products.bulkDeactivate")}
        </Button>
        <Popover>
          <PopoverTrigger
            render={
              <Button size="sm" variant="outline" disabled={isLoading}>
                {t("products.bulkSetCategory")}
              </Button>
            }
          />
          <PopoverContent className="w-48 p-1" side="top">
            <div className="max-h-60 overflow-y-auto">
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => onSetCategory(null)}
              >
                {t("common.none")}
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => onSetCategory(cat.id)}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Button size="sm" variant="ghost" onClick={onClear}>
          <HugeiconsIcon icon={Cancel01Icon} size={14} className="mr-1" />
          {t("products.bulkClearSelection")}
        </Button>
      </div>
    </div>
  )
}

function ProductsPage() {
  const { t } = useTranslation()
  const client = useApi()
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Purchase variants for edit sheet
  const [editVariants, setEditVariants] = useState<PurchaseVariant[]>([])

  // Confirmation state for delete
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const createImageInputRef = useRef<HTMLInputElement>(null)
  const editImageInputRef = useRef<HTMLInputElement>(null)
  const [uploadingCreateImage, setUploadingCreateImage] = useState(false)
  const [uploadingEditImage, setUploadingEditImage] = useState(false)
  const [createImageUrl, setCreateImageUrl] = useState("")
  const [editImageUrl, setEditImageUrl] = useState("")

  async function handleImageUpload(
    file: File,
    setUrl: (url: string) => void,
    setUploading: (v: boolean) => void,
    inputRef: React.RefObject<HTMLInputElement | null>
  ) {
    setUploading(true)
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
        throw new Error(err?.error?.message ?? t("products.uploadFailed"))
      }
      const json = await res.json()
      setUrl(json.data.url)
      toast.success(t("products.imageUploaded"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("products.uploadFailed"))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  // Search and filters
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<string | undefined>("all")
  const [statusFilter, setStatusFilter] = useState<string | undefined>("all")
  const debouncedSearch = useDebounce(searchQuery)

  const TYPE_OPTIONS = useMemo(
    () => [
      { value: "all", label: t("products.allTypes") },
      { value: "raw", label: t("products.raw") },
      { value: "semi", label: t("products.semi") },
      { value: "finished", label: t("products.finished") },
      { value: "commercial", label: t("products.commercial") },
      { value: "consumable", label: t("products.consumable") },
    ],
    [t]
  )

  const STATUS_OPTIONS = useMemo(
    () => [
      { value: "all", label: t("products.allStatuses") },
      { value: "draft", label: t("common.draft") },
      { value: "inactive", label: t("common.inactive") },
      { value: "active", label: t("common.active") },
    ],
    [t]
  )

  // Create form state
  const [createForm, setCreateForm] = useState({
    name: "",
    code: "",
    barcode: "",
    category_id: "",
    product_type: "finished",
    unit_of_measure: "piece",
    tax_rate: "",
    stock_tracking: false,
    sale_unit_type: "piece",
    plu_type: "piece",
    plu_code: "",
    scale_enabled: false,
    min_stock_level: "",
  })

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: "",
    code: "",
    barcode: "",
    category_id: "",
    status: "active",
    stock_status: "",
    unit_of_measure: "piece",
    tax_rate: "",
    stock_tracking: false,
    sale_unit_type: "piece",
    plu_type: "piece",
    plu_code: "",
    scale_enabled: false,
    min_stock_level: "",
  })

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await client.GET("/api/products")
      return data
    },
  })

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await client.GET("/api/categories")
      return data
    },
  })

  const products = data?.data ?? []
  const categories = categoriesData?.data ?? []

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    return products.filter((p) => {
      if (q && !p.name?.toLowerCase().includes(q) && !p.code?.toLowerCase().includes(q)) {
        return false
      }
      if (typeFilter && typeFilter !== "all" && p.product_type !== typeFilter) return false
      if (statusFilter && statusFilter !== "all" && p.status !== statusFilter) return false
      return true
    })
  }, [products, debouncedSearch, typeFilter, statusFilter])

  const columns = useMemo(
    () => [
      {
        id: "image",
        header: "",
        cell: (row: Product) => (
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded bg-muted">
            {row.image_url ? (
              <img
                src={`${API_BASE_URL}${row.image_url}`}
                alt={row.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-muted-foreground text-[10px]">--</span>
            )}
          </div>
        ),
      },
      {
        id: "code",
        header: t("common.code"),
        cell: (row: Product) => <span className="text-muted-foreground">{row.code ?? "-"}</span>,
      },
      {
        id: "name",
        header: t("common.name"),
        cell: (row: Product) => <span className="font-medium">{row.name}</span>,
      },
      {
        id: "category",
        header: t("common.category"),
        cell: (row: Product) => (
          <span className="text-muted-foreground">
            {categories.find((c: Category) => c.id === row.category_id)?.name ?? "-"}
          </span>
        ),
      },
      {
        id: "type",
        header: t("common.type"),
        cell: (row: Product) => <span className="text-muted-foreground">{row.product_type}</span>,
      },
      {
        id: "status",
        header: t("common.status"),
        cell: (row: Product) => (
          <Badge variant={row.status === "active" ? "default" : "secondary"}>
            {row.status === "active"
              ? t("common.active")
              : row.status === "draft"
                ? t("common.draft")
                : t("common.inactive")}
          </Badge>
        ),
      },
    ],
    [categories, t]
  )

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: {
        name: string
        product_type: string
        unit_of_measure: string
        stock_tracking?: boolean
        code?: string | null
        barcode?: string | null
        category_id?: string | null
        tax_rate?: number | null
      } = {
        name: createForm.name,
        product_type: createForm.product_type,
        unit_of_measure: createForm.unit_of_measure,
        stock_tracking: createForm.stock_tracking,
      }
      if (createForm.code) body.code = createForm.code
      if (createForm.barcode) body.barcode = createForm.barcode
      if (createForm.category_id) body.category_id = createForm.category_id
      if (createForm.tax_rate) body.tax_rate = Number(createForm.tax_rate)
      const { error } = await client.POST("/api/products", {
        body,
      })
      if (error)
        throw new Error((error as { message?: string }).message ?? t("products.uploadFailed"))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      setCreateOpen(false)
      resetCreateForm()
      toast.success(t("products.productCreated"))
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  function buildUpdateBody() {
    return {
      name: editForm.name,
      unit_of_measure: editForm.unit_of_measure,
      stock_tracking: editForm.stock_tracking,
      scale_enabled: editForm.plu_type === "piece" ? false : editForm.scale_enabled,
      status: editForm.status,
      stock_status: editForm.stock_status,
      code: editForm.code || null,
      barcode: editForm.barcode || null,
      category_id: editForm.category_id || null,
      tax_rate: editForm.tax_rate ? Number(editForm.tax_rate) : null,
      sale_unit_type: editForm.sale_unit_type || null,
      plu_type: editForm.plu_type || null,
      plu_code: editForm.plu_code || null,
      min_stock_level: editForm.min_stock_level ? Number(editForm.min_stock_level) : null,
      image_url: editImageUrl || null,
    }
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingProduct) return
      const { error } = await client.PUT("/api/products/{id}", {
        params: { path: { id: editingProduct.id } },
        body: buildUpdateBody(),
      })
      if (error)
        throw new Error((error as { message?: string }).message ?? t("products.uploadFailed"))

      // Save purchase variants if applicable
      if (PURCHASE_VARIANT_PRODUCT_TYPES.includes(editingProduct.product_type ?? "")) {
        const variantsRes = await fetch(
          `${API_BASE_URL}/api/products/${editingProduct.id}/purchase-options`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ variants: editVariants }),
          }
        )
        if (!variantsRes.ok) {
          toast.error(t("products.uploadFailed"))
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      setEditOpen(false)
      setEditingProduct(null)
      toast.success(t("products.productUpdated"))
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.DELETE("/api/products/{id}", {
        params: { path: { id } },
      })
      if (error)
        throw new Error((error as { message?: string }).message ?? t("products.uploadFailed"))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      toast.success(t("products.productDeleted"))
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // Bulk mutations
  const bulkActivateMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch(`${API_BASE_URL}/api/products/bulk/activate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error("Bulk activate failed")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      setSelectedIds(new Set())
      toast.success(t("products.productUpdated"))
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const bulkDeactivateMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch(`${API_BASE_URL}/api/products/bulk/deactivate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error("Bulk deactivate failed")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      setSelectedIds(new Set())
      toast.success(t("products.productUpdated"))
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const bulkSetCategoryMutation = useMutation({
    mutationFn: async ({ ids, category_id }: { ids: string[]; category_id: string | null }) => {
      const res = await fetch(`${API_BASE_URL}/api/products/bulk/category`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids, category_id }),
      })
      if (!res.ok) throw new Error("Bulk set category failed")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      setSelectedIds(new Set())
      toast.success(t("products.productUpdated"))
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const isBulkLoading =
    bulkActivateMutation.isPending ||
    bulkDeactivateMutation.isPending ||
    bulkSetCategoryMutation.isPending

  const handleBulkActivate = useCallback(() => {
    bulkActivateMutation.mutate([...selectedIds])
  }, [selectedIds, bulkActivateMutation])

  const handleBulkDeactivate = useCallback(() => {
    bulkDeactivateMutation.mutate([...selectedIds])
  }, [selectedIds, bulkDeactivateMutation])

  const handleBulkSetCategory = useCallback(
    (categoryId: string | null) => {
      bulkSetCategoryMutation.mutate({
        ids: [...selectedIds],
        category_id: categoryId,
      })
    },
    [selectedIds, bulkSetCategoryMutation]
  )

  function resetCreateForm() {
    setCreateForm({
      name: "",
      code: "",
      barcode: "",
      category_id: "",
      product_type: "finished",
      unit_of_measure: "piece",
      tax_rate: "",
      stock_tracking: false,
      sale_unit_type: "piece",
      plu_type: "piece",
      plu_code: "",
      scale_enabled: false,
      min_stock_level: "",
    })
    setCreateImageUrl("")
  }

  function openEditSheet(product: Product) {
    setEditingProduct(product)
    setEditImageUrl(product.image_url ?? "")
    setEditForm({
      name: product.name ?? "",
      code: product.code ?? "",
      barcode: product.barcode ?? "",
      category_id: product.category_id ?? "",
      status: product.status ?? "active",
      stock_status: product.stock_status ?? "",
      unit_of_measure: product.unit_of_measure ?? "piece",
      tax_rate: product.tax_rate?.toString() ?? "",
      stock_tracking: product.stock_tracking ?? false,
      sale_unit_type: product.sale_unit_type ?? "piece",
      plu_type: product.plu_type ?? "piece",
      plu_code: product.plu_code ?? "",
      scale_enabled: product.scale_enabled ?? false,
      min_stock_level: product.min_stock_level?.toString() ?? "",
    })
    // Load purchase variants from purchase_options
    const purchaseOptions = (product as Record<string, unknown>).purchase_options as {
      variants?: PurchaseVariant[]
    } | null
    setEditVariants(purchaseOptions?.variants ?? [])
    setEditOpen(true)
  }

  function openPreviewSheet(product: Product) {
    setPreviewProduct(product)
    setPreviewOpen(true)
  }

  function confirmDelete() {
    if (confirmDeleteId) {
      deleteMutation.mutate(confirmDeleteId)
      setConfirmDeleteId(null)
    }
  }

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault()
    createMutation.mutate()
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    updateMutation.mutate()
  }

  return (
    <>
      <PageHeader title={t("products.title")} description={t("products.description")}>
        <Button onClick={() => setCreateOpen(true)}>{t("products.newProduct")}</Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        {/* Filter bar */}
        <div className="flex items-center gap-4">
          <div className="relative w-64">
            <HugeiconsIcon
              icon={Search01Icon}
              size={16}
              className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
            />
            <Input
              placeholder={t("products.searchProducts")}
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <AdvancedSelect
            options={TYPE_OPTIONS}
            value={typeFilter}
            onValueChange={setTypeFilter}
            placeholder={t("products.allTypes")}
            searchable={false}
            className="w-40"
            aria-label={t("products.allTypes")}
          />
          <AdvancedSelect
            options={STATUS_OPTIONS}
            value={statusFilter}
            onValueChange={setStatusFilter}
            placeholder={t("products.allStatuses")}
            searchable={false}
            className="w-40"
            aria-label={t("products.allStatuses")}
          />
        </div>

        {isError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
            <p className="text-sm text-destructive">{t("common.failedToLoadData")}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        )}

        {/* DataTable */}
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage={t("products.noProductsFound")}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onRowClick={openEditSheet}
          rowActions={(row) => (
            <>
              <DropdownMenuItem onClick={() => openPreviewSheet(row)}>
                <HugeiconsIcon icon={EyeIcon} size={14} className="mr-2" />
                {t("products.quickPreview")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openEditSheet(row)}>
                {t("common.edit")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmDeleteId(row.id)}>
                {t("common.delete")}
              </DropdownMenuItem>
            </>
          )}
        />
      </div>

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        categories={categories}
        onActivate={handleBulkActivate}
        onDeactivate={handleBulkDeactivate}
        onSetCategory={handleBulkSetCategory}
        onClear={() => setSelectedIds(new Set())}
        isLoading={isBulkLoading}
        t={t}
      />

      {/* Product Preview Sheet */}
      <ProductPreviewSheet
        product={previewProduct}
        categories={categories}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onEdit={() => {
          if (previewProduct) openEditSheet(previewProduct)
        }}
        t={t}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!confirmDeleteId}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
        description={t("products.confirmDeleteProduct")}
        isPending={deleteMutation.isPending}
      />

      {/* Create Product Sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("products.createProduct")}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleCreateSubmit} className="flex flex-col flex-1 overflow-hidden">
            <SheetBody className="grid gap-4">
              <ProductFormFields
                form={createForm}
                setForm={setCreateForm as never}
                categories={categories}
                imageUrl={createImageUrl}
                imageInputRef={createImageInputRef}
                uploadingImage={uploadingCreateImage}
                onImageChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file)
                    handleImageUpload(
                      file,
                      setCreateImageUrl,
                      setUploadingCreateImage,
                      createImageInputRef
                    )
                }}
                onUploadClick={() => createImageInputRef.current?.click()}
                idPrefix="create"
                showProductType
                productTypeValue={createForm.product_type}
                onProductTypeChange={(val) =>
                  setCreateForm((f) => ({ ...f, product_type: val ?? "" }))
                }
                t={t}
              />
            </SheetBody>
            <SheetFooter>
              <SheetClose render={<Button variant="outline" />}>{t("common.cancel")}</SheetClose>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? t("common.creating") : t("common.create")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Edit Product Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("products.editProduct")}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleEditSubmit} className="flex flex-col flex-1 overflow-hidden">
            <SheetBody className="grid gap-4">
              <ProductFormFields
                form={editForm}
                setForm={setEditForm as never}
                categories={categories}
                imageUrl={editImageUrl}
                imageInputRef={editImageInputRef}
                uploadingImage={uploadingEditImage}
                onImageChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file)
                    handleImageUpload(
                      file,
                      setEditImageUrl,
                      setUploadingEditImage,
                      editImageInputRef
                    )
                }}
                onUploadClick={() => editImageInputRef.current?.click()}
                idPrefix="edit"
                showStatus
                statusValue={editForm.status}
                onStatusChange={(val) => setEditForm((f) => ({ ...f, status: val ?? "" }))}
                productTypeReadonly={editingProduct?.product_type ?? ""}
                t={t}
              />

              {/* Purchase Variants (only for applicable types) */}
              {editingProduct &&
                PURCHASE_VARIANT_PRODUCT_TYPES.includes(editingProduct.product_type ?? "") && (
                  <PurchaseVariantsSection
                    variants={editVariants}
                    setVariants={setEditVariants}
                    t={t}
                  />
                )}

              {/* QR Code */}
              {editingProduct && <QRCodeSection product={editingProduct} t={t} />}
            </SheetBody>
            <SheetFooter>
              {editingProduct && <AuditHistory entityType="product" entityId={editingProduct.id} />}
              <SheetClose render={<Button variant="outline" />}>{t("common.cancel")}</SheetClose>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t("common.saving") : t("common.save")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
