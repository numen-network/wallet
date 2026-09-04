import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/cn'
import { Label } from '@/components/ui/label'

/* The small uppercase caption that heads a group of fields or a column of them. */
const CAPTION = 'text-[11px] font-bold tracking-[0.07em] text-muted-foreground uppercase'

/* The small dim line under a field, or under anything else that wants a note. */
const NOTE = 'text-[12.5px] text-dim'

function FieldSet({ className, ...props }: React.ComponentProps<'fieldset'>) {
  return <fieldset data-slot="field-set" className={cn('min-w-0', className)} {...props} />
}

function FieldLegend({ className, ...props }: React.ComponentProps<'legend'>) {
  return (
    <legend data-slot="field-legend" className={cn('mb-1.5', CAPTION, className)} {...props} />
  )
}

const fieldVariants = cva('group/field flex w-full', {
  variants: {
    orientation: {
      vertical: 'flex-col',
      horizontal:
        'flex-row items-center gap-2 text-[13.5px] *:data-[slot=field-label]:flex-auto *:data-[slot=field-label]:cursor-pointer',
    },
  },
  defaultVariants: {
    orientation: 'vertical',
  },
})

function Field({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  )
}

/* Wraps the whole field, so a click anywhere in the box lands on the control. */
function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={cn('block', className)} {...props} />
}

function FieldTitle({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="field-title"
      className={cn('flex items-baseline gap-2 text-[11.5px] text-dim', className)}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="field-description"
      className={cn('mt-1.5', NOTE, className)}
      {...props}
    />
  )
}

function FieldError({ className, children, ...props }: React.ComponentProps<'div'>) {
  if (!children) return null

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn('mt-1.5 text-[12.5px] text-destructive', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export {
  CAPTION,
  NOTE,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
}
