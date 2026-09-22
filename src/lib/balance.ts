import { DECIMALS } from '@/chain/config'
import { plural } from './plural'

/**
 * Balances are 18 decimal bigints end to end, and a token brings its own
 * decimals. Nothing in this file may touch `number`, a single float round trip
 * loses planck and pays the wrong amount.
 */

export class AmountError extends Error {}

/**
 * Parse user input into planck. Rejects rather than truncating, a silently
 * dropped digit is a wrong transfer.
 */
export function parseAmount(input: string, decimals = DECIMALS): bigint {
  const clean = input.trim().replace(/,/g, '')
  if (!/^\d*\.?\d*$/.test(clean) || clean === '' || clean === '.') {
    throw new AmountError(`Not a number: ${input}`)
  }

  const [whole = '', frac = ''] = clean.split('.')
  if (frac.length > decimals) {
    throw new AmountError(`More than ${plural(decimals, 'decimal')}: ${input}`)
  }

  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0')
}

/** Planck for a box that may not parse yet, which counts as nothing until it does. */
export function amountOrZero(input: string): bigint {
  try {
    return parseAmount(input)
  } catch {
    return 0n
  }
}

/**
 * What is wrong with an amount box, or null when the chain could take what it
 * says. An empty box is not a number nobody can read, it is a box nobody filled
 * in. Nothing moves by less than a planck, so that is the floor unless zero is
 * an answer in its own right, the way it is for a fee.
 */
export function amountProblem(input: string, least = 1n, decimals = DECIMALS): string | null {
  if (input.trim() === '') return 'Enter an amount'
  try {
    return parseAmount(input, decimals) < least ? 'Enter an amount' : null
  } catch (problem) {
    return (problem as AmountError).message
  }
}

/**
 * What an amount box may hold, which is the shape parseAmount takes and nothing
 * else. Typing is filtered rather than rejected afterwards, since a box that
 * swallows letters and then complains has already wasted the keystroke.
 */
export function amountInput(raw: string, decimals = DECIMALS): string {
  const [whole = '', ...rest] = raw.replace(/[^\d.]/g, '').split('.')
  if (rest.length === 0) return whole
  // A digit past the last planck buys nothing, so the box stops taking them
  return `${whole}.${rest.join('').slice(0, decimals)}`
}

export interface FormatOptions {
  /**
   * Fraction digits shown. The value is truncated, never rounded up, and gets
   * a leading ≈ whenever that drops anything.
   */
  precision?: number
  /** Thousands separators on the integer part. */
  grouped?: boolean
  /** Keep trailing zeros so columns of numbers stay aligned. */
  pad?: boolean
  /** Scale thousands to K and millions to M. */
  compact?: boolean
  /** The amount's own decimals, for a token that does not share the coin's. */
  decimals?: number
}

export function formatAmount(planck: bigint, options: FormatOptions = {}): string {
  const { precision = 4, grouped = true, pad = true, compact = false, decimals = DECIMALS } = options
  const base = 10n ** BigInt(decimals)

  const negative = planck < 0n
  const abs = negative ? -planck : planck

  const shift = !compact ? 0 : abs >= 1_000_000n * base ? 6 : abs >= 1_000n * base ? 3 : 0
  const unit = base * 10n ** BigInt(shift)
  const suffix = shift === 6 ? 'M' : shift === 3 ? 'K' : ''

  const whole = abs / unit
  // Taking the digits off the front truncates, and asking for none of them
  // leaves nothing rather than a zero the caller did not ask for
  let frac = (abs % unit).toString().padStart(decimals + shift, '0').slice(0, precision)
  if (!pad) frac = frac.replace(/0+$/, '')

  const head = grouped ? whole.toLocaleString('en-US') : whole.toString()
  const sign = negative ? '−' : ''
  // What one shown digit is worth, so anything under it is what got dropped
  const step = precision >= decimals + shift ? 1n : unit / 10n ** BigInt(precision)
  const about = abs % step !== 0n ? '≈' : ''

  return frac ? `${about}${sign}${head}.${frac}${suffix}` : `${about}${sign}${head}${suffix}`
}
