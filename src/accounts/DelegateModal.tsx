import { AddressField } from './AddressField'
import { useState } from 'react'
import { waitFor } from '@/lib/blocks'
import { useFacts, useSymbol, useTracks } from '@/chain/queries'
import type { ChainFacts } from '@/chain/types'
import { batched, CONVICTIONS, totalOf, type AccountBalance, type Conviction } from '@/chain/types'
import { resolveAddress } from '@/lib/address'
import { amountInput, AmountError, formatAmount, parseAmount } from '@/lib/balance'
import { VaultError } from '@/signing/vault'
import { Field, FieldError, Input, Modal, INSIDE } from '@/ui/Modal'
import { Select } from '@/ui/Select'
import { toast } from '@/ui/Toast'
import { AccountPassword, FeeLine, SignerField, useSigning } from './Authorize'
import type { Account } from './types'

interface DelegateProps {
  account: Account
  /** Everything the wallet holds, since a delegate can be one of them. */
  accounts: Account[]
  signers: Account[]
  balance: AccountBalance | undefined
  onClose: () => void
}


/**
 * How long each conviction holds the vote for. The lock is a runtime constant,
 * so the labels cannot be written out until the chain has answered.
 */
const convictionOptions = (facts: ChainFacts | undefined) =>
  CONVICTIONS.map((conviction) => ({
    value: conviction.value,
    label: conviction.periods
      ? `${conviction.weight}, locked ${
          facts
            ? waitFor(conviction.periods * facts.voteLockingPeriod, facts.blockSeconds)
            : 'while it stands'
        }`
      : `${conviction.weight}, no lock`,
  }))

/**
 * The tracks come from the chain, so the list is whatever this runtime carries.
 * Delegating is per track, and delegating the same way on all of them is one
 * signature rather than one a track.
 */
export function TrackField({
  chosen,
  onChange,
}: {
  chosen: number[]
  onChange: (tracks: number[]) => void
}) {
  const { data: tracks } = useTracks()
  const { data: facts } = useFacts()

  return (
    <fieldset className="mt-3.5">
      <legend className="mb-1.5 block text-[11px] font-bold tracking-[0.07em] text-lead uppercase">
        Tracks
      </legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {(tracks ?? []).map((track) => (
          <label key={track.id} className="flex cursor-pointer items-center gap-1.5 text-[13.5px]">
            <input
              type="checkbox"
              className="accent-accent"
              checked={chosen.includes(track.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...chosen, track.id].sort((one, other) => one - other)
                    : chosen.filter((id) => id !== track.id),
                )
              }
            />
            {track.name}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * Votes are delegated one track at a time, and the balance behind them stays
 * locked for as long as the conviction says after the delegation ends.
 */
export function DelegateModal({ account, accounts, signers, balance, onClose }: DelegateProps) {
  const symbol = useSymbol()
  const { data: facts } = useFacts()
  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const [chosen, setChosen] = useState([0])
  // Delegating to yourself is a call that does nothing
  const others = accounts.filter((entry) => entry.address !== account.address)
  const [to, setTo] = useState('')
  const [conviction, setConviction] = useState<Conviction>('Locked1x')
  const [amount, setAmount] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const held = balance ? totalOf(balance) : 0n

  const delegating = (target: string, planck: bigint) =>
    batched(
      chosen.map((track) => ({
        kind: 'delegate' as const,
        delegation: { track, to: target, conviction, amount: planck },
      })),
    )

  const form = () => {
    setError('')

    const target = resolveAddress(to)
    if (!target) {
      setError('Enter the Numen or EVM address to delegate to')
      return false
    }

    let planck = 0n
    try {
      planck = parseAmount(amount)
    } catch (problem) {
      setError(problem instanceof AmountError ? problem.message : 'Enter an amount')
      return false
    }

    if (planck <= 0n || planck > held) {
      setError('Enter an amount within what this account holds')
      return false
    }

    if (chosen.length === 0) {
      setError('Pick at least one track')
      return false
    }

    void send(target, planck)
    return false
  }

  const send = async (target: string, planck: bigint) => {
    setBusy(true)
    try {
      await submit(delegating(target, planck), password)
      toast('Delegation sent')
      onClose()
    } catch (problem) {
      if (problem instanceof VaultError) setError(problem.message)
      else setError(problem instanceof Error ? problem.message : 'Delegation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Delegate votes"
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      footNote={`${formatAmount(held, { precision: 2 })} ${symbol} held`}
      onClose={onClose}
      onSubmit={form}
    >
      <TrackField chosen={chosen} onChange={setChosen} />

      <AddressField
        label="Delegate to"
        value={to}
        onChange={setTo}
        accounts={others}
      />

      <Field label="Conviction">
        <Select
          value={conviction}
          onValueChange={(value) => setConviction(value as Conviction)}
          options={convictionOptions(facts)}
          label="Conviction"
          className={INSIDE}
        />
      </Field>

      <Field label="Amount">
        <Input
          value={amount}
          inputMode="decimal"
          placeholder={`0.0 ${symbol}`}
          autoComplete="off"
          onChange={(event) => setAmount(amountInput(event.target.value))}
        />
      </Field>

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />

      {needsPassword && (
        <AccountPassword
          value={password}
          note="Unlocks this account for one signature"
          onChange={setPassword}
        />
      )}
      <FieldError>{error}</FieldError>

      <FeeLine from={signer.address} operation={wrap(delegating(account.address, held))} />
    </Modal>
  )
}

/** Ends the delegation on one track. The lock outlives it by the conviction. */
export function UndelegateModal({
  account,
  signers,
  onClose,
}: {
  account: Account
  signers: Account[]
  onClose: () => void
}) {
  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const [chosen, setChosen] = useState([0])
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const ending = batched(chosen.map((track) => ({ kind: 'undelegate' as const, track })))

  const form = () => {
    setError('')

    if (chosen.length === 0) {
      setError('Pick at least one track')
      return false
    }

    void send()
    return false
  }

  const send = async () => {
    setBusy(true)
    try {
      await submit(ending, password)
      toast('Sent')
      onClose()
    } catch (problem) {
      if (problem instanceof VaultError) setError(problem.message)
      else setError(problem instanceof Error ? problem.message : 'Could not end the delegation')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Take a delegation back"
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-lead">
        The votes come back to {account.name}. The balance behind them stays locked for as long as
        the conviction it was delegated under.
      </p>

      <TrackField chosen={chosen} onChange={setChosen} />

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />

      {needsPassword && (
        <AccountPassword
          value={password}
          note="Unlocks this account for one signature"
          onChange={setPassword}
        />
      )}
      <FieldError>{error}</FieldError>

      <FeeLine from={signer.address} operation={wrap(ending)} />
    </Modal>
  )
}
