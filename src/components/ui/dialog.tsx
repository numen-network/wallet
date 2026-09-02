import * as React from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'

import { cn } from '@/lib/cn'
import { IconButton } from '@/ui/Button'
import { CrossIcon } from '@/ui/icons'

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 isolate z-90 grid place-items-center bg-overlay p-5 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        className,
      )}
      {...props}
    />
  )
}

/*
  The content sits inside the overlay rather than beside it. The overlay row
  centres it and grows with it, so the viewport is the cap, less the padding
  the overlay keeps around the dialog.
*/
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay>
        <DialogPrimitive.Content
          data-slot="dialog-content"
          className={cn(
            'relative flex max-h-[calc(100dvh-40px)] w-full flex-col gap-4 rounded-lg border border-border bg-card p-4 text-sm text-card-foreground shadow-lift duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 sm:max-w-sm',
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close data-slot="dialog-close" asChild>
              <IconButton type="button" className="absolute top-2 right-2">
                <CrossIcon />
                <span className="sr-only">Close</span>
              </IconButton>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogOverlay>
    </DialogPortal>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-base leading-none font-medium', className)}
      {...props}
    />
  )
}

export { Dialog, DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger }
