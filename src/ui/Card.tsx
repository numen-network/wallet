import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

/** One thing the page lists, on its own panel. */
export function Card({ className, ...props }: ComponentProps<'article'>) {
  return (
    <article
      {...props}
      className={cn('rounded-lg border border-border bg-card p-3.5 shadow-card', className)}
    />
  )
}
