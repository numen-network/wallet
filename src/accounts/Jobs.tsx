import { useEffect } from 'react'
import { useSymbol } from '@/chain/queries'
import type { Operation } from '@/chain/types'
import { shorten } from '@/lib/address'
import { cn } from '@/lib/cn'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from '@/components/ui/item'
import { NOTE } from '@/components/ui/field'
import { Identicon } from '@/ui/Identicon'
import { LEDE, Modal } from '@/ui/Modal'
import { toast, toastFailed, toastSettled, toastWorking } from '@/ui/Toast'
import { describe, SETTLED, WORKING } from './activity'
import { actorOf, innerOf, progressOf, useJobsStore, type Job, type Progress } from './jobs'
import { useSessionStore } from './session'
import type { Account } from './types'

const what = (job: Job, symbol: string) => describe(job.parts[0]!.operation, symbol).title

/** What one part carried, on a line, since the dialog's title already says what kind of call. */
function carried(operation: Operation, symbol: string): string {
  const inner = innerOf(operation)
  const calls = inner.kind === 'batch' ? inner.calls : [inner]
  return calls
    .map((call) => describe(call, symbol).fields.map((field) => field.value).join(', '))
    .join(' · ')
}

function standing(job: Job, progress: Progress) {
  const total = job.parts.length
  const going = total - progress.over
  if (progress.failed.length === 0) {
    const stage = WORKING[progress.stage]
    return total === 1 ? stage : `${progress.over} of ${total} done, ${stage.toLowerCase()}`
  }
  if (total === 1) return progress.failed[0]!.error!
  return `${progress.failed.length} of ${total} failed${going > 0 ? `, ${going} still going` : ''}`
}

/**
 * One notice a job, in the corner, for as long as the chain is at it. A job
 * that all went through leaves on its own. One that did not stays until
 * clicked, and the click says what went wrong and offers the dialog back.
 */
export function JobsHost({ accounts }: { accounts: Account[] }) {
  const symbol = useSymbol()
  const jobs = useJobsStore((state) => state.jobs)
  const shown = useJobsStore((state) => state.shown)
  const show = useJobsStore((state) => state.show)
  const finish = useJobsStore((state) => state.finish)

  // Driven from the stores rather than from a render, since Sonner flushes its
  // own state synchronously and React will not have that inside a commit
  useEffect(() => {
    const sync = () => {
      const { submissions } = useSessionStore.getState()
      for (const job of useJobsStore.getState().jobs) {
        const progress = progressOf(job, submissions)
        const title = what(job, symbol)
        if (progress.failed.length > 0) {
          toastFailed(job.id, title, standing(job, progress), () => show(job.id))
        } else if (progress.over < job.parts.length) {
          toastWorking(job.id, title, standing(job, progress))
        } else {
          toastSettled(job.id)
          toast(SETTLED[job.parts[0]!.operation.kind])
          finish(job.id)
        }
      }
    }
    const unwatchJobs = useJobsStore.subscribe(sync)
    const unwatchLog = useSessionStore.subscribe(sync)
    return () => {
      unwatchJobs()
      unwatchLog()
    }
  }, [symbol, show, finish])

  const job = jobs.find((entry) => entry.id === shown)
  if (!job) return null

  const close = () => {
    toastSettled(job.id)
    finish(job.id)
  }
  return <Failures job={job} accounts={accounts} onClose={close} />
}

/** What failed, part by part, in the wallet's words and in the chain's. */
function Failures({ job, accounts, onClose }: { job: Job; accounts: Account[]; onClose: () => void }) {
  const symbol = useSymbol()
  const submissions = useSessionStore((state) => state.submissions)
  const progress = progressOf(job, submissions)
  const name = (address: string) =>
    accounts.find((entry) => entry.address === address)?.name ?? shorten(address)
  const retry = job.retry

  return (
    <Modal
      title={what(job, symbol)}
      submitLabel={retry ? 'Edit and retry' : null}
      cancelLabel="Close"
      width={520}
      onClose={onClose}
      onSubmit={() => retry?.(progress.failed)}
    >
      <p className={LEDE}>{standing(job, progress)}</p>

      <ItemGroup variant="outline" className="mt-3">
        {progress.failed.map((part, index) => (
          <div key={part.submission ?? index} className="contents">
            {index > 0 && <ItemSeparator />}
            <Item className="items-start py-2.5">
              <ItemMedia className="pt-0.5">
                <Identicon address={actorOf(part)} size={20} />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle>{name(actorOf(part))}</ItemTitle>
                <ItemDescription className="line-clamp-2">{carried(part.operation, symbol)}</ItemDescription>
                <ItemDescription className="text-[12.5px] text-destructive">{part.error}</ItemDescription>
                {part.detail && (
                  <pre className={cn('mt-1 font-mono break-all whitespace-pre-wrap', NOTE)}>{part.detail}</pre>
                )}
              </ItemContent>
            </Item>
          </div>
        ))}
      </ItemGroup>
    </Modal>
  )
}
