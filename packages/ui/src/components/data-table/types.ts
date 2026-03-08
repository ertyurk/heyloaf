import type { ReactNode } from "react"

export interface ColumnDef<T> {
  id: string
  header: string | ReactNode
  cell: (row: T) => ReactNode
  className?: string
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[]
  data: T[]
  getRowId: (row: T) => string

  // Loading/empty states
  isLoading?: boolean
  emptyIcon?: ReactNode
  emptyMessage?: string

  // Infinite scroll
  hasMore?: boolean
  onLoadMore?: () => void
  isLoadingMore?: boolean

  // Row selection (optional)
  selectable?: boolean
  selectedIds?: Set<string>
  onSelectionChange?: (ids: Set<string>) => void

  // Row click handler
  onRowClick?: (row: T) => void

  // Row actions (3-dot menu)
  rowActions?: (row: T) => ReactNode

  // Virtualization (for large lists)
  virtualized?: boolean
}
