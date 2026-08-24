import { useState } from 'react'
import { isSubstrateAddress, shorten, toNumenAddress } from '@/lib/address'
import { Field, FieldError, Input, Modal } from '@/ui/Modal'
import { toast } from '@/ui/Toast'
import { GroupField } from './GroupField'
import { UNGROUPED_ID } from './layout'
import { useAccountsStore } from './store'
import { canSend, type Account } from './types'
import { AddressField } from './AddressField'

/**
 * An account some local key already has a proxy for on chain. Declaring it here
 * only records the pairing, the chain was told when the proxy was granted.
 */
export function ProxiedModal({ accounts, onClose }: { accounts: Account[]; onClose: () => void }) {
  const known = useAccountsStore((s) => s.layout.proxied)
  const addProxied = useAccountsStore((s) => s.addProxied)
  const moveAccount = useAccountsStore((s) => s.moveAccount)

  const signers = accounts.filter(canSend)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [proxy, setProxy] = useState(signers[0]?.address ?? '')
  const [groupId, setGroupId] = useState(UNGROUPED_ID)
  const [error, setError] = useState('')

  const submit = () => {
    const input = address.trim()
    if (!isSubstrateAddress(input)) {
      setError('Enter the Numen address being acted for')
      return false
    }
    if (!proxy) {
      setError('The wallet holds no account that could act as the proxy')
      return false
    }

    const real = toNumenAddress(input)
    if (real === proxy) {
      setError('An account cannot be its own proxy')
      return false
    }
    if (known.some((entry) => entry.address === real)) {
      setError('That account is already in the wallet')
      return false
    }

    addProxied({ address: real, name: name.trim() || 'Proxied', proxy })
    moveAccount(real, groupId, Number.MAX_SAFE_INTEGER)
    toast('Proxied account added')
  }

  return (
    <Modal title="Add proxied account" submitLabel="Add" onClose={onClose} onSubmit={submit}>
      <Field label="Name">
        <Input
          value={name}
          maxLength={40}
          placeholder="Proxied"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <AddressField
          label="Acting for"
          value={address}
          onChange={setAddress}
          accounts={accounts}
        />

      <AddressField
          label="Acting through"
          value={proxy}
          onChange={setProxy}
          accounts={signers}
          readOnly
        />

      <GroupField value={groupId} onChange={setGroupId} />

      <p className="mt-3 text-[12.5px] text-dim">
        The proxy has to have been granted on chain already. Sending through it needs the proxy
        call, which this build does not carry yet, so the account can hold and receive.
      </p>

      <FieldError>{error}</FieldError>
    </Modal>
  )
}
