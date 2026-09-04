import * as React from 'react'

import { cn } from '@/lib/cn'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn('w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-hint', className)}
      {...props}
    />
  )
}

export { Textarea }
