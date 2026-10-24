import { Fragment, useEffect } from 'react'
import { explorerAccount, explorerExtrinsic } from '@/chain/config'
import { useChain } from '@/chain/provider'
import { useSymbol } from '@/chain/queries'
import { shorten } from '@/lib/address'
import { cn } from '@/lib/cn'
import { CAPTION, NOTE } from '@/components/ui/field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty } from '@/components/ui/empty'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from '@/components/ui/item'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { CopyButton } from '@/ui/CopyButton'
import { Facts, type Fact } from '@/ui/Facts'
import { Identicon } from '@/ui/Identicon'
import { Tip } from '@/ui/Tip'
import { describe, STAGES } from './activity'
import { carried, what } from './Jobs'
import { actorOf, progressOf, useJobsStore, type Job } from './jobs'
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
 * A job with a part the chain turned down. It stays until it is sent again or
 * dismissed, since closing the sidebar is no answer to it.
 */
function Failed({
  job,
  symbol,
  named,
}: {
  job: Job
  symbol: string
  named: (address: string) => string | undefined
}) {
  const submissions = useSessionStore((state) => state.submissions)
  const finish = useJobsStore((state) => state.finish)
  const progress = progressOf(job, submissions)

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-[13.5px]">{what(job, symbol)}</CardTitle>
        <Badge variant="destructive">
          {job.parts.length === 1 ? 'refused' : `${progress.failed.length} of ${job.parts.length} failed`}
        </Badge>
        <CardAction>
          <span className={NOTE}>{clock.format(job.at)}</span>
        </CardAction>
      </CardHeader>

      <CardContent>
        <ItemGroup variant="outline">
          {progress.failed.map((part, index) => (
            <Fragment key={part.submission ?? index}>
              {index > 0 && <ItemSeparator />}
              <Item className="items-start py-2.5">
                <ItemMedia className="pt-0.5">
                  <Identicon address={actorOf(part)} size={20} />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle>{named(actorOf(part)) ?? shorten(actorOf(part))}</ItemTitle>
                  <ItemDescription className="line-clamp-2 whitespace-normal">{carried(part.operation, symbol)}</ItemDescription>
                  <ItemDescription className="text-[12.5px] whitespace-normal text-destructive">{part.error}</ItemDescription>
                  {part.detail && (
                    <pre className={cn('mt-1 font-mono break-all whitespace-pre-wrap', NOTE)}>{part.detail}</pre>
                  )}
                </ItemContent>
              </Item>
            </Fragment>
          ))}
        </ItemGroup>
      </CardContent>

      <CardFooter className="justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => finish(job.id)}>
          Dismiss
        </Button>
        {job.retry && (
          <Button type="button" size="sm" onClick={() => job.retry?.(progress.failed)}>
            Edit and retry
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

/**
 * Every call this tab has sent, whichever account signed it, beside the board
 * rather than in place of it. Failures sit on top until they are dealt with.
 * What the chain itself remembers is the explorer's.
 */
export function ActivitySheet({ accounts }: { accounts: Account[] }) {
  const symbol = useSymbol()
  const open = useJobsStore((state) => state.sidebar)
  const setSidebar = useJobsStore((state) => state.setSidebar)
  const see = useJobsStore((state) => state.see)
  const jobs = useJobsStore((state) => state.jobs)
  const submissions = useSessionStore((state) => state.submissions)
  const failing = jobs.filter((job) => progressOf(job, submissions).failed.length > 0)
  const shown = failing.map((job) => job.id).join()

  // A failure on screen here no longer needs the corner to point at it
  useEffect(() => {
    if (open && shown) see(shown.split(','))
  }, [open, shown, see])

  const named = (address: string) =>
    accounts.find((account) => account.address === address)?.name

  return (
    <Sheet open={open} onOpenChange={setSidebar}>
      <SheetContent className="gap-0">
        <div className="flex items-baseline gap-3 border-b border-border bg-card py-4 pr-14 pl-5">
          <SheetTitle>Activity</SheetTitle>
          <span className={NOTE}>Gone when the tab closes</span>
        </div>

        <div className="grid min-h-0 flex-1 content-start gap-2.5 overflow-y-auto px-5 pt-4 pb-10">
          {failing.length > 0 && (
            <section aria-label="Needs attention" className="grid gap-2.5">
              <h3 className={CAPTION}>Needs attention</h3>
              {failing.map((job) => (
                <Failed key={job.id} job={job} symbol={symbol} named={named} />
              ))}
            </section>
          )}

          <h3 className={cn(CAPTION, failing.length > 0 && 'mt-3')}>History</h3>
          {submissions.length === 0 ? (
            <Empty className="mt-0 p-6">
              Nothing sent yet. Every call any account in this wallet signs shows up here, which is
              all the wallet keeps. The chain's own record belongs to the explorer.
            </Empty>
          ) : (
            <section aria-label="Sent from this tab" className="grid gap-2.5">
              {submissions.map((entry) => (
                <Row key={entry.id} entry={entry} name={named(entry.address)} symbol={symbol} />
              ))}
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
