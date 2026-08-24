import { DECIMALS } from '@/chain/config'

/**
 * Balances are 18 decimal bigints end to end. Nothing in this file may touch
 * `number`, a single float round trip loses planck and pays the wrong amount.
 */

const BASE = 10n ** BigInt(DECIMALS)

export class AmountError extends Error {}

/**
 * Parse user input into planck. Rejects rather than truncating, a silently
 * dropped digit is a wrong transfer.
 */
export function parseAmount(input: string): bigint {
  const clean = input.trim().replace(/,/g, '')
  if (!/^\d*\.?\d*$/.test(clean) || clean === '' || clean === '.') {
    throw new AmountError(`Not a number: ${input}`)
  }

  const [whole = '', frac = ''] = clean.split('.')
  if (frac.length > DECIMALS) {
    throw new AmountError(`More than ${DECIMALS} decimals: ${input}`)
  }

  return BigInt(whole || '0') * BASE + BigInt(frac.padEnd(DECIMALS, '0') || '0')
}

/**
 * What an amount box may hold, which is the shape parseAmount takes and nothing
 * else. Typing is filtered rather than rejected afterwards, since a box that
 * swallows letters and then complains has already wasted the keystroke.
 */
export function amountInput(raw: string): string {
  const [whole = '', ...rest] = raw.replace(/[^\d.]/g, '').split('.')
  if (rest.length === 0) return whole
  // A digit past the last planck buys nothing, so the box stops taking them
  return `${whole}.${rest.join('').slice(0, DECIMALS)}`
}

export interface FormatOptions {
  /** Fraction digits shown. Value is truncated, never rounded up. */
  precision?: number
  /** Thousands separators on the integer part. */
  grouped?: boolean
  /** Keep trailing zeros so columns of numbers stay aligned. */
  pad?: boolean
  /** Mark the number with ≈ when digits had to be dropped to fit the precision. */
  approx?: boolean
}

export function formatAmount(planck: bigint, options: FormatOptions = {}): string {
  const { precision = 4, grouped = true, pad = true, approx = false } = options

  const negative = planck < 0n
  const abs = negative ? -planck : planck

  const whole = abs / BASE
  // Taking the digits off the front truncates, and asking for none of them
  // leaves nothing rather than a zero the caller did not ask for
  let frac = (abs % BASE).toString().padStart(DECIMALS, '0').slice(0, precision)
  if (!pad) frac = frac.replace(/0+$/, '')

  const head = grouped ? whole.toLocaleString('en-US') : whole.toString()
  const sign = negative ? '−' : ''
  // What one shown digit is worth, so anything under it is what got dropped
  const step = precision >= DECIMALS ? 1n : BASE / 10n ** BigInt(precision)
  const about = approx && abs % step !== 0n ? '≈' : ''

  return frac ? `${about}${sign}${head}.${frac}` : `${about}${sign}${head}`
}
