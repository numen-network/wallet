import { Fragment, useId, useState } from 'react'
import { AmountField } from '@/accounts/AmountField'
import { CallModal, useCall } from '@/accounts/Authorize'
import { ConvictionField } from '@/accounts/ConvictionField'
import { useSymbol, useTracks } from '@/chain/queries'
import { trackLabel, type Ballot, type Referendum } from '@/chain/governance'
import {
  batched,
  totalOf,
  type AccountBalance,
  type Conviction,
  type Operation,
} from '@/chain/types'
import { amountProblem, formatAmount, parseAmount } from '@/lib/balance'
import { cn } from '@/lib/cn'
import { Item, ItemGroup, ItemSeparator } from '@/components/ui/item'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Field as Row, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Check, X, Minus } from 'lucide-react'
import { LEDE } from '@/ui/Modal'
import { Select } from '@/ui/Select'
import { useVoter, VoterField, type Voters } from './Voter'


const SIDES = [
  { id: 'aye', label: 'Aye' },
  { id: 'nay', label: 'Nay' },
  { id: 'abstain', label: 'Abstain' },
] as const

type Side = (typeof SIDES)[number]['id']

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
  const [address, setAddress] = useState(accounts[0].address)
  const [side, setSide] = useState<Side>('aye')
  const sideId = useId()
  const [conviction, setConviction] = useState<Conviction>('Locked1x')
  const [amount, setAmount] = useState('')
  const call = useCall(onClose)

  const voter = useVoter(accounts, address)
  const account = voter.account
  const balance = balances[account.address]
  const held = balance ? totalOf(balance) : 0n

  const ballotFor = (planck: bigint): Ballot =>
    side === 'abstain' ? { kind: 'abstain', amount: planck } : { kind: side, conviction, amount: planck }

  const form = () => {
    const problem = amountProblem(amount)
    if (problem) return call.refuse(problem)
    const planck = parseAmount(amount)
    if (planck > held) return call.refuse('Enter an amount within what this account holds')

    return call.run(
      voter.submit({ kind: 'vote', poll: referendum.index, ballot: ballotFor(planck) }, call.password),
    )
  }

  return (
    <CallModal
      title={`Vote on referendum ${referendum.index}`}
      submitLabel="Sign and send"
      busy={call.busy}
      footNote={`${formatAmount(held, { precision: 2 })} ${symbol} held`}
      from={voter.signer.address}
      needsPassword={voter.needsPassword}
      operation={voter.wrap({ kind: 'vote', poll: referendum.index, ballot: ballotFor(held) })}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      <p className={LEDE}>
        {trackLabel(tracks, referendum.track)}. The balance behind the vote stays locked for as long
        as the conviction says, counted from the day the referendum ends.
      </p>

      <VoterField accounts={accounts} voter={voter} onChange={setAddress} />

      <FieldSet className="mt-3.5">
        <FieldLegend>Vote</FieldLegend>
        <RadioGroup
          value={side}
          onValueChange={(value) => setSide(value as Side)}
          className="flex flex-wrap gap-x-3.5 gap-y-1.5"
        >
          {SIDES.map((option) => (
            <Row key={option.id} orientation="horizontal" className="w-fit gap-1.5">
              <RadioGroupItem id={`${sideId}-${option.id}`} value={option.id} />
              <FieldLabel htmlFor={`${sideId}-${option.id}`}>{option.label}</FieldLabel>
            </Row>
          ))}
        </RadioGroup>
      </FieldSet>

      {/* An abstain carries no conviction, so there is nothing to choose */}
      {side !== 'abstain' && (
        <ConvictionField value={conviction} onChange={setConviction} />
      )}

      <AmountField label="Amount" value={amount} onChange={setAmount} />
    </CallModal>
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
  const call = useCall(onClose)

  const voter = useVoter(accounts, address)
  const operation = {
    kind: 'removeVote',
    track: referendum.track,
    poll: referendum.index,
  } as const

  const form = () => call.run(voter.submit(operation, call.password))

  return (
    <CallModal
      title={`Take back the vote on ${referendum.index}`}
      submitLabel="Sign and send"
      busy={call.busy}
      from={voter.signer.address}
      needsPassword={voter.needsPassword}
      operation={voter.wrap(operation)}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      <p className={LEDE}>
        The vote stops counting. What it locked stays locked until the conviction runs out, and
        then has to be released on its own.
      </p>

      <VoterField accounts={accounts} voter={voter} onChange={setAddress} />
    </CallModal>
  )
}

const CHOICES = [
  { value: 'skip', label: 'Skip', tone: 'text-dim', mark: null },
  { value: 'aye', label: 'Aye', tone: 'text-good', mark: <Check strokeWidth={2.4} /> },
  { value: 'nay', label: 'Nay', tone: 'text-destructive', mark: <X strokeWidth={2.4} /> },
  { value: 'abstain', label: 'Abstain', tone: 'text-primary', mark: <Minus strokeWidth={2.4} /> },
] as const

type Choice = (typeof CHOICES)[number]

/** Skip keeps an empty box so every row reads from the same left edge. */
const marked = (choice: Choice) => (
  <span className={cn('flex size-3.5 shrink-0', choice.tone)}>{choice.mark}</span>
)

const choiceFor = (side: Side | undefined): Choice =>
  CHOICES.find((choice) => choice.value === side) ?? CHOICES[0]

const CHOICE_OPTIONS = CHOICES.map((choice) => ({
  value: choice.value,
  label: choice.label,
  icon: marked(choice),
}))

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
  const [address, setAddress] = useState(accounts[0].address)
  const [conviction, setConviction] = useState<Conviction>('Locked1x')
  const [amount, setAmount] = useState('')
  const [sides, setSides] = useState<Record<number, Side>>({})
  const call = useCall(onClose)

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
    if (chosen.length === 0) return call.refuse('Say how at least one of these should go')

    const problem = amountProblem(amount)
    if (problem) return call.refuse(problem)
    const planck = parseAmount(amount)
    if (planck > held) return call.refuse('Enter an amount within what this account holds')

    return call.run(voter.submit(batched(callsFor(planck)), call.password))
  }

  return (
    <CallModal
      title="Batch vote"
      submitLabel="Sign and send"
      busy={call.busy}
      width={640}
      footNote={`${formatAmount(held, { precision: 2 })} ${symbol} held, and the same amount rides every one of these`}
      from={voter.signer.address}
      needsPassword={voter.needsPassword}
      operation={chosen.length > 0 ? voter.wrap(batched(callsFor(held))) : null}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      <p className={LEDE}>
        The chain takes the largest vote across every track as the lock rather than the sum, so
        voting the same amount on all of these locks it once. It stays locked for as long as the
        conviction says, counted from the day each referendum ends.
      </p>

      <VoterField accounts={accounts} voter={voter} onChange={setAddress} />

      <ItemGroup variant="outline" className="mt-3.5">
        {referenda.map((referendum, index) => {
          const choice = choiceFor(sides[referendum.index])

          return (
            <Fragment key={referendum.index}>
              {index > 0 && <ItemSeparator />}
              <Item className="gap-2.5">
                <span className="font-mono text-[12.5px] font-bold text-dim">#{referendum.index}</span>
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {referendum.title ?? trackLabel(tracks, referendum.track)}
                </span>
                <Select
                  value={choice.value}
                  onValueChange={(value) =>
                    setSides((held) => {
                      const { [referendum.index]: gone, ...rest } = held
                      return value === 'skip' ? rest : { ...rest, [referendum.index]: value as Side }
                    })
                  }
                  options={CHOICE_OPTIONS}
                  label={`Vote on referendum ${referendum.index}`}
                  variant="boxed"
                  className={cn('w-[120px]', choice.tone)}
                >
                  {marked(choice)}
                </Select>
              </Item>
            </Fragment>
          )
        })}
      </ItemGroup>

      <div className="mt-3.5 grid grid-cols-2 gap-x-3.5 gap-y-2.5 *:mt-0 max-[560px]:grid-cols-1">
        <ConvictionField value={conviction} onChange={setConviction} />

        <AmountField label="Amount" value={amount} onChange={setAmount} />
      </div>
    </CallModal>
  )
}
