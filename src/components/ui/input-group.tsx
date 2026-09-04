import * as React from 'react'

import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function InputGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="group"
      data-slot="input-group"
      className={cn('flex w-full min-w-0 items-center gap-[7px]', className)}
      {...props}
    />
  )
}

function InputGroupAddon({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      className={cn('flex shrink-0 items-center gap-[7px]', className)}
      {...props}
    />
  )
}

function InputGroupButton({ type = 'button', ...props }: React.ComponentProps<typeof Button>) {
  return <Button type={type} variant="soft" size="xs" {...props} />
}

function InputGroupText({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span className={cn('text-[11.5px] font-bold tracking-wide text-dim', className)} {...props} />
  )
}

function InputGroupInput({ className, ...props }: React.ComponentProps<'input'>) {
  return <Input data-slot="input-group-control" className={cn('flex-1', className)} {...props} />
}

export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText }
