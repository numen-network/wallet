import { useState } from 'react'
import { AccountPassword, FeeLine, SignerField } from '@/accounts/Authorize'
import {
  trackFor,
  trackLabel,
  TITLE_MAX,
  type Held,
  type NotedPreimage,
  type Referendum,
  type Spend,
} from '@/chain/governance'
import { isQualified, shortfall } from '@/chain/identity'
import { useFacts, useStanding, useSymbol, useTracks } from '@/chain/queries'
import { resolveAddress, shorten } from '@/lib/address'
import { amountInput, AmountError, formatAmount, parseAmount } from '@/lib/balance'
import { VaultError } from '@/signing/vault'
import { useDraft } from '@/ui/draft'
import { Field, FieldError, Input, Modal, Textarea } from '@/ui/Modal'
import { toast } from '@/ui/Toast'
import { useVoter, VoterField, type Voters } from './Voter'
import { AddressField } from '@/accounts/AddressField'

/**
 * Every track on this chain is a spender track, so a referendum asks the
 * treasury for money and nothing else. The track follows from the amount, since
 * the cheapest one that can release it is the one to ask on.
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
  const [draft, patch, sent] = useDraft('propose', {
    address: accounts[0].address,
    title: '',
    description: '',
    amount: '',
    /** Null until somebody types one, which is what lets it follow the signer. */
    beneficiary: null as string | null,
  })
  const { address, title, description, amount, beneficiary } = draft
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const voter = useVoter(accounts, address)
  const account = voter.account
  const { data: standing } = useStanding(address)
  const qualified = isQualified(standing ?? null)

  // Most of these ask the treasury to pay whoever opened them, so the box
  // follows the signer until somebody types over it and takes it over for good
  const paidTo = beneficiary ?? address

  let asked = 0n
  try {
    asked = amount ? parseAmount(amount) : 0n
  } catch {
    asked = 0n
  }
  const track = facts ? trackFor(asked, facts.spenders) : null
  const deposit = tracks?.find((entry) => entry.id === track)?.decisionDeposit ?? 0n

  const form = () => {
    setError('')

    if (!qualified) {
      setError('This account does not clear the identity standard')
      return false
    }

    if (title.trim() === '') {
      setError('Give it a title, since that is what the list shows')
      return false
    }

    let planck = 0n
    try {
      planck = parseAmount(amount)
    } catch (problem) {
      setError(problem instanceof AmountError ? problem.message : 'Enter an amount')
      return false
    }

    if (planck <= 0n || track === null) {
      const biggest = (facts?.spenders ?? []).reduce(
        (most, spender) => (spender.cap > most ? spender.cap : most),
        0n,
      )
      setError(`One referendum can ask for at most ${formatAmount(biggest, { precision: 0 })}`)
      return false
    }

    const target = resolveAddress(paidTo)
    if (!target) {
      setError('Enter the Numen or EVM address the money would go to')
      return false
    }

    void send(planck, target, track)
    return false
  }

  const send = async (planck: bigint, target: string, id: number) => {
    setBusy(true)
    try {
      await voter.submit(
        { kind: 'propose', track: id, amount: planck, beneficiary: target, title, description },
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
    <Modal
      title="Open a referendum"
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy || !qualified}
      width={650}
      footNote={
        track === null ? undefined : `${trackLabel(tracks, track)}, decision deposit ${formatAmount(deposit, { precision: 0 })} ${symbol}`
      }
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-lead">
        A referendum here asks the treasury to pay somebody. Which track it runs on follows from how
        much it asks for, and the bigger the ask the longer it runs and the more it costs to start
        deciding.
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

        <Field label="Description">
          <Textarea
            value={description}
            rows={6}
            placeholder="The case for it"
            onChange={(event) => patch({ description: event.target.value })}
          />
        </Field>

        <VoterField
          accounts={accounts}
          voter={voter}
          onChange={(next: string) => patch({ address: next })}
        />

        {!qualified && (
          <p className="mt-2.5 text-[12.5px] text-bad">
            Only an account whose identity a registrar has checked may open one.{' '}
            {shortfall(standing ?? null)}.
          </p>
        )}

        <Field label="Amount">
          <Input
            value={amount}
            inputMode="decimal"
            placeholder={`0.0 ${symbol}`}
            autoComplete="off"
            onChange={(event) => patch({ amount: amountInput(event.target.value) })}
          />
        </Field>

        <AddressField
          label="Paid to"
          value={paidTo}
          onChange={(next: string) => patch({ beneficiary: next })}
          accounts={accounts}
        />

        {voter.needsPassword && (
          <AccountPassword
            value={password}
            note="Unlocks this account for one signature"
            onChange={setPassword}
          />
        )}
      </div>

      <FieldError>{error}</FieldError>

      <p className="mt-2.5 text-[12.5px] text-dim">
        Opening it holds a submission deposit, and putting the text on chain holds a smaller one
        that grows with its length. Nothing starts deciding until somebody also places the decision
        deposit, which can be you or anybody else.
      </p>

      {track !== null && (
        <FeeLine
          from={voter.signer.address}
          operation={voter.wrap({
            kind: 'propose',
            track,
            amount: asked,
            beneficiary: address,
            title,
            description,
          })}
        />
      )}
    </Modal>
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
    <Modal
      title="Clear the preimage"
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      footNote={`${formatAmount(preimage.amount, { precision: 2 })} ${symbol} back to ${shorten(preimage.who)}`}
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-lead">
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
    <Modal
      title={`Return the ${what} deposit`}
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      footNote={`${formatAmount(held.amount, { precision: 0 })} ${symbol} to ${shorten(held.who)}`}
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-lead">
        Referendum {poll} is over and the chain is still holding this. It goes back to the account
        that put it down whoever asks for it, so signing costs the fee and nothing else.
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
    <Modal
      title={`Pay out spend ${spend.index}`}
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      footNote={`${formatAmount(spend.amount, { precision: 2 })} ${symbol} to ${shorten(spend.beneficiary)}`}
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-lead">
        The referendum booked this and left the money where it was. Whoever signs pays only the fee,
        the amount comes out of the treasury and goes to the beneficiary either way.
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
    <Modal
      title={`Start referendum ${referendum.index} deciding`}
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      footNote={
        deposit === null
          ? undefined
          : `${trackLabel(tracks, referendum.track)}, decision deposit ${formatAmount(deposit, { precision: 0 })} ${symbol}`
      }
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-lead">
        Nothing is counted until the decision deposit is down. The track sets what it costs, so
        there is no amount to pick here. It is held for the length of the referendum and returned
        afterwards, and it need not come from whoever opened it.
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
