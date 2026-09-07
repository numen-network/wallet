import type { Operation } from '@/chain/types'
import { resolveAddress } from '@/lib/address'
import { amountOrZero, amountProblem, parseAmount } from '@/lib/balance'

/**
 * One account paying several, which the chain takes as one call over a list of
 * transfers. Nothing here knows about batching, it turns typed rows into calls
 * and says which row will not do.
 */

export interface Row {
  to: string
  amount: string
}

export const BLANK: Row = { to: '', amount: '' }

/** Null for a row the chain would take, otherwise what is wrong with it. */
export function rowProblem(row: Row): string | null {
  if (resolveAddress(row.to) === null) return 'Enter a Numen or EVM address'
  return amountProblem(row.amount)
}

/** Every row as a call, or null while any of them is still wrong. */
export function payments(rows: Row[]): Operation[] | null {
  const calls: Operation[] = []

  for (const row of rows) {
    const to = resolveAddress(row.to)
    if (to === null || rowProblem(row) !== null) return null
    calls.push({ kind: 'transfer', to, amount: parseAmount(row.amount) })
  }

  return calls.length > 0 ? calls : null
}

/** What the rows come to so far, a half typed form included. */
export function owed(rows: Row[]): bigint {
  return rows.reduce((total, row) => total + amountOrZero(row.amount), 0n)
}

/**
 * The most a send may carry. transfer_keep_alive leaves the account standing,
 * so the deposit that keeps it alive stays back along with whatever the fee
 * takes off the same balance.
 */
export function spendableOf(
  transferable: bigint,
  existentialDeposit: bigint,
  /** What the fee takes off this balance, which is nothing when somebody else signs. */
  fee: bigint,
): bigint {
  const held = existentialDeposit + fee
  return transferable > held ? transferable - held : 0n
}
