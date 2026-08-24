import { useState } from 'react'
import { Field, Input, Modal } from './Modal'

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
  onConfirm: () => void
  onClose: () => void
  children: React.ReactNode
}

export function ConfirmModal({
  title,
  submitLabel,
  onConfirm,
  onClose,
  children,
}: ConfirmModalProps) {
  return (
    <Modal title={title} submitLabel={submitLabel} danger onClose={onClose} onSubmit={onConfirm}>
      <p className="text-[13.5px] text-lead">{children}</p>
    </Modal>
  )
}
