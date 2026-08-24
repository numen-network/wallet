import { useState } from 'react'
import { changePassword } from '@/signing/vault'
import { Field, FieldError, Input, Modal } from '@/ui/Modal'
import { toast } from '@/ui/Toast'
import type { Account } from './types'

/**
 * The key is re-encrypted in place, so the account, its address and its phrase
 * all stay what they were. Only the password that opens the file changes.
 */
export function PasswordModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    setError('')

    if (!next) {
      setError('Set a password. An empty one stores the account unencrypted')
      return false
    }
    if (next !== repeat) {
      setError('The two new passwords do not match')
      return false
    }

    try {
      changePassword(account.address, current, next)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That password could not be changed')
      return false
    }

    toast('Password changed')
  }

  return (
    <Modal title="Change password" submitLabel="Change" onClose={onClose} onSubmit={submit}>
      <Field label="Current password">
        <Input
          type="password"
          value={current}
          autoComplete="current-password"
          onChange={(event) => setCurrent(event.target.value)}
        />
      </Field>
      <Field label="New password">
        <Input
          type="password"
          value={next}
          autoComplete="new-password"
          onChange={(event) => setNext(event.target.value)}
        />
      </Field>
      <Field label="Repeat new password">
        <Input
          type="password"
          value={repeat}
          autoComplete="new-password"
          onChange={(event) => setRepeat(event.target.value)}
        />
      </Field>

      <FieldError>{error}</FieldError>
    </Modal>
  )
}
