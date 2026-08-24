import { create } from 'zustand'
import type { ReadCall } from '@/chain/types'

const STORAGE_KEY = 'numen-wallet-calls-v1'

/**
 * Bytes read against the hash the chain is waiting for. They arrive from
 * another person, over whatever channel, so being able to read them is not the
 * same as their being the call this multisig started. The hash is what settles
 * it, and nothing is shown or signed until it agrees.
 */
export async function readAgainst(
  read: (hex: string) => Promise<ReadCall>,
  hex: string,
  callHash: string,
): Promise<ReadCall> {
  const seen = await read(hex)
  if (seen.hash !== callHash) {
    throw new Error('Those bytes are some other call, not the one waiting here')
  }
  return seen
}

/**
 * The call bytes behind a waiting multisig call, kept by the hash the chain
 * names it by.
 *
 * pallet_multisig stores only that hash, so these bytes are the only copy of
 * what was started. Whoever started it holds them, and every other signatory
 * has to be handed them before they can read what they are signing. Losing
 * them leaves a call nobody can finish, only call off.
 */
export function loadCalls(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const stored = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(stored).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' && /^0x([0-9a-f]{2})+$/i.test(entry[1]),
      ),
    )
  } catch {
    return {}
  }
}

function saveCalls(calls: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(calls))
  } catch {
    // A full storage costs a signatory the copy they were handed, not their key
  }
}

interface CallsState {
  calls: Record<string, string>
  /** Keeps the bytes, whether they were written here or handed over by somebody. */
  remember: (hash: string, hex: string) => void
}

export const useCallsStore = create<CallsState>((set) => ({
  calls: loadCalls(),
  remember: (hash, hex) =>
    set((state) => {
      if (state.calls[hash] === hex) return state
      const calls = { ...state.calls, [hash]: hex }
      saveCalls(calls)
      return { calls }
    }),
}))
