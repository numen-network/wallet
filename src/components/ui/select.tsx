import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Select as SelectPrimitive } from 'radix-ui'

import { cn } from '@/lib/cn'
import { Check, ChevronDown } from 'lucide-react'

function Select({ ...props }: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectValue({ ...props }: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

const selectTriggerVariants = cva(
  'inline-flex cursor-pointer items-center gap-1.5 outline-none select-none disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-hint [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /* Bare, so the field around it draws the box, the way an input here carries nothing of its own. */
        bare: '',
        /* For a select that sits in a band of the page rather than in a form. */
        pill: 'rounded-full border border-border bg-card py-[3px] pr-2 pl-2.5 text-[11.5px] font-semibold text-muted-foreground hover:bg-accent',
        /* A box of its own, for a select in a row that has no field to sit in. */
        boxed: 'justify-between rounded-md border border-input bg-muted px-2.5 py-1 text-[13px]',
      },
    },
    defaultVariants: {
      variant: 'bare',
    },
  },
)

function SelectTrigger({
  className,
  children,
  variant = 'bare',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> &
  VariantProps<typeof selectTriggerVariants>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-variant={variant}
      className={cn(selectTriggerVariants({ variant, className }))}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-3 text-dim" strokeWidth={2.4} />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = 'item-aligned',
  align = 'center',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        data-align-trigger={position === 'item-aligned'}
        className={cn(
          'relative z-95 max-h-[min(280px,var(--radix-select-content-available-height))] min-w-(--radix-select-trigger-width) origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border border-border bg-card p-1.5 text-card-foreground shadow-lift animation-duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          className,
        )}
        position={position}
        align={align}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          data-position={position}
          className="data-[position=popper]:h-(--radix-select-trigger-height) data-[position=popper]:w-full"
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({
  className,
  children,
  icon,
  detail,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item> & {
  /** What stands in the tick's column where a value brings a mark of its own. */
  icon?: React.ReactNode
  /** Shown right of the label in the open list, since the trigger shows the label alone. */
  detail?: React.ReactNode
}) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex w-full cursor-pointer items-center gap-2 rounded-lg py-[7px] pr-2.5 pl-2 text-[13.5px] outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
        icon && 'data-checked:font-semibold',
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none w-3.5 shrink-0">
        {icon ?? (
          <SelectPrimitive.ItemIndicator>
            <Check className="size-3.5 text-primary" strokeWidth={2.4} />
          </SelectPrimitive.ItemIndicator>
        )}
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      {detail && <span className="ml-auto pl-4 font-mono text-dim">{detail}</span>}
    </SelectPrimitive.Item>
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        'z-10 flex h-4 cursor-default items-center justify-center bg-card text-dim',
        className,
      )}
      {...props}
    >
      <ChevronDown className="size-3 rotate-180" strokeWidth={2.4} />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        'z-10 flex h-4 cursor-default items-center justify-center bg-card text-dim',
        className,
      )}
      {...props}
    >
      <ChevronDown className="size-3" strokeWidth={2.4} />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectItem,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectTrigger,
  SelectValue,
}
