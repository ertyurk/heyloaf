import { enUS, tr } from "date-fns/locale"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

const localeMap: Record<string, typeof tr> = {
  tr,
  en: enUS,
}

export function useDateLocale() {
  const { t, i18n } = useTranslation()

  return useMemo(
    () => ({
      locale: localeMap[i18n.language] ?? tr,
      dateRangeLabels: {
        trigger: t("common.dateRange"),
        selectDates: t("common.selectDates"),
        clear: t("common.clear"),
        cancel: t("common.cancel"),
        apply: t("common.apply"),
      },
    }),
    [t, i18n.language]
  )
}
