import { useState } from 'react'
import { CallModal, SignerField, useCall } from '@/accounts/Authorize'
import {
  dumpBytes,
  metadataDump,
  remarkBytes,
  shutsTooSoon,
  trackFor,
  trackLabel,
  TITLE_MAX,
  type Held,
  type Motion,
  type NotedPreimage,
  type Payout,
  type Referendum,
  type Spend,
} from '@/chain/governance'
import { isQualified, shortfall } from '@/chain/identity'
import { parseISO } from 'date-fns'
import {
  useFacts,
  useHead,
  useReferenda,
  useRegistrars,
  useStanding,
  useSymbol,
  useTracks,
  useUsernameAuthorities,
} from '@/chain/queries'
import { cn } from '@/lib/cn'
import { resolveAddress, shorten } from '@/lib/address'
import { amountOrZero, amountProblem, formatAmount } from '@/lib/balance'
import { daySpan, waitFor } from '@/lib/blocks'
import { Button } from '@/components/ui/button'
import { LEDE } from '@/ui/Modal'
import { useDraft } from '@/ui/draft'
import { Figure } from '@/ui/Figure'
import { Field, INSIDE } from '@/ui/Field'
import { Select } from '@/ui/Select'
import { DateField, stamp } from '@/ui/DateField'
import { CAPTION, NOTE } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { useVoter, VoterField, type Voters } from './Voter'
import { Plus, Trash2 } from 'lucide-react'
import { AddressField } from '@/accounts/AddressField'
import { AmountField } from '@/accounts/AmountField'
import {
  IdentityFields,
  missing,
  PollField,
  readIdentity,
  ready,
  type IdentityAct,
  type Reading,
} from './MotionFields'

/** One row of the payout list, as typed rather than as the chain takes it. */
interface PayoutDraft {
  to: string
  amount: string
  /** The day the treasury may let it go, empty for one that pays on enactment. */
  on: string
}

const BLANK: PayoutDraft = { to: '', amount: '', on: '' }

const COLUMNS = 'grid grid-cols-[1fr_176px_168px_28px] gap-x-2'

/** The spender tracks share one entry, since the amount picks among them. */
const SPEND = 'spend'

type Shape = 'spend' | 'remark' | 'identity' | 'cancel' | 'kill'

const SHAPES: Partial<Record<string, Exclude<Shape, 'spend'>>> = {
  WishForChange: 'remark',
  IdentityAdmin: 'identity',
  ReferendumCanceller: 'cancel',
  ReferendumKiller: 'kill',
}

const LEDES: Record<Shape, string> = {
  spend:
    'A referendum here asks the treasury to pay somebody, in one go or against milestones. Which track it runs on follows from the whole ask, and the bigger the ask the longer it runs and the more it costs to start deciding.',
  remark:
    'Nothing runs if this passes, so the title and description are the whole proposal. Any question for the network goes here.',
  identity:
    'Registrars check identities and username authorities hand out usernames. Passing this adds or removes one of them.',
  cancel:
    'If this passes, the referendum picked below stops and both of its deposits can be claimed back.',
  kill: 'If this passes, the referendum picked below stops and both of its deposits are slashed.',
}

/**
 * A spend's track follows from the amount, since the cheapest one that can
 * release it is the one to ask on. Several payouts off one referendum is how a
 * grant is paid against milestones.
 */
export function ProposeModal({
  accounts,
  onClose,
}: {
  accounts: Voters
  onClose: () => void
}) {
  const symbol = useSymbol()
  const { data: tracks } = useTracks()
  const { data: facts } = useFacts()
  const { data: referenda } = useReferenda()
  const { data: registrars } = useRegistrars()
  const { data: authorities } = useUsernameAuthorities()
  const head = useHead()
  const [draft, patch, sent] = useDraft('propose', {
    address: accounts[0].address,
    title: '',
    description: '',
    // Most proposals pay whoever opens them, so the first row starts there
    payouts: [{ ...BLANK, to: accounts[0].address }] as PayoutDraft[],
    pick: SPEND,
    poll: '',
    act: 'addRegistrar' as IdentityAct,
    account: '',
    registrar: null as number | null,
    suffix: '',
    allocation: '',
  })
  const { address, title, description, payouts, pick, poll } = draft
  const call = useCall(onClose)

  const voter = useVoter(accounts, address)
  const { data: standing } = useStanding(address)
  const qualified = isQualified(standing ?? null)

  const offered = (tracks ?? []).flatMap((entry) => {
    const shape = SHAPES[entry.origin]
    return shape ? [{ track: entry, shape }] : []
  })
  const chosen = offered.find((entry) => String(entry.track.id) === pick)
  const picks = [
    { value: SPEND, label: 'Spender' },
    ...offered.map((entry) => ({ value: String(entry.track.id), label: entry.track.name })),
  ]
  const stopping = referenda?.find((referendum) => String(referendum.index) === poll)

  const readMotion = (shape: Exclude<Shape, 'spend'>): Reading => {
    switch (shape) {
      case 'remark':
        return ready({ kind: 'remark', text: metadataDump(title, description) })
      case 'cancel':
        return stopping
          ? ready({ kind: 'cancel', poll: stopping.index })
          : missing('Pick the referendum to stop')
      case 'kill':
        return stopping
          ? ready({ kind: 'kill', poll: stopping.index })
          : missing('Pick the referendum to stop')
      case 'identity':
        return facts
          ? readIdentity(draft, facts.maxSuffixLength, authorities ?? [])
          : missing('Still reading the chain, so give it a moment')
    }
  }

  // Parsed rather than handed to Date, which reads a bare yyyy-MM-dd as UTC and
  // lands on the day before for anybody west of Greenwich
  const startsOn = (row: PayoutDraft): Date | null => (row.on ? parseISO(row.on) : null)

  // The chain holds a payout against a block, so the date has to come back as one
  const release = (row: PayoutDraft): number | null => {
    const on = startsOn(row)
    if (on == null || !head || !facts) return null
    return head.number + Math.round((on.getTime() - Date.now()) / 1000 / facts.blockSeconds)
  }

  // The wait reads easily, the block is what the call actually carries
  const untilOf = (row: PayoutDraft): string => {
    const at = release(row)
    if (at == null || !head || !facts || at <= head.number) return 'immediately'
    return `in ${daySpan(at - head.number, facts.blockSeconds)} · #${at.toLocaleString('en-US')}`
  }

  // Every row that reads as a payout. The form turns anything short of all of
  // them away, so what reaches the chain is what was typed
  const booked: Payout[] = payouts.flatMap((row) => {
    const planck = amountOrZero(row.amount)
    const target = resolveAddress(row.to)
    if (planck <= 0n || !target) return []
    return [{ amount: planck, beneficiary: target, validFrom: release(row) }]
  })

  const asked = booked.reduce((sum, payout) => sum + payout.amount, 0n)
  // The track has to clear the whole ask. Sizing it off the largest single
  // payout would let instalments walk a big spend onto a small track
  const track = chosen ? chosen.track.id : facts ? trackFor(asked, facts.spenders) : null
  const motion: Motion | null = chosen
    ? readMotion(chosen.shape).motion
    : { kind: 'spend', payouts: booked }
  const running = tracks?.find((entry) => entry.id === track)
  const trackName = track === null ? 'Over every cap' : trackLabel(tracks, track)
  // Held by the submit call itself, so the track it lands on never changes it
  const depositLine = facts
    ? `${formatAmount(facts.submissionDeposit, { precision: 0 })} ${symbol}`
    : '…'
  // What the whole dump weighs and what it holds until the bytes are cleared. A
  // remark call carries a second copy, which is noted too
  const bytes = dumpBytes(metadataDump(title, description))
  const noted = chosen?.shape === 'remark' ? [bytes, remarkBytes(bytes)] : [bytes]
  const textCost = facts
    ? `${bytes.toLocaleString('en-US')} bytes · holds ${formatAmount(
        noted.reduce(
          (sum, length) => sum + facts.preimageBaseDeposit + BigInt(length) * facts.preimageByteDeposit,
          0n,
        ),
        { precision: 2 },
      )} ${symbol}`
    : null
  // How long the referendum itself can take before the spends are booked
  const runsFor = running
    ? running.preparePeriod + running.decisionPeriod + running.confirmPeriod + running.minEnactmentPeriod
    : 0

  // The soonest a payout can be dated and still have a claim window left
  const earliest =
    facts && head
      ? stamp(new Date(Date.now() + Math.max(0, runsFor - facts.payoutPeriod) * facts.blockSeconds * 1000))
      : undefined
  const editPayout = (index: number, next: Partial<PayoutDraft>) =>
    patch({ payouts: payouts.map((row, at) => (at === index ? { ...row, ...next } : row)) })

  const propose = (id: number, proposed: Motion) =>
    call.run(
      voter
        .submit({ kind: 'propose', track: id, motion: proposed, title, description }, call.password)
        .then(sent),
    )

  const form = () => {
    // Without a head every date reads as no date at all, which would sign away
    // the schedule and pay the lot at once
    if (!head || !facts) return call.refuse('Still reading the chain, so give it a moment')
    if (!qualified) return call.refuse('This account does not clear the identity standard')

    if (title.trim() === '') {
      return call.refuse('Give it a title, since that is what the list shows')
    }

    if (chosen) {
      const reading = readMotion(chosen.shape)
      return reading.motion === null
        ? call.refuse(reading.problem)
        : propose(chosen.track.id, reading.motion)
    }

    if (booked.length !== payouts.length) {
      // A named complaint about an amount beats the general one
      for (const row of payouts) {
        const problem = amountProblem(row.amount)
        if (problem) return call.refuse(problem)
      }
      return call.refuse('Every payout needs an amount and an address to pay it to')
    }

    if (track === null) {
      const biggest = facts.spenders.reduce(
        (most, spender) => (spender.cap > most ? spender.cap : most),
        0n,
      )
      return call.refuse(`One referendum can ask for at most ${formatAmount(biggest, { precision: 0 })}`)
    }

    // pallet_treasury throws out a spend whose claim window has already shut by
    // the time the referendum enacts, and batch_all takes the rest down with it
    const shut = booked.some((payout) =>
      shutsTooSoon(payout.validFrom, head.number, runsFor, facts.payoutPeriod),
    )
    if (shut) {
      const least = daySpan(Math.max(0, runsFor - facts.payoutPeriod), facts.blockSeconds)
      return call.refuse(`A payout has to be dated at least ${least} out, or its claim window shuts before the referendum enacts`)
    }

    return propose(track, { kind: 'spend', payouts: booked })
  }

  return (
    <CallModal
      title="Open a referendum"
      submitLabel="Sign and send"
      busy={call.busy}
      disabled={!qualified || !head || !facts}
      width={800}
      from={voter.signer.address}
      needsPassword={voter.needsPassword}
      operation={
        track !== null && motion !== null
          ? voter.wrap({ kind: 'propose', track, motion, title, description })
          : null
      }
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      <p className={LEDE}>{LEDES[chosen?.shape ?? 'spend']}</p>

      {/* What the referendum says, then what it does */}
      <div className="mt-3.5">
        <Field label="Track">
          <Select
            value={pick}
            onValueChange={(next) => patch({ pick: next })}
            options={picks}
            label="Track"
            className={INSIDE}
          />
        </Field>

        {chosen?.shape === 'remark' && (
          <p className="mt-2.5 text-[12.5px] text-destructive">
            The title and description also go into the System.remark call, where they can't be
            edited. Check for missing details and typos before you sign.
          </p>
        )}

        <Field label="Title">
          {/* One line of text, which is not the same as one line of box. A
              title long enough to fill the cap only fits by wrapping, and Enter
              would put a break in a field that has nowhere to keep one */}
          <Textarea
            value={title}
            rows={2}
            maxLength={TITLE_MAX}
            className="resize-none"
            placeholder="What it asks for"
            onKeyDown={(event) => event.key === 'Enter' && event.preventDefault()}
            onChange={(event) => patch({ title: event.target.value.replace(/[\r\n]+/g, ' ') })}
          />
        </Field>

        <Field label="Description" aside={textCost}>
          <Textarea
            value={description}
            rows={6}
            placeholder="A short summary of the case"
            onChange={(event) => patch({ description: event.target.value })}
          />
        </Field>

        <VoterField
          accounts={accounts}
          voter={voter}
          onChange={(next: string) => patch({ address: next })}
        />

        {!qualified && (
          <p className="mt-2.5 text-[12.5px] text-destructive">
            Only an account whose identity a registrar has checked may open one.{' '}
            {shortfall(standing ?? null)}.
          </p>
        )}

        {!chosen && (
          <>
            <div className={cn('mt-4', COLUMNS)}>
              <span className={CAPTION}>Address</span>
              <span className={CAPTION}>Amount</span>
              <span className={CAPTION}>Release</span>
              <span />
            </div>

            {payouts.map((row, index) => (
              <div key={index} className={cn('mt-1.5 items-start', COLUMNS)}>
                <AddressField
                  label={`Address ${index + 1}`}
                  value={row.to}
                  onChange={(next: string) => editPayout(index, { to: next })}
                  accounts={accounts}
                  className="w-full"
                  labelled={false}
                />

                <AmountField
                  label={`Amount ${index + 1}`}
                  value={row.amount}
                  onChange={(amount) => editPayout(index, { amount })}
                  labelled={false}
                />

                <DateField
                  label={`Release date for payout ${index + 1}`}
                  value={row.on}
                  min={earliest}
                  onChange={(on: string) => editPayout(index, { on })}
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove payout ${index + 1}`}
                  className="mt-1"
                  onClick={() => {
                    // Removing the only payout leaves a blank one, so the form never goes empty
                    const rest = payouts.filter((_row, at) => at !== index)
                    patch({ payouts: rest.length > 0 ? rest : [BLANK] })
                  }}
                >
                  <Trash2 />
                </Button>

                {/* What the date works out to, which is the block the call carries */}
                <span className="col-span-3 text-right text-[11.5px] text-dim">{untilOf(row)}</span>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              className="mt-2.5"
              onClick={() => patch({ payouts: [...payouts, BLANK] })}
            >
              <Plus />
              Add
            </Button>
          </>
        )}

        {(chosen?.shape === 'cancel' || chosen?.shape === 'kill') && (
          <PollField value={poll} onChange={(next) => patch({ poll: next })} />
        )}

        {chosen?.shape === 'identity' && (
          <IdentityFields
            draft={draft}
            accounts={accounts}
            registrars={registrars ?? []}
            authorities={authorities ?? []}
            maxSuffixLength={facts?.maxSuffixLength}
            onChange={patch}
          />
        )}
      </div>

      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        <Figure label="Track" value={trackName} />
        <Figure label="Submission deposit" value={depositLine} />
      </div>

      <p className={cn('mt-2.5', NOTE)}>
        Opening it holds a submission deposit, and putting the text on chain holds a smaller one
        that grows with its length. Nothing starts deciding until somebody also places the decision
        deposit, which can be you or anybody else.
      </p>

      {!chosen && payouts.length > 1 && facts && track !== null && (
        <p className={cn('mt-2', NOTE)}>
          A date is read against today, not against the day the referendum passes, and this track
          can take {waitFor(runsFor, facts.blockSeconds)} to get there. Each payout is then
          claimable for {waitFor(facts.payoutPeriod, facts.blockSeconds)}, and whatever nobody
          claims stays in the treasury.
        </p>
      )}
    </CallModal>
  )
}

/**
 * A running referendum's text is its opener's to swap, and the call it runs is
 * beyond anybody's reach, so this rewrites the pitch and nothing else.
 */
export function EditTextModal({
  referendum,
  preimages,
  accounts,
  onClose,
}: {
  referendum: Referendum
  preimages: NotedPreimage[]
  accounts: Voters
  onClose: () => void
}) {
  const symbol = useSymbol()
  const { data: facts } = useFacts()
  const [title, setTitle] = useState(referendum.title ?? '')
  const [description, setDescription] = useState(referendum.description ?? '')
  const call = useCall(onClose)

  // set_metadata answers only to whoever opened it, so there is nobody to pick
  const voter = useVoter(accounts, referendum.submitter)
  // The old bytes are only this signature's to clear when this account noted them
  const clear =
    preimages.find(
      (held) => held.hash === referendum.metadataHash && held.who === referendum.submitter,
    )?.hash ?? null
  const operation = {
    kind: 'editMetadata',
    poll: referendum.index,
    title,
    description,
    clear,
  } as const

  const bytes = dumpBytes(metadataDump(title, description))
  const textCost = facts
    ? `${bytes.toLocaleString('en-US')} bytes · holds ${formatAmount(facts.preimageBaseDeposit + BigInt(bytes) * facts.preimageByteDeposit, { precision: 2 })} ${symbol}`
    : null
  const oldBytes = clear
    ? 'The old bytes come off in the same signature and their deposit comes back.'
    : referendum.metadataHash
      ? 'The old bytes stay up, since only the account that noted them may clear them.'
      : null

  const form = () => {
    if (title.trim() === '') {
      return call.refuse('Give it a title, since that is what the list shows')
    }

    // The chain refuses to note the very same bytes twice, and there is
    // nothing to change anyway
    if (metadataDump(title, description) === metadataDump(referendum.title ?? '', referendum.description ?? '')) {
      return call.refuse('It already says exactly that')
    }

    return call.run(voter.submit(operation, call.password))
  }

  return (
    <CallModal
      title={`Edit the text of referendum ${referendum.index}`}
      submitLabel="Sign and send"
      busy={call.busy}
      disabled={!facts}
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
        This referendum is still running, so the account that opened it may swap what it says.
        What it runs is settled and stays settled. This rewrites the pitch and nothing else.
      </p>

      <p className={cn('mt-2.5', NOTE)}>
        The new text holds its own deposit by the byte.
        {oldBytes && ` ${oldBytes}`}
      </p>

      <div className="mt-3.5">
        <Field label="Title">
          <Textarea
            value={title}
            rows={2}
            maxLength={TITLE_MAX}
            className="resize-none"
            placeholder="What it asks for"
            onKeyDown={(event) => event.key === 'Enter' && event.preventDefault()}
            onChange={(event) => setTitle(event.target.value.replace(/[\r\n]+/g, ' '))}
          />
        </Field>

        <Field label="Description" aside={textCost}>
          <Textarea
            value={description}
            rows={6}
            placeholder="A short summary of the case"
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
      </div>

      {/* No account to pick, the chain named one. Who signs for it is still open */}
      <SignerField
        account={voter.account}
        signer={voter.signer}
        bench={voter.bench}
        onChange={voter.choose}
      />
    </CallModal>
  )
}

/**
 * The bytes go and the deposit comes back, and only the account that put them
 * up may do it. The wallet notes one for every referendum it opens, so this is
 * how that money stops being spent on a title nothing points at any more.
 */
export function PreimageModal({
  preimage,
  accounts,
  onClose,
}: {
  preimage: NotedPreimage
  accounts: Voters
  onClose: () => void
}) {
  const symbol = useSymbol()
  const call = useCall(onClose)

  // Only the noter is allowed, so there is nobody to choose between
  const voter = useVoter(accounts, preimage.who)
  const operation = { kind: 'unnotePreimage', hash: preimage.hash } as const

  const form = () => call.run(voter.submit(operation, call.password))

  return (
    <CallModal
      title="Clear the preimage"
      submitLabel="Sign and send"
      busy={call.busy}
      footNote={`${formatAmount(preimage.amount, { precision: 2 })} ${symbol} back to ${shorten(preimage.who)}`}
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
        {preimage.len.toLocaleString('en-US')} bytes are on chain at this account's expense. Clearing
        them takes the bytes off and gives the deposit back, and only the account that put them
        there may ask, so this one signs.
      </p>

      <p className={cn('mt-2.5', NOTE)}>
        Anything still pointing at these bytes loses what they said. A referendum's title lives here
        while it runs, so wait until it is over.
      </p>

      {/* No account to pick, the chain named one. Who signs for it is still open */}
      <SignerField
        account={voter.account}
        signer={voter.signer}
        bench={voter.bench}
        onChange={voter.choose}
      />
    </CallModal>
  )
}

/**
 * Both deposits come back the same way. Anybody may ask for either, and neither
 * goes anywhere but back to the account that put it down, so the only thing the
 * signer decides is when.
 */
export function RefundModal({
  poll,
  held,
  kind,
  accounts,
  onClose,
}: {
  poll: number
  held: Held
  kind: 'refundSubmission' | 'refundDecision'
  accounts: Voters
  onClose: () => void
}) {
  const symbol = useSymbol()
  const [address, setAddress] = useState(accounts[0].address)
  const call = useCall(onClose)

  const voter = useVoter(accounts, address)
  const operation = { kind, poll } as const
  const what = kind === 'refundSubmission' ? 'submission' : 'decision'

  const form = () => call.run(voter.submit(operation, call.password))

  return (
    <CallModal
      title={`Return the ${what} deposit`}
      submitLabel="Sign and send"
      busy={call.busy}
      footNote={`${formatAmount(held.amount, { precision: 0 })} ${symbol} to ${shorten(held.who)}`}
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
        Referendum {poll} is over and the chain is still holding this. It goes back to the account
        that put it down whoever asks for it, so signing costs the fee and nothing else.
      </p>

      <VoterField accounts={accounts} voter={voter} onChange={setAddress} />
    </CallModal>
  )
}

/**
 * A passed referendum books the spend and stops there. This is the call that
 * moves the money, anybody may make it, and it goes nowhere but the beneficiary.
 */
export function PayoutModal({
  spend,
  accounts,
  onClose,
}: {
  spend: Spend
  accounts: Voters
  onClose: () => void
}) {
  const symbol = useSymbol()
  const [address, setAddress] = useState(accounts[0].address)
  const call = useCall(onClose)

  const voter = useVoter(accounts, address)
  const operation = { kind: 'payout', spend: spend.index } as const

  const form = () => call.run(voter.submit(operation, call.password))

  return (
    <CallModal
      title={`Pay out spend ${spend.index}`}
      submitLabel="Sign and send"
      busy={call.busy}
      footNote={`${formatAmount(spend.amount, { precision: 2 })} ${symbol} to ${shorten(spend.beneficiary)}`}
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
        The referendum booked this and left the money where it was. Whoever signs pays only the fee,
        the amount comes out of the treasury and goes to the beneficiary either way.
      </p>

      <VoterField accounts={accounts} voter={voter} onChange={setAddress} />
    </CallModal>
  )
}

/**
 * Anybody may place it, and it comes back whether the referendum passes or not,
 * so long as it is not rejected on a track that slashes.
 */
export function DepositModal({
  referendum,
  accounts,
  onClose,
}: {
  referendum: Referendum
  accounts: Voters
  onClose: () => void
}) {
  const symbol = useSymbol()
  const { data: tracks } = useTracks()
  const [address, setAddress] = useState(accounts[0].address)
  const call = useCall(onClose)

  const voter = useVoter(accounts, address)
  const operation = { kind: 'decisionDeposit', poll: referendum.index } as const
  // The call takes an index and nothing else, since the track fixes what it costs
  const deposit = tracks?.find((entry) => entry.id === referendum.track)?.decisionDeposit ?? null

  const form = () => call.run(voter.submit(operation, call.password))

  return (
    <CallModal
      title={`Start referendum ${referendum.index} deciding`}
      submitLabel="Sign and send"
      busy={call.busy}
      footNote={
        deposit === null
          ? undefined
          : `${trackLabel(tracks, referendum.track)}, decision deposit ${formatAmount(deposit, { precision: 0 })} ${symbol}`
      }
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
        Nothing is counted until the decision deposit is down. The track sets what it costs, so
        there is no amount to pick here. It is held for the length of the referendum and returned
        afterwards, and it need not come from whoever opened it.
      </p>

      <VoterField accounts={accounts} voter={voter} onChange={setAddress} />
    </CallModal>
  )
}
