import type { FormEvent, ReactNode } from 'react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

/** The paragraph a dialog opens with, saying what the form under it is for. */
export const LEDE = 'text-[13.5px] text-muted-foreground'

export interface ModalPageProps {
  title: string
  onClose: () => void
  /** Return false to keep the modal open, which is how validation reports back. */
  onSubmit?: () => boolean | void
  /** Null for a dialog whose actions are in the body, so there is nothing to save. */
  submitLabel?: string | null
  cancelLabel?: string | null
  danger?: boolean
  /** Whatever the caller is waiting on before the form may be submitted. */
  disabled?: boolean
  /** A submit already on its way, which holds the button until it lands. */
  busy?: boolean
  /** Sits on the right of the title row, for a switch the whole dialog answers to. */
  aside?: ReactNode
  /** The password and what a refused submit has to say, kept with the buttons. */
  footer?: ReactNode
  fee?: ReactNode
  footNote?: ReactNode
  children: ReactNode
}

export interface ModalProps extends ModalPageProps {
  width?: number
}

/**
 * The shell a dialog opens in. A tabbed dialog keeps one up and swaps pages
 * inside it, so a tab switch never opens a second dialog.
 */
export function ModalFrame({
  width = 580,
  onClose,
  children,
}: {
  width?: number | undefined
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 px-[22px] py-5 max-[560px]:px-4"
        style={{ maxWidth: width }}
        aria-describedby={undefined}
      >
        {children}
      </DialogContent>
    </Dialog>
  )
}

export function ModalPage({
  title,
  onClose,
  onSubmit,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  danger = false,
  disabled = false,
  busy = false,
  aside,
  footer,
  fee,
  footNote,
  children,
}: ModalPageProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (onSubmit?.() === false) return
    onClose()
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle className="text-[17px] leading-normal font-bold tracking-tight">
          {title}
        </DialogTitle>
        {aside && <span className="ml-auto">{aside}</span>}
      </DialogHeader>

      <div className="mt-3.5 min-h-0 overflow-y-auto pb-5">{children}</div>

      <DialogFooter>
        <div className="mt-3.5 empty:hidden">{footer}</div>

        <div className="mt-3.5 flex items-center gap-2.5 max-[560px]:flex-wrap">
          <div className="flex-1 text-[11.5px] text-dim max-[560px]:basis-full max-[560px]:empty:hidden">
            {fee}
            {footNote && <p>{footNote}</p>}
          </div>
          {cancelLabel && (
            <DialogClose asChild>
              <Button type="button" variant="outline" className="max-[560px]:flex-1">
                {cancelLabel}
              </Button>
            </DialogClose>
          )}
          {submitLabel !== null && (
            <Button
              type="submit"
              variant={danger ? 'destructive' : 'default'}
              disabled={disabled || busy}
              className="max-[560px]:flex-1"
            >
              {busy && <Spinner />}
              {submitLabel}
            </Button>
          )}
        </div>
      </DialogFooter>
    </form>
  )
}

export function Modal({ width, ...page }: ModalProps) {
  return (
    <ModalFrame width={width} onClose={page.onClose}>
      <ModalPage {...page} />
    </ModalFrame>
  )
}
