import { useState } from 'react'
import { verifyPassword } from '@/signing/vault'
import { Modal } from '@/ui/Modal'
import { FieldError } from '@/components/ui/field'
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
  const local = account.source === 'keystore'

  const forget = () => {
    if (local) {
      setError('')
      try {
        verifyPassword(account.address, password)
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : 'That account could not be read')
        return false
      }
    }

    forgetAccount(account.address)
    toast('Account forgotten')
  }

  return (
    <Modal
      title="Forget this account"
      submitLabel="Forget"
      danger
      footer={
        local && (
          <>
            <AccountPassword value={password} onChange={setPassword} />
            <FieldError>{error}</FieldError>
          </>
        )
      }
      onClose={onClose}
      onSubmit={forget}
    >
      <p className="text-[13.5px] text-muted-foreground">
        {local
          ? `This browser holds the only copy of ${account.name}. Without the seed or a backup file, the funds go with it.`
          : `This removes ${account.name} from the wallet view. Funds on chain are not affected.`}
      </p>
    </Modal>
  )
}
