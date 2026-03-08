"use client"

import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import ArrowDown01Icon from "@hugeicons/core-free-icons/ArrowDown01Icon"
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon"
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon"
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import Fuse from "fuse.js"
import * as React from "react"

import { cn } from "../lib/utils"

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
  group?: string
}

export interface AdvancedSelectProps {
  options: SelectOption[]
  placeholder?: string
  multiple?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  disabled?: boolean
  size?: "sm" | "default"
  className?: string
  "aria-label"?: string

  value?: string
  onValueChange?: (value: string | undefined) => void

  values?: string[]
  onValuesChange?: (values: string[]) => void
  maxChips?: number

  creatable?: boolean
  onCreateNew?: (name: string) => void
  createLabel?: string
}

function useFuzzySearch(options: SelectOption[], searchTerm: string) {
  return React.useMemo(() => {
    if (!searchTerm.trim()) {
      return options
    }

    const fuse = new Fuse(options, {
      keys: ["label", "group"],
      threshold: 0.4,
      ignoreLocation: true,
    })

    return fuse.search(searchTerm).map((result) => result.item)
  }, [options, searchTerm])
}

function useGroupedOptions(options: SelectOption[]) {
  return React.useMemo(() => {
    const hasGroups = options.some((o) => o.group)
    if (!hasGroups) return null

    const groups: { label: string; options: SelectOption[] }[] = []
    const seen = new Map<string, number>()

    for (const opt of options) {
      const key = opt.group ?? ""
      const idx = seen.get(key)
      if (idx !== undefined) {
        groups[idx].options.push(opt)
      } else {
        seen.set(key, groups.length)
        groups.push({ label: key, options: [opt] })
      }
    }
    return groups
  }, [options])
}

function SelectCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-sm border",
        "border-input bg-background",
        checked && "border-primary bg-primary text-primary-foreground"
      )}
    >
      {checked && <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={3} />}
    </span>
  )
}

function SelectChip({
  label,
  onRemove,
}: {
  label: string
  onRemove: (e: React.SyntheticEvent) => void
}) {
  return (
    <span className="bg-muted text-foreground flex h-5 items-center gap-0.5 rounded-sm px-1.5 text-xs font-medium">
      <span className="max-w-20 truncate">{label}</span>
      {/* biome-ignore lint/a11y/useSemanticElements: can't use <button> — parent is already a <button> (popover trigger) */}
      <span
        role="button"
        tabIndex={0}
        onClick={onRemove}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onRemove(e)
          }
        }}
        className="text-muted-foreground hover:text-foreground -mr-0.5 flex size-4 items-center justify-center rounded-sm cursor-pointer"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
      </span>
    </span>
  )
}

const EMPTY_VALUES: string[] = []

export function AdvancedSelect({
  options,
  placeholder = "Select...",
  multiple = false,
  searchable = true,
  searchPlaceholder = "Search...",
  disabled = false,
  size = "default",
  className,
  value,
  onValueChange,
  values = EMPTY_VALUES,
  onValuesChange,
  maxChips = 2,
  creatable = false,
  onCreateNew,
  createLabel = "Create",
  "aria-label": ariaLabel,
}: AdvancedSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  const filteredOptions = useFuzzySearch(options, search)
  const groupedOptions = useGroupedOptions(filteredOptions)

  const showCreateOption =
    creatable &&
    search.trim().length > 0 &&
    !options.some((opt) => opt.label.toLowerCase() === search.trim().toLowerCase())

  const selectedValues = multiple ? values : value != null ? [value] : []

  const getLabel = React.useCallback(
    (val: string) => {
      return options.find((opt) => opt.value === val)?.label ?? val
    },
    [options]
  )

  const handleSelect = React.useCallback(
    (optionValue: string) => {
      if (multiple) {
        const isSelected = selectedValues.includes(optionValue)
        const newValues = isSelected
          ? selectedValues.filter((v) => v !== optionValue)
          : [...selectedValues, optionValue]
        onValuesChange?.(newValues)
      } else {
        onValueChange?.(optionValue)
        setOpen(false)
      }
    },
    [multiple, selectedValues, onValueChange, onValuesChange]
  )

  const handleSelectAll = React.useCallback(() => {
    if (!multiple) return
    const enabledOptions = filteredOptions.filter((opt) => !opt.disabled)
    const allSelected = enabledOptions.every((opt) => selectedValues.includes(opt.value))

    if (allSelected) {
      const filteredValues = enabledOptions.map((opt) => opt.value)
      onValuesChange?.(selectedValues.filter((v) => !filteredValues.includes(v)))
    } else {
      const newValues = [...new Set([...selectedValues, ...enabledOptions.map((opt) => opt.value)])]
      onValuesChange?.(newValues)
    }
  }, [multiple, filteredOptions, selectedValues, onValuesChange])

  const handleRemoveChip = React.useCallback(
    (e: React.SyntheticEvent, val: string) => {
      e.stopPropagation()
      if (multiple) {
        onValuesChange?.(selectedValues.filter((v) => v !== val))
      } else {
        onValueChange?.(undefined)
      }
    },
    [multiple, selectedValues, onValueChange, onValuesChange]
  )

  const allFilteredSelected = React.useMemo(() => {
    const enabledOptions = filteredOptions.filter((opt) => !opt.disabled)
    return (
      enabledOptions.length > 0 && enabledOptions.every((opt) => selectedValues.includes(opt.value))
    )
  }, [filteredOptions, selectedValues])

  React.useEffect(() => {
    if (!open) {
      setSearch("")
    }
  }, [open])

  React.useEffect(() => {
    if (open && searchable) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus()
      }, 10)
      return () => clearTimeout(timer)
    }
  }, [open, searchable])

  const visibleChips = multiple ? selectedValues.slice(0, maxChips) : []
  const remainingCount = selectedValues.length - maxChips

  const renderOption = (option: SelectOption) => {
    const isSelected = selectedValues.includes(option.value)
    return (
      <button
        key={option.value}
        type="button"
        disabled={option.disabled}
        onClick={() => handleSelect(option.value)}
        className={cn(
          "hover:bg-accent hover:text-accent-foreground",
          "flex w-full cursor-default items-center gap-2 px-2 py-1.5 text-xs outline-none",
          "disabled:pointer-events-none disabled:opacity-50",
          isSelected && !multiple && "bg-accent/50"
        )}
      >
        {multiple && <SelectCheckbox checked={isSelected} />}
        <span className="flex-1 truncate text-left">{option.label}</span>
        {!multiple && isSelected && (
          <HugeiconsIcon
            icon={Tick02Icon}
            size={14}
            strokeWidth={2}
            className="text-primary shrink-0"
          />
        )}
      </button>
    )
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        type="button"
        disabled={disabled}
        nativeButton={false}
        aria-label={ariaLabel}
        data-slot="advanced-select-trigger"
        data-size={size}
        className={cn(
          "border-input data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50",
          "focus-visible:border-ring focus-visible:ring-ring/50",
          "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          "gap-1.5 rounded-none border bg-transparent py-1.5 pe-2 ps-2.5 text-xs transition-colors select-none",
          "focus-visible:ring-1 aria-invalid:ring-1",
          "data-[size=default]:min-h-8 data-[size=sm]:min-h-7",
          "flex w-full items-center justify-between whitespace-nowrap outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "[&_svg]:pointer-events-none [&_svg]:shrink-0",
          className
        )}
      >
        {selectedValues.length === 0 ? (
          <span className="text-muted-foreground">{placeholder}</span>
        ) : multiple ? (
          <div className="flex flex-1 flex-wrap items-center gap-1">
            {visibleChips.map((val) => (
              <SelectChip
                key={val}
                label={getLabel(val)}
                onRemove={(e) => handleRemoveChip(e, val)}
              />
            ))}
            {remainingCount > 0 && (
              <span className="text-muted-foreground text-xs">+{remainingCount} more</span>
            )}
          </div>
        ) : (
          <span className="truncate">{getLabel(selectedValues[0])}</span>
        )}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side="bottom"
          sideOffset={4}
          align="start"
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            data-slot="advanced-select-content"
            className={cn(
              "bg-popover text-popover-foreground ring-foreground/10",
              "min-w-45 w-(--anchor-width) max-h-[min(300px,var(--available-height))]",
              "rounded-none shadow-md ring-1 outline-none overflow-hidden",
              "data-open:animate-in data-closed:animate-out",
              "data-closed:fade-out-0 data-open:fade-in-0",
              "data-closed:zoom-out-95 data-open:zoom-in-95",
              "data-side=bottom:slide-in-from-top-2 data-side=top:slide-in-from-bottom-2",
              "duration-100"
            )}
          >
            {searchable && (
              <div className="border-border border-b p-2">
                <div className="relative">
                  <HugeiconsIcon
                    icon={Search01Icon}
                    size={14}
                    className="text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2"
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={searchPlaceholder}
                    className={cn(
                      "bg-muted/50 placeholder:text-muted-foreground w-full rounded-sm border-0 py-1.5 pl-7 pr-2 text-xs",
                      "focus:outline-none focus:ring-1 focus:ring-ring/50"
                    )}
                  />
                </div>
              </div>
            )}

            <div className="max-h-50 overflow-y-auto overscroll-contain py-1">
              {multiple && filteredOptions.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className={cn(
                      "hover:bg-accent hover:text-accent-foreground",
                      "flex w-full cursor-default items-center gap-2 px-2 py-1.5 text-xs outline-none"
                    )}
                  >
                    <SelectCheckbox checked={allFilteredSelected} />
                    <span className="font-medium">Select All</span>
                  </button>
                  <div className="bg-border mx-2 my-1 h-px" />
                </>
              )}

              {filteredOptions.length === 0 && !showCreateOption ? (
                <div className="text-muted-foreground px-2 py-4 text-center text-xs">
                  No options found
                </div>
              ) : groupedOptions ? (
                groupedOptions.map((group, gi) => (
                  <React.Fragment key={group.label || `_ungrouped_${gi}`}>
                    {group.label && (
                      <div className="text-muted-foreground px-2 pt-2 pb-0.5 text-[10px] font-medium uppercase tracking-wider">
                        {group.label}
                      </div>
                    )}
                    {group.options.map(renderOption)}
                  </React.Fragment>
                ))
              ) : (
                filteredOptions.map(renderOption)
              )}

              {showCreateOption && (
                <>
                  {filteredOptions.length > 0 && <div className="bg-border mx-2 my-1 h-px" />}
                  <button
                    type="button"
                    onClick={() => {
                      onCreateNew?.(search.trim())
                      setSearch("")
                      setOpen(false)
                    }}
                    className={cn(
                      "hover:bg-accent hover:text-accent-foreground",
                      "flex w-full cursor-default items-center gap-2 px-2 py-1.5 text-xs outline-none"
                    )}
                  >
                    <span className="text-primary font-medium">+</span>
                    <span>
                      {createLabel} &ldquo;{search.trim()}&rdquo;
                    </span>
                  </button>
                </>
              )}
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
