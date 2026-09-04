import * as React from 'react'
import { LoaderCircle } from 'lucide-react'

import { cn } from '@/lib/cn'

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <LoaderCircle
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn('animate-spin', className)}
      {...props}
    />
  )
}

export { Spinner }
