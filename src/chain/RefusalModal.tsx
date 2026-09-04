import { create } from 'zustand'
import { CROSS, MarkDisc } from '@/ui/JudgementBadge'
import { Modal } from '@/ui/Modal'
import { Field } from '@/ui/Field'
import { FieldTitle } from '@/components/ui/field'

/**
 * The one refusal on screen. A call can be turned down after the dialog that
 * sent it has closed, so the reason needs somewhere of its own to live.
 */
export interface Refusal {
  message: string
  /** What the chain said, kept whole, since a trimmed reason is no longer it. */
  detail: string
}

interface RefusalState {
  refusal: Refusal | null
  raise: (refusal: Refusal) => void
  clear: () => void
}

export const useRefusalStore = create<RefusalState>((set) => ({
  refusal: null,
  raise: (refusal) => set({ refusal }),
  clear: () => set({ refusal: null }),
}))

/** What the chain said, in the wallet's words and in its own. */
export function RefusalModal() {
  const refusal = useRefusalStore((state) => state.refusal)
  const clear = useRefusalStore((state) => state.clear)
  if (!refusal) return null

  return (
    <Modal
      title="The chain refused this"
      submitLabel={null}
      cancelLabel="Close"
      width={480}
      onClose={clear}
    >
      <p className="flex items-center gap-2 text-[14px] text-foreground">
        <MarkDisc className="size-4" fill="var(--color-destructive)" mark={CROSS} />
        {refusal.message}
      </p>

      <Field className="mt-3">
        <FieldTitle>Raw error</FieldTitle>
        <pre className="mt-1 font-mono text-[12.5px] break-all whitespace-pre-wrap text-muted-foreground">
          {refusal.detail}
        </pre>
      </Field>
    </Modal>
  )
}
