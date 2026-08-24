import * as RadixSelect from '@radix-ui/react-select'
import type { ReactNode } from 'react'
import { CheckIcon, ChevronIcon } from './icons'

export interface SelectOption {
  value: string
  label: string
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

const TRIGGER = 'inline-flex cursor-pointer items-center gap-1.5 outline-none'

/** For a select that sits in a band of the page rather than in a form. */
export const PILL =
  'rounded-full border border-line bg-panel py-[3px] pr-2 pl-2.5 text-[11.5px] font-semibold text-lead hover:bg-hover'

const SCROLLER = 'flex h-4 cursor-default items-center justify-center text-dim'

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
  className = '',
  children,
}: SelectProps) {
  // Told rather than inferred. Radix works the text out from the items it has
  // mounted, so a list that arrives after the first render leaves it blank
  const current = options.find((option) => option.value === value)

  return (
    <RadixSelect.Root
      value={value}
      // A value nobody offered is not a choice. Radix keeps a hidden native
      // select for form compatibility, and a value set while the items are
      // unmounted lands on its empty option, which it then reports back
      onValueChange={(next) => {
        if (options.some((option) => option.value === next)) onValueChange(next)
      }}
    >
      <RadixSelect.Trigger className={`${TRIGGER} ${className}`} aria-label={label} title={title}>
        {children}
        <RadixSelect.Value>{current?.label}</RadixSelect.Value>
        <RadixSelect.Icon>
          <ChevronIcon className="size-3 text-dim" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        {/* The viewport scrolls on its own, it just needs to be told how tall it
            may get. Whichever is smaller, a readable list or the room on screen. */}
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          className="z-95 flex max-h-[min(280px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] flex-col rounded-[6px] border border-line bg-panel p-1.5 shadow-lift"
        >
          {/* Radix hides the scrollbar, so these are the only sign of more below */}
          <RadixSelect.ScrollUpButton className={SCROLLER}>
            <ChevronIcon className="size-3 rotate-180" />
          </RadixSelect.ScrollUpButton>

          <RadixSelect.Viewport>
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-[6px] py-[7px] pr-2.5 pl-2 text-[13.5px] outline-none select-none data-highlighted:bg-hover"
              >
                <span className="w-3.5 shrink-0">
                  <RadixSelect.ItemIndicator>
                    <CheckIcon className="size-3.5 text-accent" />
                  </RadixSelect.ItemIndicator>
                </span>
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>

          <RadixSelect.ScrollDownButton className={SCROLLER}>
            <ChevronIcon className="size-3" />
          </RadixSelect.ScrollDownButton>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
}
