export function formatCurrency(amount: number, currency = "TRY", locale?: string) {
  const resolvedLocale =
    locale ?? (typeof document !== "undefined" ? document.documentElement.lang : "en") ?? "en"
  return new Intl.NumberFormat(resolvedLocale, {
    style: "currency",
    currency,
  }).format(amount)
}
