import { useState } from 'react'
import { byteLength, SUB_NAME_MAX_BYTES, type Sub } from '@/chain/identity'
import { useFacts, useStanding, useSubs, useSymbol } from '@/chain/queries'
import { isSubstrateAddress, shorten, toNumenAddress } from '@/lib/address'
import { formatAmount } from '@/lib/balance'
import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Plus, Trash2 } from 'lucide-react'
import { LEDE } from '@/ui/Modal'
import { Field } from '@/ui/Field'
import { Input } from '@/components/ui/input'
import { toastProblem } from '@/ui/Toast'
import { CallModal, SignerField, useCall, useSigning } from './Authorize'
import type { Account } from './types'
import { AddressField } from './AddressField'

/**
 * Accounts hanging off this one. pallet_identity takes the whole list in one
 * call, so adding, renaming and removing are the same edit to the same list
 * and nothing is written until the list is saved.
 *
 * Each sub costs the parent a deposit, which is why the total moves as rows
 * come and go rather than only once the chain has agreed.
 */
export function SubsModal({
  account,
  accounts,
  signers,
  onClose,
}: {
  account: Account
  accounts: Account[]
  signers: Account[]
  onClose: () => void
}) {
  const symbol = useSymbol()
  const { data: held } = useSubs(account.address)
  const { data: standing } = useStanding(account.address)
  const [edited, setEdited] = useState<Sub[] | null>(null)
  const [address, setAddress] = useState('')
  const [name, setName] = useState('')
  const call = useCall(onClose)

  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const { data: facts } = useFacts()
  const subs = edited ?? held?.list ?? []
  // One deposit per sub, so what the list costs follows what is in it, and an
  // empty list has nothing held to work the price out from
  const holding = facts ? facts.subAccountDeposit * BigInt(subs.length) : null
  const operation = { kind: 'setSubs', subs } as const
  // Neither the parent nor anything already on the list is worth offering, and
  // the chain refuses both anyway
  const others = accounts.filter(
    (entry) =>
      entry.address !== account.address && !subs.some((sub) => sub.address === entry.address),
  )

  const add = () => {
    const trimmed = address.trim()
    if (!isSubstrateAddress(trimmed)) {
      call.setError('Enter a Numen address')
      return
    }
    const numen = toNumenAddress(trimmed)
    if (subs.some((sub) => sub.address === numen)) {
      call.setError('That account is already on the list')
      return
    }
    if (byteLength(name.trim()) > SUB_NAME_MAX_BYTES) {
      call.setError(`A name is at most ${SUB_NAME_MAX_BYTES} bytes`)
      return
    }

    call.setError('')
    setEdited([...subs, { address: numen, name: name.trim() }])
    setAddress('')
    setName('')
  }

  const form = () => {
    // A filled in box is not the list, and signing over it would drop whatever
    // is in it without a word
    if (address.trim() !== '' || name.trim() !== '') {
      toastProblem('Add the account to the list before signing')
      return false
    }
    if (!standing?.own) {
      call.setError('This account has no identity of its own for a sub to hang off')
      return false
    }

    return call.run(submit(operation, call.password))
  }

  return (
    <CallModal
      title="Sub accounts"
      submitLabel="Sign and send"
      busy={call.busy}
      footNote={
        holding !== null &&
        `${formatAmount(holding, { precision: 2 })} ${symbol} held while the list stands`
      }
      from={signer.address}
      needsPassword={needsPassword}
      operation={wrap(operation)}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      <p className={LEDE}>
        Each of these reads as this account's name over its own, and passes the identity standard
        on this account's record. The whole list goes up in one call, so nothing changes until it
        is signed.
      </p>

      {!standing?.own && (
        <p className="mt-2.5 text-[12.5px] text-destructive">
          This account has no identity of its own yet, and a sub has nothing to hang off without
          one.
        </p>
      )}

      {subs.length > 0 && (
        <ItemGroup className="mt-3.5">
          {subs.map((sub) => (
            <Item key={sub.address} variant="muted">
              <ItemTitle>{sub.name || 'unnamed'}</ItemTitle>
              <ItemDescription className="font-mono text-[12.5px]">{shorten(sub.address)}</ItemDescription>
              <ItemActions className="ml-auto">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${sub.name || sub.address}`}
                  onClick={() => setEdited(subs.filter((entry) => entry.address !== sub.address))}
                >
                  <Trash2 />
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}

      <AddressField label="Add an account" value={address} onChange={setAddress} accounts={others} />

      <Field label="Called">
        <Input
          value={name}
          maxLength={SUB_NAME_MAX_BYTES}
          placeholder="Payouts"
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <Button type="button" variant="outline" className="mt-2.5" onClick={add}>
        <Plus />
        Add
      </Button>

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />
    </CallModal>
  )
}

/**
 * The other side of the list, signed by the sub rather than by the parent. The
 * pallet keeps it for the account nobody asked before naming it a sub, so the
 * parent neither agrees to it nor gets its deposit back.
 */
export function QuitSubModal({
  account,
  signers,
  onClose,
}: {
  account: Account
  /** Whoever here can sign for it, which a multisig or a proxied account needs. */
  signers: Account[]
  onClose: () => void
}) {
  const symbol = useSymbol()
  const { data: facts } = useFacts()
  const { data: standing } = useStanding(account.address)
  const call = useCall(onClose)

  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const operation = wrap({ kind: 'quitSub' })
  const parent = standing?.sub
  const named = parent?.registration?.info.display

  const form = () => call.run(submit(operation, call.password))

  return (
    <CallModal
      title="Reject the parent identity"
      submitLabel="Reject it"
      busy={call.busy}
      danger
      from={signer.address}
      needsPassword={needsPassword}
      operation={operation}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      <p className={LEDE}>
        <em>{account.name}</em> rejects <em>{named || shorten(parent?.parent ?? '')}</em>'s
        identity and takes their {facts && formatAmount(facts.subAccountDeposit, { precision: 2 })}{' '}
        {symbol} deposit as the penalty for it.
      </p>

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />
    </CallModal>
  )
}
