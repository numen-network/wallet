import * as React from 'react'

import { cn } from '@/lib/cn'

function Card({ className, ...props }: React.ComponentProps<'article'>) {
  return (
    <article
      data-slot="card"
      className={cn(
        'rounded-lg border border-border bg-card p-3.5 text-card-foreground shadow-card',
        className,
      )}
      {...props}
    />
  )
}

export { Card }
