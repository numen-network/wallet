import type { ComponentProps, ReactNode } from 'react'
import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tip } from './Tip'

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
  /** What the hover says about the choice, which the pill has no room for. */
  hint?: ReactNode
  variant?: ComponentProps<typeof SelectTrigger>['variant']
  className?: string
  /** Sits inside the trigger ahead of the value, for a status mark and the like. */
  children?: ReactNode
}

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
  hint,
  variant,
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
      <Tip text={hint}>
        <SelectTrigger variant={variant} className={className} aria-label={label}>
          {/* One item, so a mark ahead of the value travels with it instead of
              being pushed away from its own label */}
          <span className="flex items-center gap-1.5">
            {children}
            <SelectValue>{current?.label}</SelectValue>
          </span>
        </SelectTrigger>
      </Tip>

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
