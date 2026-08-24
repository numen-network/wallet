import { useState } from 'react'
import { AccountPassword, FeeLine } from '@/accounts/Authorize'
import { refundsSubmission, type NotedPreimage, type Settled, type Spend } from '@/chain/governance'
import { useSymbol } from '@/chain/queries'
import { batched, type Operation } from '@/chain/types'
import { formatAmount } from '@/lib/balance'
import { VaultError } from '@/signing/vault'
import { FieldError, Modal } from '@/ui/Modal'
import { toast } from '@/ui/Toast'
import { useVoter, VoterField, type Voters } from './Voter'

/**
 * The whole of a list in one signature. Both of these stand next to a board
 * where every card carries the same button, and pressing it a card at a time is
 * the chore they take away.
 */

const count = (many: number, noun: string) => `${many} ${noun}${many === 1 ? '' : 's'}`

interface Plan {
  calls: Operation[]
  /** What the chain hands over, which is the number worth saying out loud. */
  worth: bigint
  says: string
}

/**
 * The plan is a function of whoever signs, since some of these calls are only
 * the depositor's to make and the list has to say so as the picker moves.
 */
function Sweep({
  title,
  plan,
  accounts,
  onClose,
}: {
  title: string
  plan: (signer: string) => Plan
  accounts: Voters
  onClose: () => void
}) {
  const symbol = useSymbol()
  const [address, setAddress] = useState(accounts[0].address)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const voter = useVoter(accounts, address)
  const { calls, worth, says } = plan(voter.account.address)
  const operation = batched(calls)

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
      title={title}
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy || calls.length === 0}
      footNote={`${formatAmount(worth, { precision: 0 })} ${symbol} over ${count(calls.length, 'call')}`}
      onClose={onClose}
      onSubmit={() => {
        setError('')
        void send()
        return false
      }}
    >
      <p className="text-[13.5px] text-lead">{says}</p>

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

/** Every spend whose window is open, which anybody may claim for whoever is owed it. */
export function ClaimAllModal({
  spends,
  accounts,
  onClose,
}: {
  spends: Spend[]
  accounts: Voters
  onClose: () => void
}) {
  return (
    <Sweep
      title="Claim every ready spend"
      accounts={accounts}
      onClose={onClose}
      plan={() => ({
        calls: spends.map((spend) => ({ kind: 'payout', spend: spend.index })),
        worth: spends.reduce((sum, spend) => sum + spend.amount, 0n),
        says: `The treasury has booked ${count(spends.length, 'payment')} nobody has claimed yet. Anybody may claim one and the money still goes only where the referendum sent it, so this costs whoever signs the fee and nothing else.`,
      })}
    />
  )
}

/**
 * Every deposit the chain is still holding over a referendum that is finished.
 * A refund goes back to whoever put it down whoever asks for it, but a preimage
 * is only its own noter's to clear, so that half of the list follows the signer.
 */
export function ReturnAllModal({
  settled,
  preimages,
  accounts,
  onClose,
}: {
  settled: Settled[]
  preimages: NotedPreimage[]
  accounts: Voters
  onClose: () => void
}) {
  const refunds: Operation[] = settled.flatMap((entry) => [
    ...(entry.decision ? [{ kind: 'refundDecision' as const, poll: entry.index }] : []),
    ...(entry.submission && refundsSubmission(entry)
      ? [{ kind: 'refundSubmission' as const, poll: entry.index }]
      : []),
  ])

  const owed = settled.reduce(
    (sum, entry) =>
      sum +
      (entry.decision?.amount ?? 0n) +
      (entry.submission && refundsSubmission(entry) ? entry.submission.amount : 0n),
    0n,
  )

  return (
    <Sweep
      title="Return every deposit"
      accounts={accounts}
      onClose={onClose}
      plan={(signer) => {
        const mine = preimages.filter((preimage) => preimage.who === signer)
        return {
          calls: [
            ...refunds,
            ...mine.map((preimage) => ({ kind: 'unnotePreimage' as const, hash: preimage.hash })),
          ],
          worth: owed + mine.reduce((sum, preimage) => sum + preimage.amount, 0n),
          says: `${count(refunds.length, 'deposit')} from finished referenda, and ${count(mine.length, 'preimage')} this account noted. Each one goes back to whoever put it down, and only its own noter may clear a preimage.`,
        }
      }}
    />
  )
}
