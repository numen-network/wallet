import { useId, useRef, useState, type ReactNode } from 'react'
import { useFeesEstimate, useSplit, useSymbol, useTracks } from '@/chain/queries'
import { batched, totalOf, type AccountBalance, type Conviction, type Operation } from '@/chain/types'
import { resolveAddress } from '@/lib/address'
import { amountProblem, formatAmount, parseAmount } from '@/lib/balance'
import { cn } from '@/lib/cn'
import { Checkbox } from '@/components/ui/checkbox'
import { Field as Row, FieldLabel, FieldSet } from '@/components/ui/field'
import { LEDE, ModalFrame } from '@/ui/Modal'
import { TabBar, TabPanel, Tabs, type TabOption } from '@/ui/Tabs'
import { useVoter, VoterField, type Voters } from '@/governance/Voter'
import { AccountsList, TICK_BOX, TickHead } from './AccountsList'
import { AddressField } from './AddressField'
import { AmountField } from './AmountField'
import { CallModal, CallPage, SignerField, useCall, useSend, useSigning } from './Authorize'
import { ConvictionField } from './ConvictionField'
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
  const [mode, setMode] = useState<Mode>('single')
  const [terms, setAll] = useState<Terms>({ tracks: [], to: props.to, conviction: 'Locked1x' })
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
  const [address, setAddress] = useState(from)
  const voter = useVoter(delegators, address)
  const [amount, setAmount] = useState('')
  const call = useCall(onClose)
  const held = heldBy(balances, voter.account)
  const probe = (tracks: number[]) => delegating(tracks, terms, voter.account.address, held)
  const tracks = useTrackParts(terms.tracks, (track) => probe([track]))

  const form = () => {
    const checked = checkTerms(terms, [voter.account])
    if ('problem' in checked) return call.refuse(checked.problem)

    const problem = amountProblem(amount)
    if (problem) return call.refuse(problem)
    const planck = parseAmount(amount)
    if (planck > held) return call.refuse('Enter an amount within what this account holds')
    return call.run(
      tracks.send(voter.account, (part) =>
        voter.submit(delegating(part, terms, checked.target, planck), call.password),
      ),
      'Delegation sent',
    )
  }

  return (
    <CallPage
      title="Delegate votes"
      submitLabel="Sign and send"
      busy={call.busy}
      disabled={terms.tracks.length > 0 && !tracks.parts}
      aside={tabs}
      footNote={`${formatAmount(held, { precision: 2 })} ${symbol} held`}
      from={voter.signer.address}
      needsPassword={voter.needsPassword}
      operation={(tracks.parts ?? [terms.tracks]).map((part) => voter.wrap(probe(part)))}
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
 * Each account delegates all it holds, one signature after another under the
 * one password. The ones already out leave the pick, so a retry after a refusal
 * sends only the rest.
 */
function DelegateMany({ delegators, accounts, balances, from, onClose, tabs, terms, setTerms }: PageProps) {
  const [picked, setPicked] = useState<Voters>(() => [
    delegators.find((entry) => entry.address === from) ?? delegators[0],
  ])
  const voter = useVoter(delegators, picked[0].address)
  const send = useSend()
  const call = useCall(onClose)
  const many = picked.length > 1
  const held = heldBy(balances, voter.account)
  const probe = (tracks: number[]) => delegating(tracks, terms, voter.account.address, held)
  const tracks = useTrackParts(terms.tracks, (track) => probe([track]))
  const priced = (tracks.parts ?? [terms.tracks]).map((part) => voter.wrap(probe(part)))
  const fee = useFeesEstimate(voter.signer.address, priced)
  // The chain takes the fee before the call runs, and the lock leaves nothing for
  // the next part's fee, so an account paying its own keeps twice its fees back
  const lockable = (account: Account) => {
    const own = account === voter.account && voter.signer !== account ? 0n : 2n * (fee ?? 0n)
    const left = heldBy(balances, account) - own
    return left > 0n ? left : 0n
  }

  // The lone pick may be a multisig or a proxied account, which signs through somebody
  const submitAs = (account: Account) => (operation: Operation) =>
    account === voter.account
      ? voter.submit(operation, call.password)
      : send(account, operation, call.password)

  const sendEach = async (target: string) => {
    let left: Account[] = picked
    for (const account of picked) {
      const planck = lockable(account)
      await tracks
        .send(account, (part) => submitAs(account)(delegating(part, terms, target, planck)))
        .catch((problem: unknown) => {
          // An empty message is a refusal the chain dialog already shows
          throw problem instanceof Error && problem.message
            ? new Error(`${account.name}: ${problem.message}`)
            : problem
        })
      left = left.filter((entry) => entry !== account)
      const [next, ...rest] = left
      if (next) setPicked([next, ...rest])
    }
  }

  const form = () => {
    const checked = checkTerms(terms, picked)
    if ('problem' in checked) return call.refuse(checked.problem)
    return call.run(
      sendEach(checked.target),
      many ? `Delegated from ${picked.length} accounts` : 'Delegation sent',
    )
  }

  return (
    <CallPage
      title="Delegate votes"
      submitLabel="Sign and send"
      busy={call.busy}
      disabled={(terms.tracks.length > 0 && !tracks.parts) || fee === undefined}
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
        onChange={setPicked}
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
  const [chosen, setChosen] = useState<number[]>([])
  const call = useCall(onClose)
  const ending = (tracks: number[]) =>
    batched(tracks.map((track) => ({ kind: 'undelegate' as const, track })))
  const tracks = useTrackParts(chosen, (track) => ending([track]))

  const form = () => {
    if (chosen.length === 0) return call.refuse('Pick at least one track')

    return call.run(tracks.send(account, (part) => submit(ending(part), call.password)))
  }

  return (
    <CallModal
      title="Take a delegation back"
      submitLabel="Sign and send"
      busy={call.busy}
      disabled={chosen.length > 0 && !tracks.parts}
      from={signer.address}
      needsPassword={needsPassword}
      operation={(tracks.parts ?? [chosen]).map((part) => wrap(ending(part)))}
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
