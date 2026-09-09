import { AddressField } from './AddressField'
import { useId, useState } from 'react'
import { useSymbol, useTracks } from '@/chain/queries'
import { batched, totalOf, type AccountBalance, type Conviction } from '@/chain/types'
import { resolveAddress } from '@/lib/address'
import { amountProblem, formatAmount, parseAmount } from '@/lib/balance'
import { Checkbox } from '@/components/ui/checkbox'
import { Field as Row, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { LEDE } from '@/ui/Modal'
import { AmountField } from './AmountField'
import { CallModal, SignerField, useCall, useSigning } from './Authorize'
import { ConvictionField } from './ConvictionField'
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
 * Votes are delegated one track at a time, and the balance behind them stays
 * locked for as long as the conviction says after the delegation ends.
 */
export function DelegateModal({ account, accounts, signers, balance, onClose }: DelegateProps) {
  const symbol = useSymbol()
  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const [chosen, setChosen] = useState<number[]>([])
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
    if (!target) return call.refuse('Enter the Numen or EVM address to delegate to')

    const problem = amountProblem(amount)
    if (problem) return call.refuse(problem)
    const planck = parseAmount(amount)
    if (planck > held) return call.refuse('Enter an amount within what this account holds')

    if (chosen.length === 0) return call.refuse('Pick at least one track')

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

      <ConvictionField value={conviction} onChange={setConviction} />

      <AmountField label="Amount" value={amount} onChange={setAmount} />

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
  const [chosen, setChosen] = useState<number[]>([])
  const call = useCall(onClose)

  const ending = batched(chosen.map((track) => ({ kind: 'undelegate' as const, track })))

  const form = () => {
    if (chosen.length === 0) return call.refuse('Pick at least one track')

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
      <p className={LEDE}>
        The votes come back to {account.name}. The balance behind them stays locked for as long as
        the conviction it was delegated under.
      </p>

      <TrackField chosen={chosen} onChange={setChosen} />

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />
    </CallModal>
  )
}
