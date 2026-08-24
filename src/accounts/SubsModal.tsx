import { useState } from 'react'
import { byteLength, FIELD_MAX_BYTES, type Sub } from '@/chain/identity'
import { useFacts, useStanding, useSubs, useSymbol } from '@/chain/queries'
import { isSubstrateAddress, shorten, toNumenAddress } from '@/lib/address'
import { formatAmount } from '@/lib/balance'
import { VaultError } from '@/signing/vault'
import { Button, IconButton } from '@/ui/Button'
import { TrashIcon } from '@/ui/icons'
import { Field, FieldError, Input, Modal } from '@/ui/Modal'
import { toast, toastProblem } from '@/ui/Toast'
import { AccountPassword, FeeLine, SignerField, useSigning } from './Authorize'
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
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
      setError('Enter a Numen address')
      return
    }
    const numen = toNumenAddress(trimmed)
    if (subs.some((sub) => sub.address === numen)) {
      setError('That account is already on the list')
      return
    }
    if (byteLength(name.trim()) > FIELD_MAX_BYTES) {
      setError(`A name is at most ${FIELD_MAX_BYTES} bytes`)
      return
    }

    setError('')
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
      setError('This account has no identity of its own for a sub to hang off')
      return false
    }
    void send()
    return false
  }

  const send = async () => {
    setBusy(true)
    try {
      await submit(operation, password)
      toast('Sent')
      onClose()
    } catch (problem) {
      if (problem instanceof VaultError) setError(problem.message)
      else setError(problem instanceof Error ? problem.message : 'The chain refused it')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Sub accounts"
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      footNote={
        holding !== null &&
        `${formatAmount(holding, { precision: 2 })} ${symbol} held while the list stands`
      }
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-lead">
        Each of these reads as this account's name over its own, and passes the identity standard
        on this account's record. The whole list goes up in one call, so nothing changes until it
        is signed.
      </p>

      {!standing?.own && (
        <p className="mt-2.5 text-[12.5px] text-bad">
          This account has no identity of its own yet, and a sub has nothing to hang off without
          one.
        </p>
      )}

      {subs.length > 0 && (
        <div className="mt-3.5 grid gap-1.5">
          {subs.map((sub) => (
            <div
              key={sub.address}
              className="flex items-center gap-2 rounded-[4px] border border-line bg-recess px-2.5 py-1.5"
            >
              <span className="text-[13px] font-semibold">{sub.name || 'unnamed'}</span>
              <span className="font-mono text-[12.5px] text-lead">{shorten(sub.address)}</span>
              <span className="flex-1" />
              <IconButton
                type="button"
                aria-label={`Remove ${sub.name || sub.address}`}
                onClick={() => setEdited(subs.filter((entry) => entry.address !== sub.address))}
              >
                <TrashIcon />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      <AddressField label="Add an account" value={address} onChange={setAddress} accounts={others} />

      <Field label="Called">
        <Input
          value={name}
          maxLength={FIELD_MAX_BYTES}
          placeholder="Payouts"
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <Button type="button" className="mt-2.5" onClick={add}>
        Add to the list
      </Button>

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />

      {needsPassword && (
        <AccountPassword
          value={password}
          note="Unlocks this account for one signature"
          onChange={setPassword}
        />
      )}
      <FieldError>{error}</FieldError>

      <FeeLine from={signer.address} operation={wrap(operation)} />
    </Modal>
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
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const operation = wrap({ kind: 'quitSub' })
  const parent = standing?.sub
  const named = parent?.registration?.info.display

  const form = () => {
    setError('')
    void send()
    return false
  }

  const send = async () => {
    setBusy(true)
    try {
      await submit(operation, password)
      toast('Sent')
      onClose()
    } catch (problem) {
      if (problem instanceof VaultError) setError(problem.message)
      else setError(problem instanceof Error ? problem.message : 'The chain kept the link')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Reject the parent identity"
      submitLabel={busy ? 'Signing…' : 'Reject it'}
      danger
      disabled={busy}
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-lead">
        <em>{account.name}</em> rejects <em>{named || shorten(parent?.parent ?? '')}</em>'s
        identity and takes their {facts && formatAmount(facts.subAccountDeposit, { precision: 2 })}{' '}
        {symbol} deposit as the penalty for it.
      </p>

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />

      {needsPassword && (
        <AccountPassword
          value={password}
          note="Unlocks this account for one signature"
          onChange={setPassword}
        />
      )}
      <FieldError>{error}</FieldError>

      <FeeLine from={signer.address} operation={operation} />
    </Modal>
  )
}
