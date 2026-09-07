import { Fragment } from 'react'
import {
  lockAfter,
  releaseOf,
  trackLabel,
  trackRelease,
  weightOf,
  type CastVote,
  type ClassLock,
} from '@/chain/governance'
import { useFacts, useHead, useLocks, useSymbol, useTracks } from '@/chain/queries'
import { batched, type Operation } from '@/chain/types'
import { formatAmount } from '@/lib/balance'
import { plural } from '@/lib/plural'
import { daySpan } from '@/lib/blocks'
import { cn } from '@/lib/cn'
import { Empty } from '@/components/ui/empty'
import { Item, ItemGroup, ItemSeparator } from '@/components/ui/item'
import { LEDE } from '@/ui/Modal'
import { CallModal, SignerField, useCall, useSigning } from './Authorize'
import type { Account } from './types'

const AMOUNT = 'font-mono text-[11.5px] tabular-nums'
const STATE = 'text-[11.5px] w-[104px] text-right'

/** What to say when a vote is free before its conviction would have let go. */
const FREED: Record<'cancelled' | 'lost', string> = {
  cancelled: 'free, cancelled',
  lost: 'free, losing side',
}

/** How a vote reads back, which is the side it took and the conviction behind it. */
function ballotOf(vote: CastVote): string {
  const sided = vote.side === 'aye' || vote.side === 'nay'
  return sided ? `${vote.side} ${weightOf(vote.conviction)}` : vote.side
}

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
  const { data: facts } = useFacts()
  const head = useHead()
  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const call = useCall(onClose)

  const height = head?.number ?? 0
  const period = facts?.voteLockingPeriod ?? 0
  // Every verdict below needs the locking period, so none of it is worth
  // saying before the chain answers
  const ready = facts !== undefined && locks !== undefined
  const held = locks ?? []
  const stays = (lock: ClassLock) => lockAfter(lock, period, height)
  // A vote on a referendum that is still running is a say somebody still has,
  // and none of this is worth taking that away
  const finished = (lock: ClassLock) => lock.votes.filter((vote) => vote.outcome.kind !== 'running')

  const wait = (blocks: number) =>
    facts ? `${daySpan(blocks, facts.blockSeconds)} left` : 'held by the conviction'

  const trackWord = (lock: ClassLock): string => {
    const release = trackRelease(lock, period, height)
    switch (release.kind) {
      case 'running':
        return `${release.count} running`
      case 'held':
        return wait(release.until - height)
      case 'free':
        return 'free'
    }
  }

  const voteWord = (vote: CastVote): string => {
    const release = releaseOf(vote, period, height)
    switch (release.kind) {
      case 'running':
        return 'still running'
      case 'held':
        return wait(release.until - height)
      case 'free':
        return release.why === null ? 'free' : FREED[release.why]
    }
  }

  const calls: Operation[] = !ready
    ? []
    : [
        ...held.flatMap((lock) =>
          finished(lock).map((vote) => ({
            kind: 'removeVote' as const,
            track: lock.track,
            poll: vote.poll,
          })),
        ),
        // remove_vote leaves the number on the account alone, so a track only
        // lets go once update_lock has run
        ...held
          .filter((lock) => stays(lock) < lock.amount)
          .map((lock) => ({
            kind: 'unlock' as const,
            track: lock.track,
            target: account.address,
          })),
      ]
  const operation = batched(calls)

  const form = () => {
    if (calls.length === 0) return call.refuse('Nothing is free to unlock yet')

    return call.run(submit(operation, call.password))
  }

  const takes = calls.filter((entry) => entry.kind === 'removeVote').length
  // Locks overlap rather than stack, so the account is held by the largest of them
  const most = (amounts: bigint[]) => amounts.reduce((top, one) => (one > top ? one : top), 0n)
  const now = most(held.map((lock) => lock.amount))
  const after = most(held.map(stays))

  return (
    <CallModal
      title="Release vote locks"
      submitLabel="Sign and send"
      busy={call.busy}
      from={signer.address}
      needsPassword={needsPassword}
      operation={calls.length > 0 ? wrap(operation) : null}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      {!ready ? (
        <Empty className="mt-0 p-6">Reading the chain…</Empty>
      ) : held.length === 0 ? (
        <Empty className="mt-0 p-6">No vote is locking anything here.</Empty>
      ) : (
        <>
          <p className={cn(LEDE, 'mb-2.5')}>Each track locks its largest vote, not the sum.</p>

          <ItemGroup variant="outline" className="bg-muted">
            {held.map((lock, index) => (
              <Fragment key={lock.track}>
                {index > 0 && <ItemSeparator />}
                <Item className="flex-col items-stretch gap-1 py-2.5">
                  <div className="flex items-baseline gap-2">
                    <span className="flex-1 text-[13px] font-semibold">
                      {trackLabel(tracks, lock.track)}
                    </span>
                    <span className="font-mono text-[12.5px] tabular-nums">
                      {formatAmount(lock.amount, { precision: 2 })} {symbol}
                    </span>
                    <span className={cn(STATE, 'text-dim')}>{trackWord(lock)}</span>
                  </div>

                  {lock.votes.map((vote) => (
                    <div key={vote.poll} className="flex items-baseline gap-2 pl-4">
                      <span className="flex-1 text-[12px] text-dim">#{vote.poll}</span>
                      <span className={cn(AMOUNT, 'text-dim')}>{ballotOf(vote)}</span>
                      <span className={cn(AMOUNT, 'w-[70px] text-right')}>
                        {formatAmount(vote.amount, { precision: 2 })}
                      </span>
                      <span className={cn(STATE, 'text-dim')}>{voteWord(vote)}</span>
                    </div>
                  ))}

                  {lock.prior.amount > 0n && (
                    <div className="flex items-baseline gap-2 pl-4">
                      <span className="flex-1 text-[12px] text-dim italic">votes taken back</span>
                      <span className={cn(AMOUNT, 'w-[70px] text-right text-dim')}>
                        {formatAmount(lock.prior.amount, { precision: 2 })}
                      </span>
                      <span className={cn(STATE, 'text-dim')}>
                        {lock.prior.until > height ? wait(lock.prior.until - height) : 'free'}
                      </span>
                    </div>
                  )}
                </Item>
              </Fragment>
            ))}
          </ItemGroup>

          {takes > 0 && (
            <Item variant="muted" className="mt-2.5 flex-col items-stretch gap-0.5">
              <span className="text-[12.5px]">
                Unlocks {formatAmount(now - after, { precision: 2 })} {symbol} by taking back{' '}
                {plural(takes, 'vote')}.
              </span>
              {after > 0n && (
                <span className="text-[11.5px] text-dim">
                  {formatAmount(after, { precision: 2 })} {symbol} stays locked.
                </span>
              )}
            </Item>
          )}
        </>
      )}

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />
    </CallModal>
  )
}
