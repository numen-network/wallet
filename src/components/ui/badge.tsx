import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/cn'

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border px-[7px] py-0.5 text-[10px] font-bold tracking-[0.06em] whitespace-nowrap uppercase [&>svg]:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'border-input text-dim',
        muted: 'border-input text-muted-foreground',
        primary: 'border-primary text-primary',
        destructive: 'border-destructive text-destructive',
        warn: 'border-warn-deep text-warn-deep',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants, type BadgeVariant }
