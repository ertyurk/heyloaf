import { Button } from "@heyloaf/ui/components/button"
import { useTranslation } from "react-i18next"

interface ConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  title?: string
  description?: string
  confirmLabel?: string
  destructive?: boolean
  isPending?: boolean
}

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel,
  destructive = true,
  isPending = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="rounded-lg border bg-background p-6 shadow-lg max-w-sm w-full mx-4">
        <h3 className="text-lg font-semibold">{title ?? t("common.confirmDelete")}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {description ?? t("common.deleteConfirmation")}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={isPending}
          >
            {confirmLabel ?? t("common.delete")}
          </Button>
        </div>
      </div>
    </div>
  )
}
