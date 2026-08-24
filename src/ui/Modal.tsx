import * as Dialog from '@radix-ui/react-dialog'
import type { FormEvent, ReactNode } from 'react'
import { Button } from './Button'

interface ModalProps {
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
  footNote,
  children,
}: ModalProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (onSubmit?.() === false) return
    onClose()
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-90 grid place-items-center bg-overlay p-5">
          <Dialog.Content
            // The overlay row grows with its content, so the cap is the viewport
            // itself, less the padding the overlay keeps around the dialog
            // The bottom padding belongs to the scrolling part rather than to
            // the dialog. Outside it, it is a strip below the scroll box that
            // the last row can never reach, and the buttons end up against the
            // edge with a hair of themselves cut off
            className="flex max-h-[calc(100dvh-40px)] w-full flex-col rounded-[6px] border border-line bg-panel px-[22px] pt-5 shadow-lift"
            style={{ maxWidth: width }}
            aria-describedby={undefined}
          >
            {/* One scrolling column under the title. The password, the fee and
                the button are as much a part of the form as the fields are, and
                splitting them off left half the reasons a submit did nothing
                somewhere the person pressing it could not see */}
            <form onSubmit={submit} className="flex min-h-0 flex-col">
              <div className="flex shrink-0 items-center gap-4">
                <Dialog.Title className="text-[17px] font-bold tracking-tight">{title}</Dialog.Title>
                {aside && <span className="ml-auto">{aside}</span>}
              </div>

              <div className="mt-3.5 min-h-0 overflow-y-auto pb-5">
                {children}

                <div className="mt-[18px] flex items-center gap-2.5">
                  {footNote ? (
                    <span className="flex-1 text-[11.5px] text-dim">{footNote}</span>
                  ) : (
                    <span className="flex-1" />
                  )}
                  {cancelLabel && (
                    <Dialog.Close asChild>
                      <Button type="button">{cancelLabel}</Button>
                    </Dialog.Close>
                  )}
                  {submitLabel !== null && (
                    <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={disabled}>
                      {submitLabel}
                    </Button>
                  )}
                </div>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/**
 * The box a value sits in. A field draws its own, and anything laid out as a
 * table of values draws one per cell. The padding and the type sizes live here
 * too, so a column of boxes comes out one height without anyone measuring.
 */
export const BOX =
  'rounded-[4px] border border-line-strong bg-recess focus-within:border-accent'

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

const INPUT = 'w-full bg-transparent text-[15px] placeholder:text-hint focus:outline-none'

export function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${INPUT} ${className}`} />
}

export function Textarea({
  className = '',
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${INPUT} ${className}`} />
}

export function FieldError({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="mt-1.5 text-[12.5px] text-bad">{children}</p>
}
