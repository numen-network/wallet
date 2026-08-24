import type { Operation } from '@/chain/types'
import { resolveAddress } from '@/lib/address'
import { AmountError, parseAmount } from '@/lib/balance'

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
  // An empty box is not a number nobody can read, it is a box nobody filled in
  if (row.amount.trim() === '') return 'Enter an amount'

  try {
    if (parseAmount(row.amount) <= 0n) return 'Enter an amount'
  } catch (problem) {
    return problem instanceof AmountError ? problem.message : 'Enter an amount'
  }

  return null
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

/**
 * What the rows come to so far. A half typed form still has a total, so an
 * amount that does not parse yet counts as nothing rather than stopping the sum.
 */
export function owed(rows: Row[]): bigint {
  return rows.reduce((total, row) => {
    try {
      const planck = parseAmount(row.amount)
      return planck > 0n ? total + planck : total
    } catch {
      return total
    }
  }, 0n)
}
