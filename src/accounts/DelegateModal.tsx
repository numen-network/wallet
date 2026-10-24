import { useId, type ReactNode } from 'react'
import { useFeesEstimate, useSplit, useSymbol, useTracks } from '@/chain/queries'
import { batched, totalOf, type AccountBalance, type Conviction, type Operation } from '@/chain/types'
import { resolveAddress } from '@/lib/address'
import { amountProblem, formatAmount, parseAmount } from '@/lib/balance'
import { cn } from '@/lib/cn'
import { Checkbox } from '@/components/ui/checkbox'
import { Field as Row, FieldLabel, FieldSet } from '@/components/ui/field'
import { LEDE, ModalFrame } from '@/ui/Modal'
import { useField } from '@/ui/reopen'
import { TabBar, TabPanel, Tabs, type TabOption } from '@/ui/Tabs'
import { useVoter, VoterField, type Voters } from '@/governance/Voter'
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
}: {
  chosen: number[]
  onChange: (tracks: number[]) => void
}) {
  const { data: tracks = [] } = useTracks()
  const trackId = useId()
  const every = tracks.map((track) => track.id)

  return (
    <FieldSet className="mt-3.5 gap-0">
      <TickHead
        label="Tracks"
        all={chosen.length === every.length}
        onAll={() => onChange(chosen.length === every.length ? [] : every)}
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

const delegating = (tracks: number[], terms: Terms, target: string, planck: bigint) =>
  batched(
    tracks.map((track) => ({
      kind: 'delegate' as const,
      delegation: { track, to: target, conviction: terms.conviction, amount: planck },
    })),
  )

const heldBy = (balances: Record<string, AccountBalance>, account: Account) => {
  const balance = balances[account.address]
  return balance ? totalOf(balance) : 0n
}

/**
 * The tracks a transaction at a time, as the chain splits their calls. Each
 * call on a track weighs as much as the most votes the pallet allows, so a few
 * fill a transaction. Undefined while the chain is still weighing them.
 */
function useTrackParts(tracks: number[], call: (track: number) => Operation) {
  const { data } = useSplit(tracks.map(call))
  let at = 0
  return data?.map((part) => tracks.slice(at, (at += part.length)))
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
  const probe = (tracks: number[]) => delegating(tracks, terms, voter.account.address, held)
  const parts = useTrackParts(terms.tracks, (track) => probe([track]))

  const form = () => {
    const checked = checkTerms(terms, [voter.account])
    if ('problem' in checked) return call.refuse(checked.problem)

    const problem = amountProblem(amount)
    if (problem) return call.refuse(problem)
    const planck = parseAmount(amount)
    if (planck > held) return call.refuse('Enter an amount within what this account holds')
    if (!parts) return false

    return call.run(
      parts.map((part) => voter.submit(delegating(part, terms, checked.target, planck), call.password)),
      { again: (failed) => ({ terms: { ...terms, tracks: tracksOf(failed) } }) },
    )
  }

  return (
    <CallPage
      title="Delegate votes"
      submitLabel="Sign and send"
      busy={call.busy}
      disabled={terms.tracks.length > 0 && !parts}
      aside={tabs}
      footNote={`${formatAmount(held, { precision: 2 })} ${symbol} held`}
      from={voter.signer.address}
      needsPassword={voter.needsPassword}
      operation={(parts ?? [terms.tracks]).map((part) => voter.wrap(probe(part)))}
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
 * Each account delegates all it holds under the one password, every signature
 * made at once and sent together, so one account the chain turns down holds up
 * none of the others.
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
  const held = heldBy(balances, voter.account)
  const probe = (tracks: number[]) => delegating(tracks, terms, voter.account.address, held)
  const parts = useTrackParts(terms.tracks, (track) => probe([track]))
  const priced = (parts ?? [terms.tracks]).map((part) => voter.wrap(probe(part)))
  const fee = useFeesEstimate(voter.signer.address, priced)
  // The chain takes the fee before the call runs, and the lock leaves nothing for
  // the next part's fee, so an account paying its own keeps twice its fees back
  const lockable = (account: Account) => {
    const own = account === voter.account && voter.signer !== account ? 0n : 2n * (fee ?? 0n)
    const left = heldBy(balances, account) - own
    return left > 0n ? left : 0n
  }

  // The lone pick may be a multisig or a proxied account, which signs through somebody
  const submitAs = (account: Account, operation: Operation) =>
    account === voter.account
      ? voter.submit(operation, call.password)
      : send(account, operation, call.password)

  const form = () => {
    const checked = checkTerms(terms, picked)
    if ('problem' in checked) return call.refuse(checked.problem)
    if (!parts) return false

    return call.run(
      picked.flatMap((account) =>
        parts.map((part) =>
          submitAs(account, delegating(part, terms, checked.target, lockable(account))),
        ),
      ),
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
      disabled={(terms.tracks.length > 0 && !parts) || fee === undefined}
      aside={tabs}
      from={voter.signer.address}
      needsPassword={many ? picked.some(needsPassword) : voter.needsPassword}
      times={picked.length}
      {...(many && { note: 'Unlocks each account for its signatures' })}
      operation={priced}
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
  const ending = (tracks: number[]) =>
    batched(tracks.map((track) => ({ kind: 'undelegate' as const, track })))
  const parts = useTrackParts(chosen, (track) => ending([track]))

  const form = () => {
    if (chosen.length === 0) return call.refuse('Pick at least one track')
    if (!parts) return false

    return call.run(
      parts.map((part) => submit(ending(part), call.password)),
      { again: (failed) => ({ tracks: tracksOf(failed) }) },
    )
  }

  return (
    <CallModal
      title="Take a delegation back"
      submitLabel="Sign and send"
      busy={call.busy}
      disabled={chosen.length > 0 && !parts}
      from={signer.address}
      needsPassword={needsPassword}
      operation={(parts ?? [chosen]).map((part) => wrap(ending(part)))}
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
