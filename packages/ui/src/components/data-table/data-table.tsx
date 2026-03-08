import { useVirtualizer } from "@tanstack/react-virtual"
import { memo, type ReactNode, useCallback, useMemo, useRef } from "react"
import { useInfiniteScroll } from "../../hooks/use-infinite-scroll"
import { Checkbox } from "../checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../table"
import { RowActionsMenu } from "./row-actions-menu"
import type { ColumnDef, DataTableProps } from "./types"

const noop = () => undefined

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-5 w-5 text-muted-foreground"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

interface DataTableRowProps<T> {
  row: T
  id: string
  isSelected: boolean
  columns: ColumnDef<T>[]
  onRowClick?: (row: T) => void
  selectable: boolean
  onSelectRow: (id: string) => void
  rowActions?: (row: T) => ReactNode
}

function DataTableRowInner<T>({
  row,
  id,
  isSelected,
  columns,
  onRowClick,
  selectable,
  onSelectRow,
  rowActions,
}: DataTableRowProps<T>) {
  return (
    <TableRow
      data-state={isSelected ? "selected" : undefined}
      className={onRowClick ? "cursor-pointer" : undefined}
      onClick={onRowClick ? () => onRowClick(row) : undefined}
    >
      {selectable && (
        <TableCell onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-center">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onSelectRow(id)}
              aria-label="Select row"
            />
          </div>
        </TableCell>
      )}
      {columns.map((column) => (
        <TableCell key={column.id} className={column.className}>
          {column.cell(row)}
        </TableCell>
      ))}
      {rowActions && (
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
          <RowActionsMenu>{rowActions(row)}</RowActionsMenu>
        </TableCell>
      )}
    </TableRow>
  )
}

const DataTableRow = memo(DataTableRowInner, (prev, next) => {
  return prev.row === next.row && prev.id === next.id && prev.isSelected === next.isSelected
}) as typeof DataTableRowInner

export function DataTable<T>({
  columns,
  data,
  getRowId,
  isLoading = false,
  emptyIcon,
  emptyMessage = "No data",
  hasMore = false,
  onLoadMore,
  isLoadingMore = false,
  onRowClick,
  selectable = false,
  selectedIds,
  onSelectionChange,
  rowActions,
  virtualized = false,
}: DataTableProps<T>) {
  const { sentinelRef } = useInfiniteScroll({
    hasMore,
    isLoading: isLoading || isLoadingMore,
    onLoadMore: onLoadMore ?? noop,
  })

  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 5,
    enabled: virtualized && !isLoading && data.length > 0,
  })

  const allSelected = useMemo(() => {
    if (!selectable || !selectedIds || data.length === 0) return false
    return data.every((row) => selectedIds.has(getRowId(row)))
  }, [selectable, selectedIds, data, getRowId])

  const someSelected = useMemo(() => {
    if (!selectable || !selectedIds || data.length === 0) return false
    const selectedCount = data.filter((row) => selectedIds.has(getRowId(row))).length
    return selectedCount > 0 && selectedCount < data.length
  }, [selectable, selectedIds, data, getRowId])

  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange) return
    if (allSelected) {
      onSelectionChange(new Set())
    } else {
      onSelectionChange(new Set(data.map(getRowId)))
    }
  }, [allSelected, data, getRowId, onSelectionChange])

  const handleSelectRow = useCallback(
    (id: string) => {
      if (!onSelectionChange || !selectedIds) return
      const next = new Set(selectedIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      onSelectionChange(next)
    },
    [onSelectionChange, selectedIds]
  )

  const totalColumns = columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)

  const tableHeader = (
    <TableHeader className="bg-muted/50">
      <TableRow className="hover:bg-transparent">
        {selectable && (
          <TableHead className="w-10">
            <div className="flex items-center justify-center">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onCheckedChange={handleSelectAll}
                aria-label="Select all"
              />
            </div>
          </TableHead>
        )}
        {columns.map((column) => (
          <TableHead key={column.id} className={column.className}>
            {column.header}
          </TableHead>
        ))}
        {rowActions && <TableHead className="w-10 text-right">Actions</TableHead>}
      </TableRow>
    </TableHeader>
  )

  const emptyOrLoadingBody = (
    <TableBody>
      {isLoading && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={totalColumns} className="h-24 text-center text-muted-foreground">
            <div className="flex items-center justify-center gap-2">
              <LoadingSpinner />
              <span>Loading...</span>
            </div>
          </TableCell>
        </TableRow>
      )}
      {!isLoading && data.length === 0 && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={totalColumns} className="h-24 text-center">
            {emptyIcon && <div className="flex justify-center mb-2">{emptyIcon}</div>}
            <p className="text-muted-foreground text-sm">{emptyMessage}</p>
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  )

  const renderDataRows = () =>
    data.map((row) => {
      const id = getRowId(row)
      const isSelected = selectedIds?.has(id) ?? false
      return (
        <DataTableRow
          key={id}
          row={row}
          id={id}
          isSelected={isSelected}
          columns={columns}
          onRowClick={onRowClick}
          selectable={selectable}
          onSelectRow={handleSelectRow}
          rowActions={rowActions}
        />
      )
    })

  if (virtualized) {
    const virtualItems = virtualizer.getVirtualItems()
    const totalSize = virtualizer.getTotalSize()
    const showEmptyOrLoading = isLoading || (!isLoading && data.length === 0)

    return (
      <div className="rounded-lg border">
        <div ref={parentRef} className="max-h-[600px] overflow-y-auto">
          <Table>
            {tableHeader}
            {showEmptyOrLoading ? (
              emptyOrLoadingBody
            ) : (
              <TableBody>
                {virtualItems.length > 0 && virtualItems[0].start > 0 && (
                  <tr>
                    <td
                      colSpan={totalColumns}
                      style={{ height: virtualItems[0].start, padding: 0, border: "none" }}
                    />
                  </tr>
                )}
                {virtualItems.map((virtualItem) => {
                  const row = data[virtualItem.index]
                  const id = getRowId(row)
                  const isSelected = selectedIds?.has(id) ?? false
                  return (
                    <DataTableRow
                      key={id}
                      row={row}
                      id={id}
                      isSelected={isSelected}
                      columns={columns}
                      onRowClick={onRowClick}
                      selectable={selectable}
                      onSelectRow={handleSelectRow}
                      rowActions={rowActions}
                    />
                  )
                })}
                {virtualItems.length > 0 && (
                  <tr>
                    <td
                      colSpan={totalColumns}
                      style={{
                        height: totalSize - virtualItems[virtualItems.length - 1].end,
                        padding: 0,
                        border: "none",
                      }}
                    />
                  </tr>
                )}
              </TableBody>
            )}
          </Table>
        </div>

        {hasMore && <div ref={sentinelRef} className="h-1" aria-hidden="true" />}

        {isLoadingMore && (
          <div className="flex justify-center items-center py-4 border-t">
            <LoadingSpinner />
            <span className="ml-2 text-sm text-muted-foreground">Loading more...</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border">
      <Table>
        {tableHeader}
        {isLoading || (!isLoading && data.length === 0) ? (
          emptyOrLoadingBody
        ) : (
          <TableBody>{renderDataRows()}</TableBody>
        )}
      </Table>

      {hasMore && <div ref={sentinelRef} className="h-1" aria-hidden="true" />}

      {isLoadingMore && (
        <div className="flex justify-center items-center py-4 border-t">
          <LoadingSpinner />
          <span className="ml-2 text-sm text-muted-foreground">Loading more...</span>
        </div>
      )}
    </div>
  )
}

export { RowActionsMenu } from "./row-actions-menu"
