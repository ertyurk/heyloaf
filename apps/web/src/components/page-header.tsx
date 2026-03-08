import type { ReactNode } from "react"

interface PageHeaderProps {
  title: string
  description?: string
  children?: ReactNode
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-6">
      <div className="flex flex-col justify-center">
        <h1 className="text-lg font-semibold leading-tight">{title}</h1>
        {description && (
          <p className="text-xs text-muted-foreground leading-tight">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  )
}
