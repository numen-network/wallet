import { useState } from 'react'
import { CallModal, SignerField } from '@/accounts/Authorize'
import {
  dumpBytes,
  metadataDump,
  shutsTooSoon,
  trackFor,
  trackLabel,
  TITLE_MAX,
  type Held,
  type NotedPreimage,
  type Payout,
  type Referendum,
  type Spend,
} from '@/chain/governance'
import { isQualified, shortfall } from '@/chain/identity'
import { format, parseISO } from 'date-fns'
import { useFacts, useHead, useStanding, useSymbol, useTracks } from '@/chain/queries'
import { resolveAddress, shorten } from '@/lib/address'
import { amountInput, AmountError, formatAmount, parseAmount } from '@/lib/balance'
import { daySpan, waitFor } from '@/lib/blocks'
import { VaultError } from '@/signing/vault'
import { Button, IconButton } from '@/ui/Button'
import { useDraft } from '@/ui/draft'
import { Figure } from '@/ui/Figure'
import { BOX, Field, Input, Textarea } from '@/ui/Modal'
import { toast } from '@/ui/Toast'
import { useVoter, VoterField, type Voters } from './Voter'
import { PlusIcon, TrashIcon } from '@/ui/icons'
import { AddressField } from '@/accounts/AddressField'

/** One row of the payout list, as typed rather than as the chain takes it. */
interface PayoutDraft {
  to: string
  amount: string
  /** The day the treasury may let it go, empty for one that pays on enactment. */
  on: string
}

const BLANK: PayoutDraft = { to: '', amount: '', on: '' }

const COLUMNS = 'grid grid-cols-[1fr_9rem_9rem_28px] gap-x-2'

const stamp = (on: Date) => format(on, 'yyyy-MM-dd')

/**
 * Every track on this chain is a spender track, so a referendum asks the
 * treasury for money and nothing else. The track follows from the amount, since
 * the cheapest one that can release it is the one to ask on. Several payouts
 * off one referendum is how a grant is paid against milestones.
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
  const head = useHead()
  const [draft, patch, sent] = useDraft('propose', {
    address: accounts[0].address,
    title: '',
    description: '',
    // Most proposals pay whoever opens them, so the first row starts there
    payouts: [{ ...BLANK, to: accounts[0].address }] as PayoutDraft[],
  })
  const { address, title, description, payouts } = draft
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const voter = useVoter(accounts, address)
  const account = voter.account
  const { data: standing } = useStanding(address)
  const qualified = isQualified(standing ?? null)

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
    let planck = 0n
    try {
      planck = row.amount ? parseAmount(row.amount) : 0n
    } catch {
      return []
    }
    const target = resolveAddress(row.to)
    if (planck <= 0n || !target) return []
    return [{ amount: planck, beneficiary: target, validFrom: release(row) }]
  })

  const asked = booked.reduce((sum, payout) => sum + payout.amount, 0n)
  // The track has to clear the whole ask. Sizing it off the largest single
  // payout would let instalments walk a big spend onto a small track
  const track = facts ? trackFor(asked, facts.spenders) : null
  const running = tracks?.find((entry) => entry.id === track)
  const trackName = track === null ? 'Over every cap' : trackLabel(tracks, track)
  // Held by the submit call itself, so the track it lands on never changes it
  const depositLine = facts
    ? `${formatAmount(facts.submissionDeposit, { precision: 0 })} ${symbol}`
    : '…'
  // What the whole dump weighs and what it holds until the bytes are cleared
  const bytes = dumpBytes(metadataDump(title, description))
  const textCost = facts
    ? `${bytes.toLocaleString('en-US')} bytes · holds ${formatAmount(BigInt(bytes) * facts.preimageByteDeposit, { precision: 2 })} ${symbol}`
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

  const form = () => {
    setError('')

    // Without a head every date reads as no date at all, which would sign away
    // the schedule and pay the lot at once
    if (!head || !facts) {
      setError('Still reading the chain, so give it a moment')
      return false
    }

    if (!qualified) {
      setError('This account does not clear the identity standard')
      return false
    }

    if (title.trim() === '') {
      setError('Give it a title, since that is what the list shows')
      return false
    }

    if (bytes > facts.preimageMaxSize) {
      setError(`The text is ${bytes.toLocaleString('en-US')} bytes and the chain takes at most ${facts.preimageMaxSize.toLocaleString('en-US')}`)
      return false
    }

    if (booked.length !== payouts.length) {
      // A named complaint about an amount beats the general one
      for (const row of payouts) {
        try {
          parseAmount(row.amount)
        } catch (problem) {
          if (problem instanceof AmountError) {
            setError(problem.message)
            return false
          }
        }
      }
      setError('Every payout needs an amount and an address to pay it to')
      return false
    }

    if (track === null) {
      const biggest = (facts?.spenders ?? []).reduce(
        (most, spender) => (spender.cap > most ? spender.cap : most),
        0n,
      )
      setError(`One referendum can ask for at most ${formatAmount(biggest, { precision: 0 })}`)
      return false
    }

    // pallet_treasury throws out a spend whose claim window has already shut by
    // the time the referendum enacts, and batch_all takes the rest down with it
    const shut = booked.some((payout) =>
      shutsTooSoon(payout.validFrom, head.number, runsFor, facts.payoutPeriod),
    )
    if (shut) {
      const least = daySpan(Math.max(0, runsFor - facts.payoutPeriod), facts.blockSeconds)
      setError(`A payout has to be dated at least ${least} out, or its claim window shuts before the referendum enacts`)
      return false
    }

    void send(booked, track)
    return false
  }

  const send = async (asking: Payout[], id: number) => {
    setBusy(true)
    try {
      await voter.submit(
        { kind: 'propose', track: id, payouts: asking, title, description },
        password,
      )
      toast('Sent')
      sent()
      onClose()
    } catch (problem) {
      if (problem instanceof VaultError) setError(problem.message)
      else setError(problem instanceof Error ? problem.message : 'The chain refused it')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CallModal
      title="Open a referendum"
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy || !qualified || !head || !facts}
      width={760}
      from={voter.signer.address}
      needsPassword={voter.needsPassword}
      operation={track !== null ? voter.wrap({ kind: 'propose', track, payouts: booked, title, description, }) : null}
      password={password}
      onPassword={setPassword}
      error={error}
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-muted-foreground">
        A referendum here asks the treasury to pay somebody, in one go or against milestones. Which
        track it runs on follows from the whole ask, and the bigger the ask the longer it runs and
        the more it costs to start deciding.
      </p>

      {/* What the referendum says, then what it does */}
      <div className="mt-3.5">
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

        <div className={`mt-4 ${COLUMNS}`}>
          <span className="caption">Address</span>
          <span className="caption">Amount</span>
          <span className="caption">Release</span>
          <span />
        </div>

        {payouts.map((row, index) => (
          <div key={index} className={`mt-1.5 items-start ${COLUMNS}`}>
            <AddressField
              label={`Address ${index + 1}`}
              value={row.to}
              onChange={(next: string) => editPayout(index, { to: next })}
              accounts={accounts}
              className="w-full"
              labelled={false}
            />

            <Input
              value={row.amount}
              inputMode="decimal"
              placeholder="0.0"
              autoComplete="off"
              aria-label={`Amount ${index + 1}`}
              className={`px-3 py-2 font-mono ${BOX}`}
              onChange={(event) => editPayout(index, { amount: amountInput(event.target.value) })}
            />

            <Input
              type="date"
              value={row.on}
              min={earliest}
              aria-label={`Release date for payout ${index + 1}`}
              className={`px-3 py-2 ${BOX}`}
              onChange={(event) => editPayout(index, { on: event.target.value })}
            />

            <IconButton
              type="button"
              aria-label={`Remove payout ${index + 1}`}
              className="mt-1"
              onClick={() => {
                // Removing the only payout leaves a blank one, so the form never goes empty
                const rest = payouts.filter((_row, at) => at !== index)
                patch({ payouts: rest.length > 0 ? rest : [BLANK] })
              }}
            >
              <TrashIcon />
            </IconButton>

            {/* What the date works out to, which is the block the call carries */}
            <span className="col-span-3 text-right text-[11.5px] text-dim">{untilOf(row)}</span>
          </div>
        ))}

        <Button
          type="button"
          className="mt-2.5"
          onClick={() => patch({ payouts: [...payouts, BLANK] })}
        >
          <PlusIcon />
          Add
        </Button>
      </div>

      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        <Figure label="Track" value={trackName} />
        <Figure label="Submission deposit" value={depositLine} />
      </div>

      <p className="mt-2.5 text-[12.5px] text-dim">
        Opening it holds a submission deposit, and putting the text on chain holds a smaller one
        that grows with its length. Nothing starts deciding until somebody also places the decision
        deposit, which can be you or anybody else.
      </p>

      {payouts.length > 1 && facts && track !== null && (
        <p className="mt-2 text-[12.5px] text-dim">
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
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
    ? `${bytes.toLocaleString('en-US')} bytes · holds ${formatAmount(BigInt(bytes) * facts.preimageByteDeposit, { precision: 2 })} ${symbol}`
    : null
  const oldBytes = clear
    ? 'The old bytes come off in the same signature and their deposit comes back.'
    : referendum.metadataHash
      ? 'The old bytes stay up, since only the account that noted them may clear them.'
      : null

  const form = () => {
    setError('')

    if (title.trim() === '') {
      setError('Give it a title, since that is what the list shows')
      return false
    }

    if (facts && bytes > facts.preimageMaxSize) {
      setError(`The text is ${bytes.toLocaleString('en-US')} bytes and the chain takes at most ${facts.preimageMaxSize.toLocaleString('en-US')}`)
      return false
    }

    // The chain refuses to note the very same bytes twice, and there is
    // nothing to change anyway
    if (metadataDump(title, description) === metadataDump(referendum.title ?? '', referendum.description ?? '')) {
      setError('It already says exactly that')
      return false
    }

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
      else setError(problem instanceof Error ? problem.message : 'The chain refused it')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CallModal
      title={`Edit the text of referendum ${referendum.index}`}
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy || !facts}
      from={voter.signer.address}
      needsPassword={voter.needsPassword}
      operation={voter.wrap(operation)}
      password={password}
      onPassword={setPassword}
      error={error}
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-muted-foreground">
        This referendum is still running, so the account that opened it may swap what it says.
        What it pays and whom it pays are settled and stay settled. This rewrites the pitch and
        nothing else.
      </p>

      <p className="mt-2.5 text-[12.5px] text-dim">
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
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Only the noter is allowed, so there is nobody to choose between
  const voter = useVoter(accounts, preimage.who)
  const account = voter.account
  const operation = { kind: 'unnotePreimage', hash: preimage.hash } as const

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
      else setError(problem instanceof Error ? problem.message : 'The chain refused it')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CallModal
      title="Clear the preimage"
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      footNote={`${formatAmount(preimage.amount, { precision: 2 })} ${symbol} back to ${shorten(preimage.who)}`}
      from={voter.signer.address}
      needsPassword={voter.needsPassword}
      operation={voter.wrap(operation)}
      password={password}
      onPassword={setPassword}
      error={error}
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-muted-foreground">
        {preimage.len.toLocaleString('en-US')} bytes are on chain at this account's expense. Clearing
        them takes the bytes off and gives the deposit back, and only the account that put them
        there may ask, so this one signs.
      </p>

      <p className="mt-2.5 text-[12.5px] text-dim">
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
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const voter = useVoter(accounts, address)
  const account = voter.account
  const operation = { kind, poll } as const
  const what = kind === 'refundSubmission' ? 'submission' : 'decision'

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
      else setError(problem instanceof Error ? problem.message : 'The chain refused it')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CallModal
      title={`Return the ${what} deposit`}
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      footNote={`${formatAmount(held.amount, { precision: 0 })} ${symbol} to ${shorten(held.who)}`}
      from={voter.signer.address}
      needsPassword={voter.needsPassword}
      operation={voter.wrap(operation)}
      password={password}
      onPassword={setPassword}
      error={error}
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-muted-foreground">
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
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const voter = useVoter(accounts, address)
  const account = voter.account
  const operation = { kind: 'payout', spend: spend.index } as const

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
      else setError(problem instanceof Error ? problem.message : 'The chain refused it')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CallModal
      title={`Pay out spend ${spend.index}`}
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      footNote={`${formatAmount(spend.amount, { precision: 2 })} ${symbol} to ${shorten(spend.beneficiary)}`}
      from={voter.signer.address}
      needsPassword={voter.needsPassword}
      operation={voter.wrap(operation)}
      password={password}
      onPassword={setPassword}
      error={error}
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-muted-foreground">
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
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const voter = useVoter(accounts, address)
  const account = voter.account
  const operation = { kind: 'decisionDeposit', poll: referendum.index } as const
  // The call takes an index and nothing else, since the track fixes what it costs
  const deposit = tracks?.find((entry) => entry.id === referendum.track)?.decisionDeposit ?? null

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
      else setError(problem instanceof Error ? problem.message : 'The chain refused it')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CallModal
      title={`Start referendum ${referendum.index} deciding`}
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      footNote={
        deposit === null
          ? undefined
          : `${trackLabel(tracks, referendum.track)}, decision deposit ${formatAmount(deposit, { precision: 0 })} ${symbol}`
      }
      from={voter.signer.address}
      needsPassword={voter.needsPassword}
      operation={voter.wrap(operation)}
      password={password}
      onPassword={setPassword}
      error={error}
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-muted-foreground">
        Nothing is counted until the decision deposit is down. The track sets what it costs, so
        there is no amount to pick here. It is held for the length of the referendum and returned
        afterwards, and it need not come from whoever opened it.
      </p>

      <VoterField accounts={accounts} voter={voter} onChange={setAddress} />
    </CallModal>
  )
}
