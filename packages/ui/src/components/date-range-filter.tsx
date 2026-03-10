import Calendar03Icon from "@hugeicons/core-free-icons/Calendar03Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { endOfDay, format, type Locale, startOfDay, startOfMonth, subMonths } from "date-fns"
import { useState } from "react"
import type { DateRange } from "react-day-picker"

import { Button } from "./button"
import { Calendar } from "./calendar"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

interface DateRangeFilterLabels {
  trigger?: string
  selectDates?: string
  clear?: string
  cancel?: string
  apply?: string
}

interface DateRangeFilterProps {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  className?: string
  labels?: DateRangeFilterLabels
  locale?: Locale
}

export function DateRangeFilter({
  from,
  to,
  onChange,
  className,
  labels,
  locale,
}: DateRangeFilterProps) {
  const l = {
    trigger: labels?.trigger ?? "Date range",
    selectDates: labels?.selectDates ?? "Select start and end dates",
    clear: labels?.clear ?? "Clear",
    cancel: labels?.cancel ?? "Cancel",
    apply: labels?.apply ?? "Apply",
  }
  const fmtOpts = locale ? { locale } : undefined
  const [isOpen, setIsOpen] = useState(false)
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(undefined)

  const today = new Date()
  const previousMonth = startOfMonth(subMonths(today, 1))

  const hasRange = !!(from && to)

  const handleOpen = (open: boolean) => {
    if (open) {
      setPendingRange(from && to ? { from: new Date(from), to: new Date(to) } : undefined)
    }
    setIsOpen(open)
  }

  const handleApply = () => {
    if (pendingRange?.from && pendingRange?.to) {
      onChange(startOfDay(pendingRange.from).toISOString(), endOfDay(pendingRange.to).toISOString())
      setIsOpen(false)
    }
  }

  const handleClear = () => {
    onChange("", "")
    setPendingRange(undefined)
    setIsOpen(false)
  }

  const canApply = pendingRange?.from && pendingRange?.to

  return (
    <Popover open={isOpen} onOpenChange={handleOpen}>
      <PopoverTrigger
        render={<Button variant={hasRange ? "default" : "outline"} className={className} />}
      >
        <HugeiconsIcon icon={Calendar03Icon} size={14} className="mr-2" />
        {hasRange ? (
          <>
            {format(new Date(from), "LLL dd, y", fmtOpts)} &ndash;{" "}
            {format(new Date(to), "LLL dd, y", fmtOpts)}
          </>
        ) : (
          <span>{l.trigger}</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          defaultMonth={previousMonth}
          selected={pendingRange}
          onSelect={setPendingRange}
          numberOfMonths={2}
          disabled={{ after: today }}
          locale={locale}
        />
        <div className="flex items-center justify-between border-t p-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <HugeiconsIcon icon={Calendar03Icon} size={14} />
            {pendingRange?.from ? (
              <span>
                {format(pendingRange.from, "MMM d, yyyy", fmtOpts)}
                {pendingRange.to && ` \u2013 ${format(pendingRange.to, "MMM d, yyyy", fmtOpts)}`}
              </span>
            ) : (
              <span>{l.selectDates}</span>
            )}
          </div>
          <div className="flex gap-2">
            {hasRange && (
              <Button variant="ghost" size="sm" onClick={handleClear}>
                {l.clear}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
              {l.cancel}
            </Button>
            <Button size="sm" onClick={handleApply} disabled={!canApply}>
              {l.apply}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
