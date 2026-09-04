import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/cn'
import { Separator } from '@/components/ui/separator'

const itemGroupVariants = cva('group/item-group flex w-full flex-col', {
  variants: {
    variant: {
      default: 'gap-1.5',
      outline: 'rounded-lg border border-border',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

function ItemGroup({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof itemGroupVariants>) {
  return (
    <div
      role="list"
      data-slot="item-group"
      data-variant={variant}
      className={cn(itemGroupVariants({ variant, className }))}
      {...props}
    />
  )
}

function ItemSeparator({ ...props }: React.ComponentProps<typeof Separator>) {
  return <Separator data-slot="item-separator" orientation="horizontal" {...props} />
}

const itemVariants = cva('group/item flex w-full items-center gap-2 px-2.5 py-1.5', {
  variants: {
    variant: {
      default: '',
      muted: 'rounded-md border border-border bg-muted',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

function Item({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof itemVariants>) {
  return (
    <div
      role="listitem"
      data-slot="item"
      data-variant={variant}
      className={cn(itemVariants({ variant, className }))}
      {...props}
    />
  )
}

function ItemMedia({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-media"
      className={cn('flex shrink-0 items-center justify-center', className)}
      {...props}
    />
  )
}

function ItemContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="item-content" className={cn('flex min-w-0 flex-1 flex-col', className)} {...props} />
  )
}

function ItemTitle({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span data-slot="item-title" className={cn('truncate text-[13px] font-semibold', className)} {...props} />
  )
}

function ItemDescription({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="item-description"
      className={cn('truncate text-[11.5px] text-muted-foreground', className)}
      {...props}
    />
  )
}

function ItemActions({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="item-actions" className={cn('flex items-center gap-2', className)} {...props} />
}

export {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
}
