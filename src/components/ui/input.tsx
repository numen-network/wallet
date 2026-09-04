import * as React from 'react'

import { cn } from '@/lib/cn'

/*
  Bare on purpose. The box an input sits in is drawn by the field around it,
  the way a select here carries nothing of its own.
*/
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-hint file:mr-2.5 file:rounded-lg file:border file:border-input file:bg-card file:px-2.5 file:py-1 file:text-[13px] file:font-semibold file:text-foreground',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
