import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

/** What a page says where a list would be, when the list has nothing in it. */
export function Empty({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      className={cn(
        'mt-6 rounded-lg border-[1.5px] border-dashed border-input p-12 text-center text-sm text-muted-foreground',
        className,
      )}
    />
  )
}
