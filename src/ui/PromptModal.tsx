import { useState } from 'react'
import { Modal } from './Modal'
import { LEDE } from '@/ui/Modal'
import { Field } from '@/ui/Field'
import { Input } from '@/components/ui/input'

interface PromptModalProps {
  title: string
  label: string
  initial?: string
  submitLabel: string
  onSubmit: (value: string) => void
  onClose: () => void
}

export function PromptModal({
  title,
  label,
  initial = '',
  submitLabel,
  onSubmit,
  onClose,
}: PromptModalProps) {
  const [value, setValue] = useState(initial)
  const trimmed = value.trim()

  return (
    <Modal
      title={title}
      submitLabel={submitLabel}
      onClose={onClose}
      onSubmit={() => {
        if (!trimmed) return false
        onSubmit(trimmed)
      }}
    >
      <Field label={label}>
        <Input
          value={value}
          maxLength={40}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
        />
      </Field>
    </Modal>
  )
}

interface ConfirmModalProps {
  title: string
  submitLabel: string
  /** Return false to keep the modal open, the same way a form does. */
  onConfirm: () => boolean | void
  onClose: () => void
  children: React.ReactNode
}

/** A yes or no, with nothing to type. */
export function ConfirmModal({
  title,
  submitLabel,
  onConfirm,
  onClose,
  children,
}: ConfirmModalProps) {
  return (
    <Modal title={title} submitLabel={submitLabel} danger onClose={onClose} onSubmit={onConfirm}>
      <p className={LEDE}>{children}</p>
    </Modal>
  )
}
