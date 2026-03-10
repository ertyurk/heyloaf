import { DateRangeFilter } from "@heyloaf/ui/components/date-range-filter"
import { useDateLocale } from "@/hooks/use-date-locale"

interface LocalizedDateRangeFilterProps {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  className?: string
}

export function LocalizedDateRangeFilter(props: LocalizedDateRangeFilterProps) {
  const { locale, dateRangeLabels } = useDateLocale()
  return <DateRangeFilter {...props} labels={dateRangeLabels} locale={locale} />
}
