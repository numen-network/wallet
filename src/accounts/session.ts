import { create } from 'zustand'
import type { CallArg, Operation, TxStage } from '@/chain/types'

/**
 * What this tab has submitted, and how far each one got. It lives in
 * sessionStorage, so a reload keeps it and closing the tab loses it, which is
 * the honest lifetime for a list the wallet cannot rebuild.
 *
 * An account's real history is on chain and belongs to the explorer. This only
 * answers what happened while the page was open.
 */

const STORAGE_KEY = 'numen-wallet-session-v1'

export interface Submission {
  id: string
  address: string
  operation: Operation
  stage: TxStage
  hash: string
  /**
   * What went out, under the runtime's own name for it and argument by
   * argument. Kept here rather than worked out again on the page, so the log
   * reads the same after a reload and with the node gone.
   */
  call?: { name: string; args: CallArg[] }
  /** What the chain refused it for, once it has refused it. */
  error?: string
  at: number
}

interface SessionState {
  submissions: Submission[]
  record: (address: string, operation: Operation) => string
  encode: (id: string, call: { name: string; args: CallArg[] }) => void
  advance: (id: string, stage: TxStage, hash: string) => void
  fail: (id: string, error: string) => void
  forAccount: (address: string) => Submission[]
}

function read(): Submission[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as Submission[]) : []
  } catch {
    return []
  }
}

function write(submissions: Submission[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(submissions, replaceBigInt))
  } catch {
    // A tab that cannot remember what it sent still sent it
  }
}

// Amounts are bigint, and a bigint does not survive JSON on its own
const replaceBigInt = (_key: string, value: unknown) =>
  typeof value === 'bigint' ? `${value}n` : value

const reviveBigInt = (operation: Operation): Operation =>
  JSON.parse(JSON.stringify(operation), (_key, value: unknown) =>
    typeof value === 'string' && /^\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value,
  ) as Operation

let counter = 0

export const useSessionStore = create<SessionState>((set, get) => {
  const save = (submissions: Submission[]) => {
    write(submissions)
    set({ submissions })
  }

  return {
    submissions: read().map((entry) => ({ ...entry, operation: reviveBigInt(entry.operation) })),

    record: (address, operation) => {
      const id = `s${(counter += 1)}-${Date.now()}`
      save([{ id, address, operation, stage: 'signed', hash: '', at: Date.now() }, ...get().submissions])
      return id
    },

    encode: (id, call) =>
      save(get().submissions.map((entry) => (entry.id === id ? { ...entry, call } : entry))),

    advance: (id, stage, hash) =>
      save(get().submissions.map((entry) => (entry.id === id ? { ...entry, stage, hash } : entry))),

    fail: (id, error) =>
      save(get().submissions.map((entry) => (entry.id === id ? { ...entry, error } : entry))),

    forAccount: (address) => get().submissions.filter((entry) => entry.address === address),
  }
})
