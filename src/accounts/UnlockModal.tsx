import { Fragment } from 'react'
import { trackLabel, type ClassLock } from '@/chain/governance'
import { useFacts, useHead, useLocks, useReferenda, useSymbol, useTracks } from '@/chain/queries'
import { batched, type Operation } from '@/chain/types'
import { formatAmount } from '@/lib/balance'
import { waitFor } from '@/lib/blocks'
import { Item, ItemGroup, ItemSeparator } from '@/components/ui/item'
import { CallModal, SignerField, useCall, useSigning } from './Authorize'
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
  const call = useCall(onClose)

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
    if (calls.length === 0) {
      call.setError('Nothing is free to unlock yet')
      return false
    }

    return call.run(submit(operation, call.password))
  }

  const takes = calls.filter((entry) => entry.kind === 'removeVote').length

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
      {held.length === 0 ? (
        <p className="text-[13.5px] text-muted-foreground">{account.name} has nothing locked behind a vote.</p>
      ) : (
        <>
          <ItemGroup variant="outline" className="bg-muted">
            {held.map((lock, index) => {
              const blocking = why(lock)
              return (
                <Fragment key={lock.track}>
                  {index > 0 && <ItemSeparator />}
                  <Item className="items-baseline">
                    <span className="flex-1 text-[13px] font-semibold">
                      {trackLabel(tracks, lock.track)}
                    </span>
                    <span className="font-mono text-[12.5px]">
                      {formatAmount(lock.amount, { precision: 2 })} {symbol}
                    </span>
                    <span className={`text-[11.5px] ${blocking ? 'text-dim' : 'text-primary'}`}>
                      {blocking ?? 'free'}
                    </span>
                  </Item>
                </Fragment>
              )
            })}
          </ItemGroup>

          {takes > 0 && (
            <p className="mt-2.5 text-[12.5px] text-muted-foreground">
              This takes back {plural(takes, 'vote')} on referenda that are over, since the chain
              counts a vote as holding the balance until somebody says otherwise. A vote on anything
              still running stays where it is.
            </p>
          )}
        </>
      )}

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />
    </CallModal>
  )
}
