import { describe, expect, it } from 'vitest'
import { amountInput, AmountError, formatAmount, parseAmount } from './balance'
import { UNIT } from '@/chain/config'

describe('parseAmount', () => {
  it('scales whole units to planck', () => {
    expect(parseAmount('1')).toBe(UNIT)
    expect(parseAmount('1250')).toBe(1250n * UNIT)
  })

  it('accepts the full 18 decimals without loss', () => {
    expect(parseAmount('0.000000000000000001')).toBe(1n)
    expect(parseAmount('1.234567890123456789')).toBe(1234567890123456789n)
  })

  it('strips thousands separators pasted from the UI', () => {
    expect(parseAmount('1,250.5')).toBe(1250n * UNIT + UNIT / 2n)
  })

  it('rejects more precision than the chain carries', () => {
    expect(() => parseAmount('1.0000000000000000001')).toThrow(AmountError)
  })

  it('rejects junk instead of guessing', () => {
    expect(() => parseAmount('')).toThrow(AmountError)
    expect(() => parseAmount('1.2.3')).toThrow(AmountError)
    expect(() => parseAmount('abc')).toThrow(AmountError)
    expect(() => parseAmount('-1')).toThrow(AmountError)
  })
})

describe('amountInput', () => {
  it('keeps the digits and drops everything else', () => {
    expect(amountInput('12tNUMN')).toBe('12')
    expect(amountInput('1,000')).toBe('1000')
    expect(amountInput('-1')).toBe('1')
    expect(amountInput('1e9')).toBe('19')
  })

  it('leaves one decimal point standing', () => {
    expect(amountInput('1.5')).toBe('1.5')
    expect(amountInput('1.5.2')).toBe('1.52')
    expect(amountInput('.5')).toBe('.5')
    expect(amountInput('1.')).toBe('1.')
  })

  it('stops at the last planck', () => {
    expect(amountInput('1.234567890123456789')).toBe('1.234567890123456789')
    expect(amountInput('1.2345678901234567890123')).toBe('1.234567890123456789')
  })

  it('gives parseAmount nothing it would refuse', () => {
    const raws = ['12tNUMN', '1,000', '-1', '1e9', '1.5.2', '.5', '1.', '0.' + '1'.repeat(30)]
    for (const raw of raws) {
      expect(() => parseAmount(amountInput(raw))).not.toThrow()
    }
  })
})

describe('formatAmount', () => {
  it('leaves no fraction at all when none was asked for', () => {
    expect(formatAmount(100n * UNIT, { precision: 0 })).toBe('100')
    expect(formatAmount(100n * UNIT + UNIT / 2n, { precision: 0 })).toBe('100')
    expect(formatAmount(5_000_000n * UNIT, { precision: 0 })).toBe('5,000,000')
  })

  it('groups the integer part and pads the fraction', () => {
    expect(formatAmount(87420n * UNIT + 516200000000000000n)).toBe('87,420.5162')
  })

  it('truncates instead of rounding up so the shown amount is never overstated', () => {
    expect(formatAmount(999999999999999999n)).toBe('0.9999')
  })

  it('drops trailing zeros when asked', () => {
    expect(formatAmount(UNIT, { pad: false })).toBe('1')
    expect(formatAmount(UNIT / 2n, { pad: false })).toBe('0.5')
  })

  it('honours a wider precision', () => {
    expect(formatAmount(1234567890123456789n, { precision: 18, grouped: false }))
      .toBe('1.234567890123456789')
  })

  it('says a number is approximate only when it dropped digits', () => {
    expect(formatAmount(999999999999999999n, { approx: true })).toBe('≈0.9999')
    expect(formatAmount(0n, { approx: true })).toBe('0.0000')
    expect(formatAmount(UNIT / 2n, { approx: true })).toBe('0.5000')
    expect(formatAmount(999999999999999999n, { precision: 18, approx: true }))
      .toBe('0.999999999999999999')
  })

  it('uses a real minus sign for outgoing amounts', () => {
    expect(formatAmount(-UNIT)).toBe('−1.0000')
  })
})

describe('round trip', () => {
  it('survives parse then format at full precision', () => {
    const samples = ['0.000000000000000001', '1', '87420.516200000000000001', '1250.5']
    for (const s of samples) {
      const formatted = formatAmount(parseAmount(s), { precision: 18, grouped: false, pad: false })
      expect(parseAmount(formatted)).toBe(parseAmount(s))
    }
  })
})
