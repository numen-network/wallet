import { AddressField } from './AddressField'
import { useId, useState } from 'react'
import { waitFor } from '@/lib/blocks'
import { useFacts, useSymbol, useTracks } from '@/chain/queries'
import type { ChainFacts } from '@/chain/types'
import { batched, CONVICTIONS, totalOf, type AccountBalance, type Conviction } from '@/chain/types'
import { resolveAddress } from '@/lib/address'
import { amountInput, AmountError, formatAmount, parseAmount } from '@/lib/balance'
import { Checkbox } from '@/components/ui/checkbox'
import { Field as Row, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Field, INSIDE } from '@/ui/Field'
import { Input } from '@/components/ui/input'
import { Select } from '@/ui/Select'
import { CallModal, SignerField, useCall, useSigning } from './Authorize'
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
  const trackId = useId()

  return (
    <FieldSet className="mt-3.5">
      <FieldLegend>Tracks</FieldLegend>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {(tracks ?? []).map((track) => (
          <Row key={track.id} orientation="horizontal" className="w-fit gap-1.5">
            <Checkbox
              id={`${trackId}-${track.id}`}
              checked={chosen.includes(track.id)}
              onCheckedChange={(checked) =>
                onChange(
                  checked === true
                    ? [...chosen, track.id].sort((one, other) => one - other)
                    : chosen.filter((id) => id !== track.id),
                )
              }
            />
            <FieldLabel htmlFor={`${trackId}-${track.id}`}>{track.name}</FieldLabel>
          </Row>
        ))}
      </div>
    </FieldSet>
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
  const call = useCall(onClose)

  const held = balance ? totalOf(balance) : 0n

  const delegating = (target: string, planck: bigint) =>
    batched(
      chosen.map((track) => ({
        kind: 'delegate' as const,
        delegation: { track, to: target, conviction, amount: planck },
      })),
    )

  const form = () => {
    const target = resolveAddress(to)
    if (!target) {
      call.setError('Enter the Numen or EVM address to delegate to')
      return false
    }

    let planck = 0n
    try {
      planck = parseAmount(amount)
    } catch (problem) {
      call.setError(problem instanceof AmountError ? problem.message : 'Enter an amount')
      return false
    }

    if (planck <= 0n || planck > held) {
      call.setError('Enter an amount within what this account holds')
      return false
    }

    if (chosen.length === 0) {
      call.setError('Pick at least one track')
      return false
    }

    return call.run(submit(delegating(target, planck), call.password), 'Delegation sent')
  }

  return (
    <CallModal
      title="Delegate votes"
      submitLabel="Sign and send"
      busy={call.busy}
      footNote={`${formatAmount(held, { precision: 2 })} ${symbol} held`}
      from={signer.address}
      needsPassword={needsPassword}
      operation={wrap(delegating(account.address, held))}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
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
    </CallModal>
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
  const call = useCall(onClose)

  const ending = batched(chosen.map((track) => ({ kind: 'undelegate' as const, track })))

  const form = () => {
    if (chosen.length === 0) {
      call.setError('Pick at least one track')
      return false
    }

    return call.run(submit(ending, call.password))
  }

  return (
    <CallModal
      title="Take a delegation back"
      submitLabel="Sign and send"
      busy={call.busy}
      from={signer.address}
      needsPassword={needsPassword}
      operation={wrap(ending)}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-muted-foreground">
        The votes come back to {account.name}. The balance behind them stays locked for as long as
        the conviction it was delegated under.
      </p>

      <TrackField chosen={chosen} onChange={setChosen} />

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />
    </CallModal>
  )
}
