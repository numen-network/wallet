import { describe, expect, it } from 'vitest'
import { UNIT } from '@/chain/config'
import { owed, payments, rowProblem, type Row } from './payments'

const TO = 'nu3oNksEGXV3Tsr4sBeRUpcfA5zYp4VvZ7t9uKVPMAe2UCo98'
const EVM = '0x1234567890abcdef1234567890abcdef12345678'

const row = (over: Partial<Row> = {}): Row => ({ to: TO, amount: '1', ...over })

describe('a row of the payment form', () => {
  it('takes a Numen address and an EVM one, since both name the same pot', () => {
    expect(rowProblem(row())).toBeNull()
    expect(rowProblem(row({ to: EVM }))).toBeNull()
  })

  it('turns down an address it cannot read', () => {
    expect(rowProblem(row({ to: '' }))).toBe('Enter a Numen or EVM address')
    expect(rowProblem(row({ to: 'nu3oNks' }))).toBe('Enter a Numen or EVM address')
  })

  it('turns down an amount that would move nothing', () => {
    expect(rowProblem(row({ amount: '' }))).toBe('Enter an amount')
    expect(rowProblem(row({ amount: '0' }))).toBe('Enter an amount')
    expect(rowProblem(row({ amount: '0.00' }))).toBe('Enter an amount')
  })
})

describe('the calls a payment form comes to', () => {
  it('is one transfer a row, in the order they were typed', () => {
    expect(payments([row({ amount: '1' }), row({ to: EVM, amount: '2.5' })])).toEqual([
      { kind: 'transfer', to: TO, amount: UNIT },
      { kind: 'transfer', to: expect.stringMatching(/^nu/) as unknown as string, amount: UNIT * 5n / 2n },
    ])
  })

  it('is nothing at all while any row is still wrong', () => {
    expect(payments([row(), row({ amount: '' })])).toBeNull()
    expect(payments([row({ to: 'nonsense' })])).toBeNull()
  })

  it('is nothing at all with no rows, since there would be nothing to sign', () => {
    expect(payments([])).toBeNull()
  })
})

describe('what a payment form adds up to', () => {
  it('adds the rows that parse and passes over the ones that do not', () => {
    expect(owed([row({ amount: '1' }), row({ amount: '2.5' })])).toBe(UNIT * 7n / 2n)
    expect(owed([row({ amount: '1' }), row({ amount: '' })])).toBe(UNIT)
    expect(owed([row({ amount: 'nonsense' })])).toBe(0n)
  })

  it('is nothing on an empty form', () => {
    expect(owed([])).toBe(0n)
  })
})
