export function formatDate(
  date: string | Date,
  options?: Intl.DateTimeFormatOptions,
  locale?: string
) {
  const resolvedLocale =
    locale ?? (typeof document !== "undefined" ? document.documentElement.lang : "en") ?? "en"
  return new Intl.DateTimeFormat(resolvedLocale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date, locale?: string) {
  return formatDate(
    date,
    {
      hour: "2-digit",
      minute: "2-digit",
    },
    locale
  )
}
