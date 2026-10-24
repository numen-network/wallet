import { AddressField } from './AddressField'
import { useId, useRef, useState } from 'react'
import { useSplit, useSymbol, useTracks } from '@/chain/queries'
import { batched, totalOf, type AccountBalance, type Conviction, type Operation } from '@/chain/types'
import { resolveAddress } from '@/lib/address'
import { amountProblem, formatAmount, parseAmount } from '@/lib/balance'
import { Checkbox } from '@/components/ui/checkbox'
import { Field as Row, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { LEDE } from '@/ui/Modal'
import { useVoter, VoterField, type Voters } from '@/governance/Voter'
import { AmountField } from './AmountField'
import { CallModal, SignerField, useCall, useSigning } from './Authorize'
import { ConvictionField } from './ConvictionField'
import type { Account } from './types'

interface DelegateProps {
  /** The accounts that can sign, any of which may be the one delegating. */
  delegators: Voters
  /** Everything the wallet holds, since a delegate can be one of them. */
  accounts: Account[]
  balances: Record<string, AccountBalance>
  /** The account picked when the dialog opens. */
  from: string
  /** The delegate filled in when the dialog opens. */
  to: string
  onClose: () => void
}


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
 * The tracks a transaction at a time, as the chain splits their calls. Each
 * call on a track weighs as much as the most votes the pallet allows, so a few
 * fill a transaction. What each account has already sent is remembered, since
 * the chain refuses a track twice and a retry has to send only the rest.
 */
function useTrackParts(tracks: number[], call: (track: number) => Operation) {
  const { data } = useSplit(tracks.map(call))
  const sent = useRef(new Map<string, number[]>()).current
  let at = 0
  const parts = data?.map((part) => tracks.slice(at, (at += part.length)))

  return {
    /** Undefined while the chain is still weighing them. */
    parts,
    async send(account: Account, submit: (tracks: number[]) => Promise<void>) {
      if (!parts) throw new Error('The chain has not weighed these calls yet')
      for (const part of parts) {
        const done = sent.get(account.address) ?? []
        const left = part.filter((track) => !done.includes(track))
        if (left.length === 0) continue
        await submit(left)
        sent.set(account.address, [...done, ...left])
      }
    },
  }
}

/**
 * Votes are delegated one track at a time, and the balance behind them stays
 * locked for as long as the conviction says after the delegation ends.
 */
export function DelegateModal({
  delegators,
  accounts,
  balances,
  from,
  to: initial,
  onClose,
}: DelegateProps) {
  const symbol = useSymbol()
  const [address, setAddress] = useState(from)
  const voter = useVoter(delegators, address)
  const { account, wrap, submit, needsPassword } = voter
  const balance = balances[account.address]
  const [chosen, setChosen] = useState<number[]>([])
  // Delegating to yourself is a call that does nothing
  const others = accounts.filter((entry) => entry.address !== account.address)
  const [to, setTo] = useState(initial)
  const [conviction, setConviction] = useState<Conviction>('Locked1x')
  const [amount, setAmount] = useState('')
  const call = useCall(onClose)

  const held = balance ? totalOf(balance) : 0n

  const delegating = (tracks: number[], target: string, planck: bigint) =>
    batched(
      tracks.map((track) => ({
        kind: 'delegate' as const,
        delegation: { track, to: target, conviction, amount: planck },
      })),
    )
  const parts = useTrackParts(chosen, (track) => delegating([track], account.address, held))

  const form = () => {
    const target = resolveAddress(to)
    if (!target) return call.refuse('Enter the Numen or EVM address to delegate to')

    const problem = amountProblem(amount)
    if (problem) return call.refuse(problem)
    const planck = parseAmount(amount)
    if (planck > held) return call.refuse('Enter an amount within what this account holds')

    if (chosen.length === 0) return call.refuse('Pick at least one track')

    return call.run(
      parts.send(account, (part) => submit(delegating(part, target, planck), call.password)),
      'Delegation sent',
    )
  }

  return (
    <CallModal
      title="Delegate votes"
      submitLabel="Sign and send"
      busy={call.busy}
      disabled={chosen.length > 0 && !parts.parts}
      footNote={`${formatAmount(held, { precision: 2 })} ${symbol} held`}
      from={voter.signer.address}
      needsPassword={needsPassword}
      operation={(parts.parts ?? [chosen]).map((part) =>
        wrap(delegating(part, account.address, held)),
      )}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      <VoterField
        label="Delegating as"
        accounts={delegators}
        voter={voter}
        onChange={setAddress}
      />

      <TrackField chosen={chosen} onChange={setChosen} />

      <AddressField
        label="Delegate to"
        value={to}
        onChange={setTo}
        accounts={others}
      />

      <ConvictionField value={conviction} onChange={setConviction} />

      <AmountField label="Amount" value={amount} onChange={setAmount} />
    </CallModal>
  )
}

/** Ends the delegation on the tracks ticked. The lock outlives it by the conviction. */
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
  const [chosen, setChosen] = useState<number[]>([])
  const call = useCall(onClose)

  const ending = (tracks: number[]) =>
    batched(tracks.map((track) => ({ kind: 'undelegate' as const, track })))
  const parts = useTrackParts(chosen, (track) => ending([track]))

  const form = () => {
    if (chosen.length === 0) return call.refuse('Pick at least one track')

    return call.run(parts.send(account, (part) => submit(ending(part), call.password)))
  }

  return (
    <CallModal
      title="Take a delegation back"
      submitLabel="Sign and send"
      busy={call.busy}
      disabled={chosen.length > 0 && !parts.parts}
      from={signer.address}
      needsPassword={needsPassword}
      operation={(parts.parts ?? [chosen]).map((part) => wrap(ending(part)))}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      <p className={LEDE}>
        The votes come back to {account.name}. The balance behind them stays locked for as long as
        the conviction it was delegated under.
      </p>

      <TrackField chosen={chosen} onChange={setChosen} />

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />
    </CallModal>
  )
}
