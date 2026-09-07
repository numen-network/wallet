import { describe, expect, it } from 'vitest'
import { replaceBigInt, reviveBigInt } from './json'

const roundTrip = (sent: unknown): unknown =>
  JSON.parse(JSON.stringify(sent, replaceBigInt), reviveBigInt)

describe('JSON with bigint in it', () => {
  it('comes back as it went in', () => {
    const sent = { amount: 10n ** 18n, to: 'nu3', calls: [{ amount: 1n }, 'x'] }
    expect(roundTrip(sent)).toEqual(sent)
  })

  it('leaves a number and plain text alone', () => {
    const sent = { count: 3, note: 'n', hex: '0x1n', hash: '12345' }
    expect(roundTrip(sent)).toEqual(sent)
  })
})
