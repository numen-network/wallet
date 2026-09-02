import type { FormEvent, ReactNode } from 'react'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

export interface ModalProps {
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
  width?: number
  /** Sits on the right of the title row, for a switch the whole dialog answers to. */
  aside?: ReactNode
  /** The password and what a refused submit has to say, kept with the buttons. */
  footer?: ReactNode
  fee?: ReactNode
  footNote?: ReactNode
  children: ReactNode
}

export function Modal({
  title,
  onClose,
  onSubmit,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  danger = false,
  disabled = false,
  width = 580,
  aside,
  footer,
  fee,
  footNote,
  children,
}: ModalProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (onSubmit?.() === false) return
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 px-[22px] py-5"
        style={{ maxWidth: width }}
        aria-describedby={undefined}
      >
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <div className="flex shrink-0 items-center gap-4">
            <DialogTitle className="text-[17px] leading-normal font-bold tracking-tight">
              {title}
            </DialogTitle>
            {aside && <span className="ml-auto">{aside}</span>}
          </div>

          <div className="mt-3.5 min-h-0 overflow-y-auto pb-5">{children}</div>

          {/* The form scrolls, the foot holds still, so a refusal lands
              beside the button that was pressed */}
          <div className="shrink-0 border-t border-border">
            <div className="mt-3.5 empty:hidden">{footer}</div>

            <div className="mt-3.5 flex items-center gap-2.5">
              <div className="flex-1 text-[11.5px] text-dim">
                {fee}
                {footNote && <p>{footNote}</p>}
              </div>
              {cancelLabel && (
                <DialogClose asChild>
                  <Button type="button" variant="outline">{cancelLabel}</Button>
                </DialogClose>
              )}
              {submitLabel !== null && (
                <Button type="submit" variant={danger ? 'destructive' : 'default'} disabled={disabled}>
                  {submitLabel}
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The box a value sits in. A field draws its own, and anything laid out as a
 * table of values draws one per cell. The padding and the type sizes live here
 * too, so a column of boxes comes out one height without anyone measuring.
 */
export const BOX =
  'rounded-md border border-input bg-muted focus-within:border-primary'

/** What a control wears inside a box, which is nothing of its own. */
export const INSIDE = 'w-full justify-between bg-transparent text-[15px]'

/**
 * Label above the value in one box, with room on the right for whatever the
 * chain says about what is being typed. Reading the two together beats reading
 * a label, then a box, then a line underneath it.
 */
export function Field({
  label,
  aside,
  children,
}: {
  label: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <label className={`mt-2.5 block px-3 py-2 first:mt-0 ${BOX}`}>
      <span className="flex items-baseline gap-2 text-[11.5px] text-dim">
        {label}
        {aside && <span className="ml-auto truncate">{aside}</span>}
      </span>
      {children}
    </label>
  )
}

/** Sets a password apart from the form it locks. */
export function PasswordFields({ children }: { children: ReactNode }) {
  return <div className="mt-5">{children}</div>
}

const INPUT = 'w-full bg-transparent text-[15px] placeholder:text-hint focus:outline-none'

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(INPUT, className)} />
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(INPUT, className)} />
}

export function FieldError({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="mt-1.5 text-[12.5px] text-destructive">{children}</p>
}
