import { useState } from 'react'
import { exportKey } from '@/signing/vault'
import { downloadJson } from '@/ui/download'
import { FieldError, Modal } from '@/ui/Modal'
import { toast } from '@/ui/Toast'
import { AccountPassword } from './Authorize'
import type { Account } from './types'

/** The keystore file as it sits in this browser, for whoever can open it. */
export function BackupModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    setError('')

    try {
      downloadJson(`${account.address}.json`, exportKey(account.address, password))
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That account could not be read')
      return false
    }

    toast('Backup file saved')
  }

  return (
    <Modal
      title="Create a backup file"
      submitLabel="Save file"
      onClose={onClose}
      onSubmit={submit}
    >
      <p className="text-[13.5px] text-lead">
        The file carries this account under the same password, so it restores {account.name} into any
        wallet that reads the polkadot-js format.
      </p>

      <AccountPassword value={password} onChange={setPassword} />

      <FieldError>{error}</FieldError>
    </Modal>
  )
}
