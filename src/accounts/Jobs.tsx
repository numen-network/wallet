import { useEffect } from 'react'
import { useSymbol } from '@/chain/queries'
import type { Operation } from '@/chain/types'
import { toast, toastFailed, toastSettled, toastWorking } from '@/ui/Toast'
import { describe, SETTLED, WORKING } from './activity'
import { innerOf, progressOf, useJobsStore, type Job, type Progress } from './jobs'
import { useSessionStore } from './session'

export const what = (job: Job, symbol: string) => describe(job.parts[0]!.operation, symbol).title

/** What one part carried, on a line, since the job's title already says what kind of call. */
export function carried(operation: Operation, symbol: string): string {
  const inner = innerOf(operation)
  const calls = inner.kind === 'batch' ? inner.calls : [inner]
  return calls
    .map((call) => describe(call, symbol).fields.map((field) => field.value).join(', '))
    .join(' · ')
}

export function standing(job: Job, progress: Progress) {
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
 * clicked, and the click opens the sidebar, which keeps it until it is dealt
 * with.
 */
export function JobsHost() {
  const symbol = useSymbol()

  // Driven from the stores rather than from a render, since Sonner flushes its
  // own state synchronously and React will not have that inside a commit
  useEffect(() => {
    const sync = () => {
      const { submissions } = useSessionStore.getState()
      const { jobs, seen, finish, setSidebar } = useJobsStore.getState()
      for (const job of jobs) {
        const progress = progressOf(job, submissions)
        const title = what(job, symbol)
        if (seen.includes(job.id)) {
          toastSettled(job.id)
        } else if (progress.failed.length > 0) {
          toastFailed(job.id, title, standing(job, progress), () => setSidebar(true))
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
  }, [symbol])

  return null
}
