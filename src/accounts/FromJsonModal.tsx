import { useState } from 'react'
import { Field, FieldError, Input, Modal } from '@/ui/Modal'
import { toast } from '@/ui/Toast'
import { GroupField } from './GroupField'
import { UNGROUPED_ID } from './layout'
import { useAccountsStore } from './store'

/** A keystore file from this wallet, from polkadot-js apps or from the extension. */
export function FromJsonModal({ onClose }: { onClose: () => void }) {
  const importJson = useAccountsStore((s) => s.importJson)
  const moveAccount = useAccountsStore((s) => s.moveAccount)

  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [groupId, setGroupId] = useState(UNGROUPED_ID)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!file) return setError('Choose a keystore file')
    if (!password) return setError('Enter the password for this file')

    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      return setError(`${file.name} is not a JSON file`)
    }

    setBusy(true)
    try {
      const address = importJson(parsed, password)
      moveAccount(address, groupId, Number.MAX_SAFE_INTEGER)
      toast('Account imported')
      onClose()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That account could not be read')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Import from JSON"
      submitLabel="Import"
      disabled={busy}
      onClose={onClose}
      onSubmit={() => {
        setError('')
        void add()
        return false
      }}
    >
      <Field label="Keystore file">
        <input
          type="file"
          accept="application/json,.json"
          className="w-full text-[13px] text-lead file:mr-2.5 file:rounded-[6px] file:border file:border-line-strong file:bg-panel file:px-2.5 file:py-1 file:text-[13px] file:font-semibold file:text-ink"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </Field>

      <Field label="File password">
        <Input
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <GroupField value={groupId} onChange={setGroupId} />
      <FieldError>{error}</FieldError>
    </Modal>
  )
}
