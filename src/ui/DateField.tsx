import { useState } from 'react'
import { addYears, format, parseISO } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/cn'
import { BOX } from './Field'

/** How far ahead the year list runs. Without an end it comes out empty. */
const YEARS = 10

/** The shape a day travels in, which is the shape a bound has to be written in. */
export const stamp = (on: Date) => format(on, 'yyyy-MM-dd')

/**
 * A day off a calendar the wallet draws. The native box takes its field order,
 * its separators and its own picker from the browser's locale, so the same form
 * reads differently on every machine and never quite matches the fields around
 * it.
 *
 * The value is a yyyy-MM-dd string on both sides, which is what a draft holds.
 */
export function DateField({
  label,
  value,
  onChange,
  min,
  placeholder = 'Pick a date',
  className,
}: {
  /** Accessible name, since the box shows a day rather than a label. */
  label: string
  value: string
  onChange: (on: string) => void
  /** The earliest day worth offering, with everything before it out of reach. Today by default. */
  min?: string | undefined
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const picked = value ? parseISO(value) : undefined
  // The floor rules the earlier days out and stops the calendar paging back to them
  const floor = min ? parseISO(min) : new Date()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        aria-label={label}
        className={cn(
          BOX,
          'flex items-center gap-2 text-left',
          className,
          'data-[state=open]:border-primary',
        )}
      >
        <span
          className={cn('min-w-0 flex-1 truncate text-[15px]', value ? 'font-mono' : 'text-hint')}
        >
          {value || placeholder}
        </span>
        <CalendarDays className="shrink-0 text-dim" />
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={6} collisionPadding={8} className="w-auto p-0">
        <Calendar
          autoFocus
          mode="single"
          captionLayout="dropdown"
          selected={picked}
          defaultMonth={picked ?? floor}
          startMonth={floor}
          endMonth={addYears(floor, YEARS)}
          disabled={{ before: floor }}
          onSelect={(next) => {
            onChange(next ? stamp(next) : '')
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
