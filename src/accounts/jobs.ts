import { create } from 'zustand'
import type { Operation, TxStage } from '@/chain/types'
import type { Submission } from './session'

/**
 * Everything one press of a dialog's submit sent. The dialog is gone by the
 * time the chain answers, so the job is what carries the answer, and what
 * brings the dialog back when part of it failed.
 */

/** One call the job sent, or one it never got to sign. */
export interface Part {
  /** Whoever signed, which is who pays. */
  address: string
  operation: Operation
  /** Its entry in this tab's log. Missing for a call that was never signed. */
  submission?: string
  /** Why it was never signed. */
  error?: string | undefined
}

export interface Job {
  id: string
  /** When it was sent, in ms. */
  at: number
  parts: Part[]
  /** Opens the dialog again on what failed. Missing where the dialog cannot be brought back. */
  retry?: ((failed: Part[]) => void) | undefined
}

/** A part as far as the chain has taken it. */
export interface Outcome extends Part {
  stage: TxStage | null
  detail?: string | undefined
}

export interface Progress {
  outcomes: Outcome[]
  failed: Outcome[]
  /** Parts the chain is done with, whichever way. */
  over: number
  /** The stage every part still going has at least reached. */
  stage: TxStage
}

const ORDER: TxStage[] = ['signed', 'broadcast', 'inBlock', 'finalized']

export function progressOf(job: Job, submissions: Submission[]): Progress {
  const outcomes = job.parts.map((part): Outcome => {
    const entry = submissions.find((submission) => submission.id === part.submission)
    return entry
      ? { ...part, stage: entry.stage, error: entry.error, detail: entry.detail }
      : { ...part, stage: null }
  })
  const failed = outcomes.filter((outcome) => outcome.error)
  const going = outcomes.filter((outcome) => !outcome.error && outcome.stage !== 'finalized')
  const stage = going.reduce<TxStage>(
    (least, outcome) => (ORDER.indexOf(outcome.stage!) < ORDER.indexOf(least) ? outcome.stage! : least),
    'finalized',
  )

  return { outcomes, failed, over: outcomes.length - going.length, stage }
}

interface JobsState {
  jobs: Job[]
  /** Whether the activity sidebar is open. */
  sidebar: boolean
  /** Jobs whose failure is already in the sidebar, so the corner lets go of them. */
  seen: string[]
  start: (job: Omit<Job, 'id' | 'at'>) => string
  finish: (id: string) => void
  setSidebar: (open: boolean) => void
  see: (ids: string[]) => void
}

let counter = 0

export const useJobsStore = create<JobsState>((set) => ({
  jobs: [],
  sidebar: false,
  seen: [],
  start: (job) => {
    const id = `job-${(counter += 1)}`
    set((state) => ({ jobs: [...state.jobs, { ...job, id, at: Date.now() }] }))
    return id
  },
  finish: (id) =>
    set((state) => ({
      jobs: state.jobs.filter((job) => job.id !== id),
      seen: state.seen.filter((entry) => entry !== id),
    })),
  setSidebar: (sidebar) => set({ sidebar }),
  see: (ids) => set((state) => ({ seen: [...new Set([...state.seen, ...ids])] })),
}))

/** The call a proxy or a multisig carries, which is what the dialog was filling in. */
export function innerOf(operation: Operation): Operation {
  return operation.kind === 'asProxy' || operation.kind === 'multisigApprove' ? innerOf(operation.call) : operation
}

/** The account a part acts as, which a proxy or a multisig signs on behalf of. */
export function actorOf(part: Pick<Part, 'address' | 'operation'>): string {
  const { operation } = part
  if (operation.kind === 'asProxy') return operation.real
  if ('multisig' in operation) return operation.multisig
  return part.address
}
