import { useState } from 'react'
import { trackLabel, type ClassLock } from '@/chain/governance'
import { useFacts, useHead, useLocks, useReferenda, useSymbol, useTracks } from '@/chain/queries'
import { batched, type Operation } from '@/chain/types'
import { formatAmount } from '@/lib/balance'
import { waitFor } from '@/lib/blocks'
import { VaultError } from '@/signing/vault'
import { FieldError, Modal } from '@/ui/Modal'
import { toast } from '@/ui/Toast'
import { AccountPassword, FeeLine, SignerField, useSigning } from './Authorize'
import type { Account } from './types'

const plural = (many: number, noun: string) => `${many} ${noun}${many === 1 ? '' : 's'}`

/**
 * A vote holds its balance past the referendum by whatever the conviction said,
 * and the chain hands none of it back on its own. Somebody has to take each
 * vote off a finished referendum and then ask, per track, which is one signature
 * over the lot rather than one apiece.
 */
export function UnlockModal({
  account,
  signers,
  onClose,
}: {
  account: Account
  signers: Account[]
  onClose: () => void
}) {
  const symbol = useSymbol()
  const { data: tracks } = useTracks()
  const { data: locks } = useLocks(account.address)
  const { data: referenda } = useReferenda()
  const { data: facts } = useFacts()
  const head = useHead()
  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const height = head?.number ?? 0
  const held = locks ?? []
  // A vote on a referendum that is still running is a say somebody still has,
  // and none of this is worth taking that away
  const live = new Set((referenda ?? []).map((entry) => entry.index))
  const counting = (lock: ClassLock) => lock.polls.filter((poll) => live.has(poll))
  const finished = (lock: ClassLock) => lock.polls.filter((poll) => !live.has(poll))

  const why = (lock: ClassLock): string | null => {
    const still = counting(lock).length
    if (still > 0) return `${plural(still, 'vote')} on a referendum still running`
    if (lock.freeAt > height)
      return facts
        ? `${waitFor(lock.freeAt - height, facts.blockSeconds)} left on the conviction`
        : 'still held by the conviction'
    return null
  }

  const calls: Operation[] = [
    ...held.flatMap((lock) =>
      finished(lock).map((poll) => ({ kind: 'removeVote' as const, track: lock.track, poll })),
    ),
    // Nothing frees a track another vote is still holding, so it is left alone
    ...held
      .filter((lock) => counting(lock).length === 0)
      .map((lock) => ({ kind: 'unlock' as const, track: lock.track, target: account.address })),
  ]
  const operation = batched(calls)

  const form = () => {
    setError('')

    if (calls.length === 0) {
      setError('Nothing is free to unlock yet')
      return false
    }

    void send()
    return false
  }

  const send = async () => {
    setBusy(true)
    try {
      await submit(operation, password)
      toast('Sent')
      onClose()
    } catch (problem) {
      if (problem instanceof VaultError) setError(problem.message)
      else setError(problem instanceof Error ? problem.message : 'The chain kept the lock')
    } finally {
      setBusy(false)
    }
  }

  const takes = calls.filter((call) => call.kind === 'removeVote').length

  return (
    <Modal
      title="Release vote locks"
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      onClose={onClose}
      onSubmit={form}
    >
      {held.length === 0 ? (
        <p className="text-[13.5px] text-lead">{account.name} has nothing locked behind a vote.</p>
      ) : (
        <>
          <ul className="rounded-[6px] border border-line bg-recess">
            {held.map((lock) => {
              const blocking = why(lock)
              return (
                <li
                  key={lock.track}
                  className="flex items-baseline gap-2 border-t border-line px-2.5 py-1.5 first:border-t-0"
                >
                  <span className="flex-1 text-[13px] font-semibold">
                    {trackLabel(tracks, lock.track)}
                  </span>
                  <span className="font-mono text-[12.5px]">
                    {formatAmount(lock.amount, { precision: 2 })} {symbol}
                  </span>
                  <span className={`text-[11.5px] ${blocking ? 'text-dim' : 'text-accent'}`}>
                    {blocking ?? 'free'}
                  </span>
                </li>
              )
            })}
          </ul>

          {takes > 0 && (
            <p className="mt-2.5 text-[12.5px] text-lead">
              This takes back {plural(takes, 'vote')} on referenda that are over, since the chain
              counts a vote as holding the balance until somebody says otherwise. A vote on anything
              still running stays where it is.
            </p>
          )}
        </>
      )}

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />

      {needsPassword && (
        <AccountPassword
          value={password}
          note="Unlocks this account for one signature"
          onChange={setPassword}
        />
      )}
      <FieldError>{error}</FieldError>

      {calls.length > 0 && <FeeLine from={signer.address} operation={wrap(operation)} />}
    </Modal>
  )
}
