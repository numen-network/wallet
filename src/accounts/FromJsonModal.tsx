import { useState } from 'react'
import { Modal } from '@/ui/Modal'
import { Field } from '@/ui/Field'
import { FieldError, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
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
      busy={busy}
      onClose={onClose}
      onSubmit={() => {
        setError('')
        void add()
        return false
      }}
    >
      <Field label="Keystore file">
        <Input
          type="file"
          accept="application/json,.json"
          className="text-[13px] text-muted-foreground"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </Field>

      <FieldSet className="mt-5">
        <Field label="File password">
          <Input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
      </FieldSet>

      <GroupField value={groupId} onChange={setGroupId} />
      <FieldError>{error}</FieldError>
    </Modal>
  )
}
