import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/cn'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-[7px] rounded-md border border-transparent bg-clip-padding text-[13.5px] leading-tight font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:not-disabled:bg-primary-hover',
        outline: 'border-input bg-card hover:not-disabled:bg-accent',
        ghost:
          'text-muted-foreground hover:not-disabled:bg-accent hover:not-disabled:text-foreground',
        destructive: 'bg-destructive text-destructive-foreground',
      },
      size: {
        default: 'px-3.5 py-[7px]',
        sm: 'px-2.5 py-1 text-[12.5px]',
        icon: 'size-7 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
