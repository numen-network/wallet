import { useState } from 'react'
import { Field, FieldError, Input, Modal } from '@/ui/Modal'
import { toast } from '@/ui/Toast'
import { GroupField } from './GroupField'
import { UNGROUPED_ID } from './layout'
import { useAccountsStore } from './store'
import type { Account } from './types'

/**
 * A child of this key, at a path the user picks. The path is part of the account,
 * so restoring it anywhere means the parent phrase plus that same path written
 * down beside it.
 */
export function DeriveModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const deriveKey = useAccountsStore((s) => s.deriveKey)
  const moveAccount = useAccountsStore((s) => s.moveAccount)

  const [path, setPath] = useState('//0')
  const [name, setName] = useState('')
  const [parentPassword, setParentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [groupId, setGroupId] = useState(UNGROUPED_ID)
  const [error, setError] = useState('')

  const submit = () => {
    setError('')

    if (!password) {
      setError('Set a password. An empty one stores the key unencrypted')
      return false
    }
    if (password !== repeat) {
      setError('The two passwords do not match')
      return false
    }

    try {
      const derived = deriveKey(
        account.address,
        parentPassword,
        path,
        name.trim() || `${account.name}${path.trim()}`,
        password,
      )
      moveAccount(derived, groupId, Number.MAX_SAFE_INTEGER)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That path could not be derived')
      return false
    }

    toast('Account derived')
  }

  return (
    <Modal title="Derive an account" submitLabel="Derive" onClose={onClose} onSubmit={submit}>
      <p className="text-[13.5px] text-lead">
        The new account comes out of {account.name} and the path below. Both are needed to restore
        it, so keep the path with the seed.
      </p>

      <Field label="Derivation path">
        <Input
          className="font-mono"
          value={path}
          placeholder="//0"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setPath(event.target.value)}
        />
      </Field>

      <Field label="Name">
        <Input
          value={name}
          maxLength={40}
          placeholder={`${account.name}${path.trim()}`}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <Field label={`Password for ${account.name}`}>
        <Input
          type="password"
          value={parentPassword}
          autoComplete="current-password"
          onChange={(event) => setParentPassword(event.target.value)}
        />
      </Field>

      <Field label="New account password">
        <Input
          type="password"
          value={password}
          autoComplete="new-password"
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <Field label="Repeat">
        <Input
          type="password"
          value={repeat}
          autoComplete="new-password"
          onChange={(event) => setRepeat(event.target.value)}
        />
      </Field>

      <GroupField value={groupId} onChange={setGroupId} />
      <FieldError>{error}</FieldError>
    </Modal>
  )
}
