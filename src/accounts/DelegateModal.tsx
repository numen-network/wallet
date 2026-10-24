import { useId, type ReactNode } from 'react'
import { useFees, useSplits, useSymbol, useTracks, useVotingFor, type Charge } from '@/chain/queries'
import {
  batched,
  totalOf,
  type AccountBalance,
  type Conviction,
  type Delegation,
  type Operation,
  type TrackVoting,
} from '@/chain/types'
import { resolveAddress } from '@/lib/address'
import { amountProblem, formatAmount, parseAmount } from '@/lib/balance'
import { cn } from '@/lib/cn'
import { Checkbox } from '@/components/ui/checkbox'
import { Field as Row, FieldLabel, FieldSet } from '@/components/ui/field'
import { LEDE, ModalFrame } from '@/ui/Modal'
import { useField } from '@/ui/reopen'
import { TabBar, TabPanel, Tabs, type TabOption } from '@/ui/Tabs'
import { useVoter, VoterField, type Voter, type Voters } from '@/governance/Voter'
import { AccountsList, TICK_BOX, TickHead } from './AccountsList'
import { AddressField } from './AddressField'
import { AmountField } from './AmountField'
import { CallModal, CallPage, SignerField, useCall, useSend, useSigning } from './Authorize'
import { ConvictionField } from './ConvictionField'
import { actorOf, innerOf, type Part } from './jobs'
import { needsPassword, type Account } from './types'

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
  enabled,
}: {
  chosen: number[]
  onChange: (tracks: number[]) => void
  /** The tracks that can be ticked, where the rest have nothing to act on. All of them when left out. */
  enabled?: number[]
}) {
  const { data: tracks = [] } = useTracks()
  const trackId = useId()
  const every = tracks.map((track) => track.id).filter((id) => !enabled || enabled.includes(id))
  const all = every.length > 0 && every.every((id) => chosen.includes(id))

  return (
    <FieldSet className="mt-3.5 gap-0">
      <TickHead
        label="Tracks"
        all={all}
        onAll={every.length === 0 ? null : () => onChange(all ? [] : every)}
      />
      <div
        className={cn(
          TICK_BOX,
          'grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-x-4 gap-y-1.5 px-3 py-2.5 max-[560px]:grid-cols-2',
        )}
      >
        {tracks.map((track) => (
          <Row key={track.id} orientation="horizontal" className="w-fit gap-1.5">
            <Checkbox
              id={`${trackId}-${track.id}`}
              checked={chosen.includes(track.id)}
              disabled={!every.includes(track.id)}
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

type Mode = 'single' | 'multiple'

const MODES: TabOption<Mode>[] = [
  { id: 'single', label: 'Single' },
  { id: 'multiple', label: 'Multiple' },
]

/** What a delegation says whichever accounts make it. */
interface Terms {
  tracks: number[]
  to: string
  conviction: Conviction
}

interface PageProps extends DelegateProps {
  tabs: ReactNode
  terms: Terms
  setTerms: (patch: Partial<Terms>) => void
}

const heldBy = (balances: Record<string, AccountBalance>, account: Account) => {
  const balance = balances[account.address]
  return balance ? totalOf(balance) : 0n
}

const same = (one: Delegation, other: Delegation) =>
  one.to === other.to && one.conviction === other.conviction && one.amount === other.amount

/**
 * The calls that bring one account to these terms, a group a track, from what
 * it already has on each. A group runs in turn, so it has to land in one
 * transaction. A delegation that already says the same is left alone, one that
 * says something else is taken back first, since the chain refuses a second.
 * Votes on referenda that are over are cleared off the record first. A
 * referendum still counting a vote keeps the delegation off that track, since
 * taking the vote back would change its tally.
 */
export function planOf(
  tracks: number[],
  terms: Pick<Terms, 'conviction'>,
  to: string,
  amount: bigint,
  has: TrackVoting[],
): Operation[][] {
  const groups = tracks.map((track): Operation[] => {
    const now = has.find((entry) => entry.track === track)
    const wanted: Delegation = { track, to, conviction: terms.conviction, amount }
    const delegate: Operation = { kind: 'delegate', delegation: wanted }

    if (!now) return [delegate]
    if (now.kind === 'delegating') {
      return same(now.delegation, wanted) ? [] : [{ kind: 'undelegate', track }, delegate]
    }
    if (now.ongoing.length > 0) return []
    return [...now.ended.map((poll): Operation => ({ kind: 'removeVote', track, poll })), delegate]
  })
  return groups.filter((group) => group.length > 0)
}

/**
 * Each account's calls in transactions the chain takes. Undefined until what
 * the accounts already have is read and their calls are weighed.
 */
function usePlans(accounts: Account[], plan: (account: Account, has: TrackVoting[]) => Operation[][]) {
  const has = useVotingFor(accounts.map((account) => account.address))
  const plans = has && accounts.map((account) => plan(account, has[account.address] ?? []))
  const parts = useSplits(plans ?? [])
  if (!plans || !parts) return undefined
  return parts.map((split) => split.map(batched))
}

/** Who pays for each part, which is the signatory where one signs for the account. */
function chargesOf(accounts: Account[], plans: Operation[][], voter: Voter): Charge[][] {
  return plans.map((parts, at) => {
    const account = accounts[at]!
    return parts.map((part) =>
      account === voter.account
        ? { from: voter.signer.address, operation: voter.wrap(part) }
        : { from: account.address, operation: part },
    )
  })
}

/**
 * What each account can put behind a delegation. The chain takes the fee
 * before the call runs, and the lock leaves nothing for the next part's fee,
 * so an account paying its own keeps twice its fees back. Twice covers a fee
 * that rises between the quote and the block. Undefined until they are priced.
 */
function useLockable(accounts: Account[], charges: Charge[][] | undefined, held: (account: Account) => bigint) {
  const fees = useFees(charges?.flat() ?? [])
  if (!charges || !fees) return undefined
  let at = 0
  return accounts.map((account, index) => {
    const mine = charges[index]!
    const priced = fees.slice(at, (at += mine.length))
    const own = mine.reduce(
      (sum, charge, place) => (charge.from === account.address ? sum + priced[place]! : sum),
      0n,
    )
    const left = held(account) - 2n * own
    return left > 0n ? left : 0n
  })
}

/** The tracks the failed calls were on, which is all a retry has to send again. */
function tracksOf(failed: Part[]): number[] {
  const tracks = failed.flatMap(({ operation }) => {
    const inner = innerOf(operation)
    return (inner.kind === 'batch' ? inner.calls : [inner]).flatMap((call) =>
      call.kind === 'delegate' ? [call.delegation.track] : call.kind === 'undelegate' ? [call.track] : [],
    )
  })
  return [...new Set(tracks)].sort((one, other) => one - other)
}

/** The delegate, or what is wrong with the terms. */
function checkTerms(terms: Terms, delegating: Account[]): { target: string } | { problem: string } {
  const target = resolveAddress(terms.to)
  if (!target) return { problem: 'Enter the Numen or EVM address to delegate to' }
  // Delegating to yourself is a call that does nothing
  if (delegating.some((account) => account.address === target)) {
    return { problem: 'Enter an address other than the delegating accounts' }
  }
  if (terms.tracks.length === 0) return { problem: 'Pick at least one track' }
  return { target }
}

/**
 * Votes are delegated one track at a time, and the balance behind them stays
 * locked for as long as the conviction says after the delegation ends. One
 * account or several make the same delegation, so they are one dialog with a
 * switch, and the terms carry over when it is flipped.
 */
export function DelegateModal(props: DelegateProps) {
  const [mode, setMode] = useField<Mode>('mode', 'single')
  const [terms, setAll] = useField<Terms>('terms', { tracks: [], to: props.to, conviction: 'Locked1x' })
  const setTerms = (patch: Partial<Terms>) => setAll((current) => ({ ...current, ...patch }))
  const page = { ...props, tabs: <TabBar options={MODES} className="w-fit" />, terms, setTerms }

  return (
    <Tabs value={mode} onChange={setMode}>
      <ModalFrame width={mode === 'multiple' ? 720 : 580} onClose={props.onClose}>
        <TabPanel value="single">
          <DelegateOne {...page} />
        </TabPanel>
        <TabPanel value="multiple">
          <DelegateMany {...page} />
        </TabPanel>
      </ModalFrame>
    </Tabs>
  )
}

function TermsFields({
  terms,
  setTerms,
  others,
}: Pick<PageProps, 'terms' | 'setTerms'> & { others: Account[] }) {
  return (
    <>
      <TrackField chosen={terms.tracks} onChange={(tracks) => setTerms({ tracks })} />
      <AddressField
        label="Delegate to"
        value={terms.to}
        onChange={(to) => setTerms({ to })}
        accounts={others}
      />
      <ConvictionField value={terms.conviction} onChange={(conviction) => setTerms({ conviction })} />
    </>
  )
}

function DelegateOne({ delegators, accounts, balances, from, onClose, tabs, terms, setTerms }: PageProps) {
  const symbol = useSymbol()
  const [address, setAddress] = useField('address', from)
  const voter = useVoter(delegators, address)
  const [amount, setAmount] = useField('amount', '')
  const call = useCall(onClose)
  const held = heldBy(balances, voter.account)
  const target = resolveAddress(terms.to) ?? voter.account.address
  const planck = amountProblem(amount) ? held : parseAmount(amount)
  const parts = usePlans([voter.account], (_, has) => planOf(terms.tracks, terms, target, planck, has))?.[0]
  const lockable = useLockable(
    [voter.account],
    parts && chargesOf([voter.account], [parts], voter),
    () => held,
  )?.[0]

  const form = () => {
    const checked = checkTerms(terms, [voter.account])
    if ('problem' in checked) return call.refuse(checked.problem)

    const problem = amountProblem(amount)
    if (problem) return call.refuse(problem)
    if (!parts || lockable === undefined) return false
    if (planck > lockable) return call.refuse('Enter an amount that leaves room for the fees')
    if (parts.length === 0) return call.refuse('Nothing to send for the tracks picked')

    return call.run(
      parts.map((part) => voter.submit(part, call.password)),
      { again: (failed) => ({ terms: { ...terms, tracks: tracksOf(failed) } }) },
    )
  }

  return (
    <CallPage
      title="Delegate votes"
      submitLabel="Sign and send"
      busy={call.busy}
      disabled={terms.tracks.length > 0 && (!parts || lockable === undefined)}
      aside={tabs}
      footNote={`${formatAmount(held, { precision: 2 })} ${symbol} held`}
      from={voter.signer.address}
      needsPassword={voter.needsPassword}
      operation={parts && parts.length > 0 ? parts.map(voter.wrap) : null}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      <VoterField label="Delegating as" accounts={delegators} voter={voter} onChange={setAddress} />
      <TermsFields
        terms={terms}
        setTerms={setTerms}
        others={accounts.filter((entry) => entry !== voter.account)}
      />
      <AmountField label="Amount" value={amount} onChange={setAmount} />
    </CallPage>
  )
}

/**
 * Each account delegates all it holds less its fees, under the one password,
 * every signature made at once and sent together, so one account the chain
 * turns down holds up none of the others.
 */
function DelegateMany({ delegators, accounts, balances, from, onClose, tabs, terms, setTerms }: PageProps) {
  const [addresses, setAddresses] = useField('picked', () => [
    (delegators.find((entry) => entry.address === from) ?? delegators[0]).address,
  ])
  const chosen = delegators.filter((entry) => addresses.includes(entry.address))
  const picked: Voters = chosen[0] ? [chosen[0], ...chosen.slice(1)] : [delegators[0]]
  const voter = useVoter(delegators, picked[0].address)
  const send = useSend()
  const call = useCall(onClose)
  const many = picked.length > 1
  const target = resolveAddress(terms.to) ?? voter.account.address
  // Priced on all of it first, since what each can lock is what is left after its fees
  const probe = usePlans(picked, (account, has) =>
    planOf(terms.tracks, terms, target, heldBy(balances, account), has),
  )
  const lockable = useLockable(picked, probe && chargesOf(picked, probe, voter), (account) =>
    heldBy(balances, account),
  )
  const plans = usePlans(picked, (account, has) => {
    const amount = lockable?.[picked.indexOf(account)] ?? 0n
    return amount > 0n ? planOf(terms.tracks, terms, target, amount, has) : []
  })
  const ready = lockable && plans

  // The lone pick may be a multisig or a proxied account, which signs through somebody
  const submitAs = (account: Account, operation: Operation) =>
    account === voter.account
      ? voter.submit(operation, call.password)
      : send(account, operation, call.password)

  const charges = ready && chargesOf(picked, ready, voter).flat()

  const form = () => {
    const checked = checkTerms(terms, picked)
    if ('problem' in checked) return call.refuse(checked.problem)
    if (!ready) return false
    if (ready.every((parts) => parts.length === 0)) {
      return call.refuse('Nothing to send for the tracks picked')
    }

    return call.run(
      ready.flatMap((parts, at) => parts.map((part) => submitAs(picked[at]!, part))),
      {
        again: (failed) => ({
          picked: [...new Set(failed.map(actorOf))],
          terms: { ...terms, tracks: tracksOf(failed) },
        }),
      },
    )
  }

  return (
    <CallPage
      title="Delegate votes"
      submitLabel="Sign and send"
      busy={call.busy}
      disabled={terms.tracks.length > 0 && !ready}
      aside={tabs}
      from={voter.signer.address}
      needsPassword={many ? picked.some(needsPassword) : voter.needsPassword}
      {...(many && { note: 'Unlocks each account for its signatures' })}
      operation={null}
      {...(charges && charges.length > 0 && { charges })}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      <AccountsList
        label="Delegating as"
        value={picked}
        onChange={(next) => setAddresses(next.map((entry) => entry.address))}
        accounts={delegators}
        balances={balances}
      />
      {!many && (
        <SignerField
          account={voter.account}
          signer={voter.signer}
          bench={voter.bench}
          onChange={voter.choose}
        />
      )}
      <TermsFields
        terms={terms}
        setTerms={setTerms}
        others={accounts.filter((entry) => !picked.includes(entry))}
      />
      <AmountField label="Amount" value="All each account holds, less fees" onChange={() => {}} readOnly />
    </CallPage>
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
  const [chosen, setChosen] = useField<number[]>('tracks', [])
  const call = useCall(onClose)
  const has = useVotingFor([account.address])?.[account.address]
  const delegated = has?.flatMap((entry) => (entry.kind === 'delegating' ? [entry.track] : []))
  const ending = chosen
    .filter((track) => delegated?.includes(track))
    .map((track): Operation => ({ kind: 'undelegate', track }))
  const parts = useSplits([ending.map((call) => [call])])?.[0]?.map(batched)

  const form = () => {
    if (ending.length === 0) return call.refuse('Pick at least one track')
    if (!parts) return false

    return call.run(
      parts.map((part) => submit(part, call.password)),
      { again: (failed) => ({ tracks: tracksOf(failed) }) },
    )
  }

  return (
    <CallModal
      title="Take a delegation back"
      submitLabel="Sign and send"
      busy={call.busy}
      disabled={!delegated || delegated.length === 0 || (ending.length > 0 && !parts)}
      from={signer.address}
      needsPassword={needsPassword}
      operation={parts && parts.length > 0 ? parts.map(wrap) : null}
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

      <TrackField chosen={chosen} onChange={setChosen} enabled={delegated ?? []} />

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />
    </CallModal>
  )
}
