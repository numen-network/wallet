import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/cn'

const cardVariants = cva('group/card flex flex-col rounded-lg border border-border', {
  variants: {
    variant: {
      default: 'bg-card text-card-foreground shadow-card',
      muted: 'bg-muted',
    },
    size: {
      default: 'gap-2 p-3.5',
      sm: 'gap-1 px-2.5 py-2',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
})

/* A card of its own stands alone on the page, so it is an article. A muted one is a box inside something else. */
function Card({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof cardVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : variant === 'muted' ? 'div' : 'article'

  return (
    <Comp
      data-slot="card"
      data-variant={variant}
      data-size={size}
      className={cn(cardVariants({ variant, size, className }))}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-wrap items-center gap-2', className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('text-[13px] font-semibold group-data-[size=sm]/card:text-[12.5px]', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-[12.5px] text-dim group-data-[size=sm]/card:text-[11.5px]', className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-action" className={cn('ml-auto', className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('text-[13.5px]', className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex flex-wrap gap-2 pt-1', className)}
      {...props}
    />
  )
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
