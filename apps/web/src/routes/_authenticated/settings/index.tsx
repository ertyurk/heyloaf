import { Card, CardContent, CardHeader, CardTitle } from "@heyloaf/ui/components/card"
import { createFileRoute, Link } from "@tanstack/react-router"
import { PageHeader } from "@/components/page-header"

export const Route = createFileRoute("/_authenticated/settings/")({
  component: SettingsIndexPage,
})

const sections = [
  {
    title: "Company Settings",
    description: "Manage your company profile and preferences",
    to: "/settings/company",
  },
  {
    title: "Currencies",
    description: "Configure currencies and exchange rates",
    to: "/settings/currencies",
  },
  {
    title: "Payment Methods",
    description: "Set up accepted payment methods",
    to: "/settings/payment-methods",
  },
  {
    title: "Price Lists",
    description: "Manage pricing tiers and schedules",
    to: "/settings/price-lists",
  },
  {
    title: "POS Terminals",
    description: "Configure point-of-sale terminals",
    to: "/settings/pos-terminals",
  },
  {
    title: "Users",
    description: "Manage team members and permissions",
    to: "/settings/users",
  },
] as const

function SettingsIndexPage() {
  return (
    <>
      <PageHeader title="Settings" description="Manage your workspace configuration" />

      <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Link key={section.to} to={section.to} className="block">
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">{section.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  )
}
