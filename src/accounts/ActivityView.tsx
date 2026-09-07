import { explorerAccount, explorerExtrinsic } from '@/chain/config'
import { useChain } from '@/chain/provider'
import { useSymbol } from '@/chain/queries'
import { shorten } from '@/lib/address'
import { cn } from '@/lib/cn'
import { NOTE } from '@/components/ui/field'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CopyButton } from '@/ui/CopyButton'
import { Empty } from '@/components/ui/empty'
import { Facts, type Fact } from '@/ui/Facts'
import { SHELL } from '@/ui/shell'
import { Tip } from '@/ui/Tip'
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
            className="hover:text-primary"
          >
            {shorten(entry.hash)}
          </a>
          <CopyButton text={entry.hash} label="Copy transaction hash" />
        </span>
      ),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[13.5px]">{title}</CardTitle>
        <Badge
          variant={entry.error ? 'destructive' : entry.stage === 'finalized' ? 'primary' : 'default'}
        >
          {state}
        </Badge>
        <CardAction className="flex items-center gap-2">
          <Tip text={entry.address}>
            <a
              href={explorerAccount(network, entry.address)}
              target="_blank"
              rel="noopener"
              className="flex items-baseline gap-1.5 text-[12.5px] text-muted-foreground hover:text-primary"
            >
              {name && <span className="font-semibold">{name}</span>}
              <span className="font-mono">{shorten(entry.address)}</span>
            </a>
          </Tip>
          <span className={NOTE}>{clock.format(entry.at)}</span>
        </CardAction>
      </CardHeader>

      <CardContent>
        <Facts rows={rows} />
      </CardContent>
    </Card>
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
      <section className={cn(SHELL, 'flex flex-wrap items-center gap-3 pt-6 pb-1.5')}>
        <h2 className="text-[15px] font-bold tracking-tight">Sent from this tab</h2>
        <span className="flex-1" />
        <span className={NOTE}>Gone when the tab closes</span>
      </section>

      <main className={cn(SHELL, 'grow pt-1.5 pb-16')}>
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
