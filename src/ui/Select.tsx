import type { ReactNode } from 'react'
import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface SelectOption {
  value: string
  label: string
  /** A mark beside the label, for a value that reads as a state. */
  icon?: ReactNode
}

interface SelectProps {
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  /** Accessible name, since the trigger shows a value rather than a label. */
  label: string
  title?: string
  className?: string
  /** Sits inside the trigger ahead of the value, for a status mark and the like. */
  children?: ReactNode
}

/** For a select that sits in a band of the page rather than in a form. */
export const PILL =
  'rounded-full border border-border bg-card py-[3px] pr-2 pl-2.5 text-[11.5px] font-semibold text-muted-foreground hover:bg-accent'

/**
 * The native control cannot be styled past its border, and an OS dropdown in
 * the middle of the board reads as another application. This is the same panel
 * the menus use.
 */
export function Select({
  value,
  onValueChange,
  options,
  label,
  title,
  className,
  children,
}: SelectProps) {
  // Told rather than inferred. Radix works the text out from the items it has
  // mounted, so a list that arrives after the first render leaves it blank
  const current = options.find((option) => option.value === value)

  return (
    <SelectRoot
      value={value}
      // A value nobody offered is not a choice. Radix keeps a hidden native
      // select for form compatibility, and a value set while the items are
      // unmounted lands on its empty option, which it then reports back
      onValueChange={(next) => {
        if (options.some((option) => option.value === next)) onValueChange(next)
      }}
    >
      <SelectTrigger className={className} aria-label={label} title={title}>
        {/* One item, so a mark ahead of the value travels with it instead of
            being pushed away from its own label */}
        <span className="flex items-center gap-1.5">
          {children}
          <SelectValue>{current?.label}</SelectValue>
        </span>
      </SelectTrigger>

      <SelectContent position="popper" align="start" sideOffset={6}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} icon={option.icon}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  )
}
