import { describe, expect, it } from 'vitest'
import { alive, minutesLeft, provenFrom, type Checks } from './verify'

const NOW = 1_700_000_000_000
const DAY = 24 * 60 * 60 * 1000
const MINUTE = 60 * 1000

const checks: Checks = {
  telegram: { handle: 'alice', expiresAt: NOW + DAY },
  discord: { handle: 'alice_dc', expiresAt: NOW + 1 },
}

describe('alive', () => {
  it('keeps what still stands and drops what expired', () => {
    expect(alive(checks, NOW)).toEqual(checks)
    expect(alive(checks, NOW + 1)).toEqual({ telegram: checks.telegram })
    expect(alive(checks, NOW + DAY)).toEqual({})
  })

  it('leaves an empty set empty', () => {
    expect(alive({}, NOW)).toEqual({})
  })
})

describe('minutesLeft', () => {
  it('rounds a part minute up, so a live sign in never reads as zero', () => {
    expect(minutesLeft(NOW + 60 * MINUTE, NOW)).toBe(60)
    expect(minutesLeft(NOW + 3 * MINUTE - 1, NOW)).toBe(3)
    expect(minutesLeft(NOW + 1, NOW)).toBe(1)
  })

  it('floors at zero once it is gone', () => {
    expect(minutesLeft(NOW, NOW)).toBe(0)
    expect(minutesLeft(NOW - MINUTE, NOW)).toBe(0)
  })
})

describe('provenFrom', () => {
  it('writes held handles and leaves the rest blank', () => {
    expect(provenFrom({ telegram: checks.telegram! })).toEqual({
      telegram: 'alice',
      discord: '',
    })
    expect(provenFrom({})).toEqual({ telegram: '', discord: '' })
  })
})
