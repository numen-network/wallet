import { explorerAccount, explorerExtrinsic } from '@/chain/config'
import { useChain } from '@/chain/provider'
import { useSymbol } from '@/chain/queries'
import { shorten } from '@/lib/address'
import { CopyButton } from '@/ui/CopyButton'
import { Empty } from '@/ui/Empty'
import { Facts, type Fact } from '@/ui/Facts'
import { SHELL } from '@/ui/shell'
import { describe, STAGES } from './activity'
import { useSessionStore, type Submission } from './session'
import type { Account } from './types'

const clock = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', hour12: false })

function Row({
  entry,
  name,
  symbol,
}: {
  entry: Submission
  /** Undefined for an account the wallet no longer holds, where the address is all there is. */
  name: string | undefined
  symbol: string
}) {
  const { network } = useChain()
  const { title } = describe(entry.operation, symbol)
  // How far it got is the answer only until the chain has one of its own, and
  // then what the chain made of it is the answer
  const state = entry.error ? 'refused' : STAGES[entry.stage]

  // Every entry reads the same way whatever it carried. What the runtime files
  // the call as, then its arguments under the runtime's own names for them, a
  // row apiece. A line per kind of call said more about which kinds somebody
  // had got round to writing than about the call in hand
  const rows: Fact[] = [
    { name: 'call', value: entry.call?.name ?? '…' },
    ...(entry.call?.args ?? []),
  ]
  if (entry.error) rows.push({ name: 'refused', value: entry.error, bad: true })
  if (entry.hash) {
    rows.push({
      name: 'transaction',
      value: (
        <span className="flex items-center gap-1.5">
          <a
            href={explorerExtrinsic(network, entry.hash)}
            target="_blank"
            rel="noopener"
            className="hover:text-accent"
          >
            {shorten(entry.hash)}
          </a>
          <CopyButton text={entry.hash} label="Copy transaction hash" />
        </span>
      ),
    })
  }

  return (
    <article className="rounded-[6px] border border-line bg-panel p-3.5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13.5px] font-semibold">{title}</span>
        <span
          className={`rounded-full border px-[7px] py-0.5 text-[10px] font-bold tracking-[0.06em] uppercase ${
            entry.error
              ? 'border-bad text-bad'
              : entry.stage === 'finalized'
                ? 'border-accent text-accent'
                : 'border-line-strong text-dim'
          }`}
        >
          {state}
        </span>
        <span className="flex-1" />
        <a
          href={explorerAccount(network, entry.address)}
          target="_blank"
          rel="noopener"
          title={entry.address}
          className="flex items-baseline gap-1.5 text-[12.5px] text-lead hover:text-accent"
        >
          {name && <span className="font-semibold">{name}</span>}
          <span className="font-mono">{shorten(entry.address)}</span>
        </a>
        <span className="text-[12.5px] text-dim">{clock.format(entry.at)}</span>
      </div>

      <Facts rows={rows} />
    </article>
  )
}

/**
 * Every call this tab has sent, whichever account signed it. What the chain
 * itself remembers is the explorer's, which is where each account name goes.
 */
export function ActivityView({ accounts }: { accounts: Account[] }) {
  const symbol = useSymbol()
  const submissions = useSessionStore((state) => state.submissions)

  const named = (address: string) =>
    accounts.find((account) => account.address === address)?.name

  return (
    <>
      <section className={`${SHELL} flex flex-wrap items-center gap-3 pt-6 pb-1.5`}>
        <h2 className="text-[15px] font-bold tracking-tight">Sent from this tab</h2>
        <span className="flex-1" />
        <span className="text-[12.5px] text-dim">Gone when the tab closes</span>
      </section>

      <main className={`${SHELL} grow pt-1.5 pb-16`}>
        {submissions.length === 0 ? (
          <Empty>
            Nothing sent yet. Every call any account here signs lands on this page, which is all the
            wallet keeps. The chain's own record belongs to the explorer.
          </Empty>
        ) : (
          <section aria-label="Sent from this tab" className="grid gap-2.5">
            {submissions.map((entry) => (
              <Row
                key={entry.id}
                entry={entry}
                name={named(entry.address)}
                symbol={symbol}
              />
            ))}
          </section>
        )}
      </main>
    </>
  )
}
