import { Card, CardContent, CardHeader, CardTitle } from "@heyloaf/ui/components/card"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { PageHeader } from "@/components/page-header"

export const Route = createFileRoute("/_authenticated/settings/")({
  component: SettingsIndexPage,
})

const sections = [
  {
    titleKey: "settings.general.title",
    descriptionKey: "settings.general.description",
    to: "/settings/general",
  },
  {
    titleKey: "settings.company.title",
    descriptionKey: "settings.company.description",
    to: "/settings/company",
  },
  {
    titleKey: "settings.currencies.title",
    descriptionKey: "settings.currencies.description",
    to: "/settings/currencies",
  },
  {
    titleKey: "settings.paymentMethods.title",
    descriptionKey: "settings.paymentMethods.description",
    to: "/settings/payment-methods",
  },
  {
    titleKey: "settings.priceLists.title",
    descriptionKey: "settings.priceLists.description",
    to: "/settings/price-lists",
  },
  {
    titleKey: "settings.posTerminals.title",
    descriptionKey: "settings.posTerminals.description",
    to: "/settings/pos-terminals",
  },
  {
    titleKey: "settings.stockSettings.title",
    descriptionKey: "settings.stockSettings.description",
    to: "/settings/stock",
  },
  {
    titleKey: "settings.users.title",
    descriptionKey: "settings.users.description",
    to: "/settings/users",
  },
  {
    titleKey: "settings.notificationSettings.title",
    descriptionKey: "settings.notificationSettings.description",
    to: "/settings/notifications",
  },
  {
    titleKey: "settings.auditLogs.title",
    descriptionKey: "settings.auditLogs.description",
    to: "/settings/audit",
  },
  {
    titleKey: "scale.title",
    descriptionKey: "scale.configuration",
    to: "/settings/scale",
  },
] as const

function SettingsIndexPage() {
  const { t } = useTranslation()

  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />

      <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Link key={section.to} to={section.to} className="block">
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle>{t(section.titleKey)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">{t(section.descriptionKey)}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  )
}
