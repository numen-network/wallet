import { describe, expect, it } from 'vitest'
import {
  amountInput,
  AmountError,
  amountOrZero,
  amountProblem,
  formatAmount,
  parseAmount,
} from './balance'
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
    expect(formatAmount(100n * UNIT + UNIT / 2n, { precision: 0 })).toBe('≈100')
    expect(formatAmount(5_000_000n * UNIT, { precision: 0 })).toBe('5,000,000')
  })

  it('groups the integer part and pads the fraction', () => {
    expect(formatAmount(87420n * UNIT + 516200000000000000n)).toBe('87,420.5162')
  })

  it('truncates instead of rounding up so the shown amount is never overstated', () => {
    expect(formatAmount(999999999999999999n)).toBe('≈0.9999')
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
    expect(formatAmount(999999999999999999n)).toBe('≈0.9999')
    expect(formatAmount(0n)).toBe('0.0000')
    expect(formatAmount(UNIT / 2n)).toBe('0.5000')
    expect(formatAmount(999999999999999999n, { precision: 18 }))
      .toBe('0.999999999999999999')
  })

  it('uses a real minus sign for outgoing amounts', () => {
    expect(formatAmount(-UNIT)).toBe('−1.0000')
  })

  it('scales thousands and millions to K and M when compact', () => {
    expect(formatAmount(600_000_000n * UNIT, { precision: 2, compact: true })).toBe('600.00M')
    expect(formatAmount(12_345n * UNIT, { precision: 2, compact: true })).toBe('≈12.34K')
    expect(formatAmount(999n * UNIT, { precision: 2, compact: true })).toBe('999.00')
  })

  it('picks the unit right at the K and M boundaries', () => {
    expect(formatAmount(1_000n * UNIT, { precision: 2, compact: true })).toBe('1.00K')
    expect(formatAmount(999_999n * UNIT, { precision: 2, compact: true })).toBe('≈999.99K')
    expect(formatAmount(1_000_000n * UNIT, { precision: 2, compact: true })).toBe('1.00M')
  })

  it('keeps truncation and the ≈ mark on the scaled unit', () => {
    expect(formatAmount(999_999_999n * UNIT, { precision: 2, compact: true }))
      .toBe('≈999.99M')
    expect(formatAmount(12_345n * UNIT, { precision: 2, compact: true }))
      .toBe('≈12.34K')
    expect(formatAmount(1_000_000n * UNIT, { precision: 2, compact: true }))
      .toBe('1.00M')
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

describe('amountProblem', () => {
  it('is null for an amount the chain could take', () => {
    expect(amountProblem('1.5')).toBeNull()
    expect(amountProblem('0.000000000000000001')).toBeNull()
  })

  it('asks for an amount when the box is empty or would move nothing', () => {
    expect(amountProblem('')).toBe('Enter an amount')
    expect(amountProblem('   ')).toBe('Enter an amount')
    expect(amountProblem('0')).toBe('Enter an amount')
    expect(amountProblem('0.00')).toBe('Enter an amount')
  })

  it('says what parseAmount would have refused it for', () => {
    expect(amountProblem('abc')).toBe('Not a number: abc')
    expect(amountProblem('1.0000000000000000001')).toMatch(/decimals/)
  })

  it('takes zero where zero is an answer', () => {
    expect(amountProblem('0', 0n)).toBeNull()
    expect(amountProblem('', 0n)).toBe('Enter an amount')
  })
})

describe('amountOrZero', () => {
  it('reads a box that parses and counts one that does not as nothing', () => {
    expect(amountOrZero('1.5')).toBe((UNIT * 3n) / 2n)
    expect(amountOrZero('')).toBe(0n)
    expect(amountOrZero('nonsense')).toBe(0n)
  })
})

describe('an amount on decimals of its own', () => {
  it('parses and filters to them', () => {
    expect(parseAmount('6.2', 1)).toBe(62n)
    expect(() => parseAmount('6.25', 1)).toThrow(AmountError)
    expect(amountInput('6.25', 1)).toBe('6.2')
    expect(amountProblem('6.25', 1n, 1)).toBe('More than 1 decimal: 6.25')
  })

  it('formats on them, truncating the same way', () => {
    expect(formatAmount(62n, { decimals: 1, precision: 1 })).toBe('6.2')
    expect(formatAmount(1_234_567n, { decimals: 6, precision: 2 })).toBe('≈1.23')
    expect(formatAmount(1_500_000n, { decimals: 6, precision: 6, pad: false })).toBe('1.5')
    expect(formatAmount(2_500_000_000n, { decimals: 6, precision: 2, compact: true })).toBe('2.50K')
  })

  it('takes only whole numbers when there are no decimals', () => {
    expect(parseAmount('7', 0)).toBe(7n)
    expect(() => parseAmount('7.5', 0)).toThrow(AmountError)
    expect(amountInput('7.5', 0)).toBe('7.')
    expect(formatAmount(7n, { decimals: 0, precision: 0 })).toBe('7')
  })
})
