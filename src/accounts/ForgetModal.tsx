import { useState } from 'react'
import { verifyPassword } from '@/signing/vault'
import { FieldError, Modal } from '@/ui/Modal'
import { ConfirmModal } from '@/ui/PromptModal'
import { toast } from '@/ui/Toast'
import { AccountPassword } from './Authorize'
import { useAccountsStore } from './store'
import type { Account } from './types'

/**
 * A watched or injected account is only hidden, so losing it costs a row on the
 * board. A local account has nowhere else to live, which is why that one asks
 * for the password before it goes.
 */
export function ForgetModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const forgetAccount = useAccountsStore((s) => s.forgetAccount)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const forget = () => {
    forgetAccount(account.address)
    toast('Account forgotten')
  }

  if (account.source !== 'keystore') {
    return (
      <ConfirmModal title="Forget this account" submitLabel="Forget" onClose={onClose} onConfirm={forget}>
        {`This removes ${account.name} from the wallet view. Funds on chain are not affected.`}
      </ConfirmModal>
    )
  }

  const submit = () => {
    setError('')

    try {
      verifyPassword(account.address, password)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That account could not be read')
      return false
    }

    forget()
  }

  return (
    <Modal title="Forget this account" submitLabel="Forget" danger onClose={onClose} onSubmit={submit}>
      <p className="text-[13.5px] text-lead">
        This browser holds the only copy of {account.name}. Without the seed or a
        backup file, the funds go with it.
      </p>

      <AccountPassword value={password} onChange={setPassword} />

      <FieldError>{error}</FieldError>
    </Modal>
  )
}
