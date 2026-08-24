import { useState } from 'react'
import { AccountPassword, FeeLine } from '@/accounts/Authorize'
import { waitFor } from '@/lib/blocks'
import { useFacts, useSymbol, useTracks } from '@/chain/queries'
import type { ChainFacts } from '@/chain/types'
import { trackLabel, type Ballot, type Referendum } from '@/chain/governance'
import {
  batched,
  CONVICTIONS,
  totalOf,
  type AccountBalance,
  type Conviction,
  type Operation,
} from '@/chain/types'
import { amountInput, AmountError, formatAmount, parseAmount } from '@/lib/balance'
import { VaultError } from '@/signing/vault'
import { Field, FieldError, Input, Modal, INSIDE } from '@/ui/Modal'
import { Select } from '@/ui/Select'
import { toast } from '@/ui/Toast'
import { useVoter, VoterField, type Voters } from './Voter'


const SIDES = [
  { id: 'aye', label: 'Aye' },
  { id: 'nay', label: 'Nay' },
  { id: 'abstain', label: 'Abstain' },
] as const

type Side = (typeof SIDES)[number]['id']

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

interface VoteProps {
  referendum: Referendum
  accounts: Voters
  balances: Record<string, AccountBalance>
  onClose: () => void
}

/**
 * A vote locks the balance behind it for as long as the conviction says, and the
 * conviction is what multiplies its weight. Abstain counts for support and for
 * neither side, which is how a holder says the question should be settled
 * without saying how.
 */
export function VoteModal({ referendum, accounts, balances, onClose }: VoteProps) {
  const symbol = useSymbol()
  const { data: tracks } = useTracks()
  const { data: facts } = useFacts()
  const [address, setAddress] = useState(accounts[0].address)
  const [side, setSide] = useState<Side>('aye')
  const [conviction, setConviction] = useState<Conviction>('Locked1x')
  const [amount, setAmount] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const voter = useVoter(accounts, address)
  const account = voter.account
  const balance = balances[account.address]
  const held = balance ? totalOf(balance) : 0n

  const ballotFor = (planck: bigint): Ballot =>
    side === 'abstain' ? { kind: 'abstain', amount: planck } : { kind: side, conviction, amount: planck }

  const form = () => {
    setError('')

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

    void send(planck)
    return false
  }

  const send = async (planck: bigint) => {
    setBusy(true)
    try {
      await voter.submit({ kind: 'vote', poll: referendum.index, ballot: ballotFor(planck) }, password)
      toast('Sent')
      onClose()
    } catch (problem) {
      if (problem instanceof VaultError) setError(problem.message)
      else setError(problem instanceof Error ? problem.message : 'The vote was refused')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Vote on referendum ${referendum.index}`}
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      footNote={`${formatAmount(held, { precision: 2 })} ${symbol} held`}
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-lead">
        {trackLabel(tracks, referendum.track)}. The balance behind the vote stays locked for as long
        as the conviction says, counted from the day the referendum ends.
      </p>

      <VoterField accounts={accounts} voter={voter} onChange={setAddress} />

      <fieldset className="mt-3.5">
        <legend className="mb-1.5 block text-[11px] font-bold tracking-[0.07em] text-lead uppercase">
          Vote
        </legend>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1.5">
          {SIDES.map((option) => (
            <label key={option.id} className="flex cursor-pointer items-center gap-1.5 text-[13.5px]">
              <input
                type="radio"
                name="side"
                value={option.id}
                checked={side === option.id}
                className="accent-accent"
                onChange={() => setSide(option.id)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* An abstain carries no conviction, so there is nothing to choose */}
      {side !== 'abstain' && (
        <Field label="Conviction">
          <Select
            value={conviction}
            onValueChange={(value) => setConviction(value as Conviction)}
            options={convictionOptions(facts)}
            label="Conviction"
            className={INSIDE}
          />
        </Field>
      )}

      <Field label="Amount">
        <Input
          value={amount}
          inputMode="decimal"
          placeholder={`0.0 ${symbol}`}
          autoComplete="off"
          onChange={(event) => setAmount(amountInput(event.target.value))}
        />
      </Field>

      {voter.needsPassword && (
        <AccountPassword
          value={password}
          note="Unlocks this account for one signature"
          onChange={setPassword}
        />
      )}
      <FieldError>{error}</FieldError>

      <FeeLine
        from={voter.signer.address}
        operation={voter.wrap({ kind: 'vote', poll: referendum.index, ballot: ballotFor(held) })}
      />
    </Modal>
  )
}

/** Takes a vote back. The lock outlives it by whatever conviction it carried. */
export function RemoveVoteModal({
  referendum,
  accounts,
  onClose,
}: {
  referendum: Referendum
  accounts: Voters
  onClose: () => void
}) {
  const [address, setAddress] = useState(accounts[0].address)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const voter = useVoter(accounts, address)
  const account = voter.account
  const operation = {
    kind: 'removeVote',
    track: referendum.track,
    poll: referendum.index,
  } as const

  const form = () => {
    setError('')
    void send()
    return false
  }

  const send = async () => {
    setBusy(true)
    try {
      await voter.submit(operation, password)
      toast('Sent')
      onClose()
    } catch (problem) {
      if (problem instanceof VaultError) setError(problem.message)
      else setError(problem instanceof Error ? problem.message : 'The chain kept the vote')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Take back the vote on ${referendum.index}`}
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-lead">
        The vote stops counting. What it locked stays locked until the conviction runs out, and
        then has to be released on its own.
      </p>

      <VoterField accounts={accounts} voter={voter} onChange={setAddress} />

      {voter.needsPassword && (
        <AccountPassword
          value={password}
          note="Unlocks this account for one signature"
          onChange={setPassword}
        />
      )}
      <FieldError>{error}</FieldError>

      <FeeLine from={voter.signer.address} operation={voter.wrap(operation)} />
    </Modal>
  )
}

const CHOICES = [
  { value: 'skip', label: 'Skip' },
  { value: 'aye', label: 'Aye' },
  { value: 'nay', label: 'Nay' },
  { value: 'abstain', label: 'Abstain' },
]

/**
 * One ballot over several referenda. pallet_conviction_voting takes the largest
 * vote in a class as the lock rather than the sum of them, so the same amount
 * riding every one of these costs the account that amount once.
 */
export function VoteManyModal({
  referenda,
  accounts,
  balances,
  onClose,
}: {
  referenda: Referendum[]
  accounts: Voters
  balances: Record<string, AccountBalance>
  onClose: () => void
}) {
  const symbol = useSymbol()
  const { data: tracks } = useTracks()
  const { data: facts } = useFacts()
  const [address, setAddress] = useState(accounts[0].address)
  const [conviction, setConviction] = useState<Conviction>('Locked1x')
  const [amount, setAmount] = useState('')
  const [sides, setSides] = useState<Record<number, Side>>({})
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const voter = useVoter(accounts, address)
  const account = voter.account
  const balance = balances[account.address]
  const held = balance ? totalOf(balance) : 0n
  const chosen = referenda.filter((referendum) => sides[referendum.index])

  const ballotFor = (planck: bigint, side: Side): Ballot =>
    side === 'abstain'
      ? { kind: 'abstain', amount: planck }
      : { kind: side, conviction, amount: planck }

  const callsFor = (planck: bigint): Operation[] =>
    chosen.map((referendum) => ({
      kind: 'vote',
      poll: referendum.index,
      ballot: ballotFor(planck, sides[referendum.index] as Side),
    }))

  const form = () => {
    setError('')

    if (chosen.length === 0) {
      setError('Say how at least one of these should go')
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

    void send(planck)
    return false
  }

  const send = async (planck: bigint) => {
    setBusy(true)
    try {
      await voter.submit(batched(callsFor(planck)), password)
      toast('Sent')
      onClose()
    } catch (problem) {
      if (problem instanceof VaultError) setError(problem.message)
      else setError(problem instanceof Error ? problem.message : 'The votes were refused')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Vote on several"
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      width={640}
      footNote={`${formatAmount(held, { precision: 2 })} ${symbol} held, and the same amount rides every one of these`}
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-lead">
        The chain takes the largest vote on a track as the lock rather than the sum, so voting the
        same amount on all of these locks it once. It stays locked for as long as the conviction
        says, counted from the day each referendum ends.
      </p>

      <VoterField accounts={accounts} voter={voter} onChange={setAddress} />

      <ul className="mt-3.5 rounded-[6px] border border-line">
        {referenda.map((referendum) => (
          <li
            key={referendum.index}
            className="flex items-center gap-2.5 border-t border-line px-2.5 py-1.5 first:border-t-0"
          >
            <span className="font-mono text-[12.5px] font-bold text-dim">#{referendum.index}</span>
            <span className="min-w-0 flex-1 truncate text-[13px]">
              {referendum.title ?? trackLabel(tracks, referendum.track)}
            </span>
            <Select
              value={sides[referendum.index] ?? 'skip'}
              onValueChange={(value) =>
                setSides((held) => {
                  const { [referendum.index]: gone, ...rest } = held
                  return value === 'skip' ? rest : { ...rest, [referendum.index]: value as Side }
                })
              }
              options={CHOICES}
              label={`Vote on referendum ${referendum.index}`}
              className="w-[104px] justify-between rounded-[4px] border border-line-strong bg-recess px-2.5 py-1 text-[13px]"
            />
          </li>
        ))}
      </ul>

      <div className="mt-3.5 grid grid-cols-2 gap-x-3.5 max-[560px]:grid-cols-1">
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
      </div>

      {voter.needsPassword && (
        <AccountPassword
          value={password}
          note="Unlocks this account for one signature"
          onChange={setPassword}
        />
      )}
      <FieldError>{error}</FieldError>

      {chosen.length > 0 && (
        <FeeLine from={voter.signer.address} operation={voter.wrap(batched(callsFor(held)))} />
      )}
    </Modal>
  )
}
