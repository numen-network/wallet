import { describe, expect, it } from 'vitest'
import { UNIT } from './config'
import { lockedOf, totalOf, transferableOf } from './types'

/**
 * The two computed figures, worked out the way polkadot.js works them out and
 * the way the explorer reads them back. Neither comes out of storage as it
 * stands, so both are kept here rather than at the call sites.
 */

/** Stands in for whatever the chain charges, since the function now takes it. */
const DEPOSIT = UNIT / 1_000_000n

const WHOLE_BALANCE = (1n << 128n) - 1n

describe('what may leave the account', () => {
  it('is the whole free balance when nothing is frozen or reserved', () => {
    expect(transferableOf(100n * UNIT, 0n, 0n, DEPOSIT)).toBe(100n * UNIT)
  })

  // A reserve or a freeze keeps a reference on the account, and an account with
  // a reference has to stay alive
  it('keeps the deposit back once anything is reserved', () => {
    expect(transferableOf(100n * UNIT, UNIT, 0n, DEPOSIT)).toBe(100n * UNIT - DEPOSIT)
  })

  it('takes the freeze off the free balance', () => {
    expect(transferableOf(100n * UNIT, 0n, 30n * UNIT, DEPOSIT)).toBe(70n * UNIT)
  })

  // The reserve counts against the freeze, so taking the freeze off the free
  // balance on its own would hold back money that may be spent
  it('lets the reserve answer for the freeze first', () => {
    expect(transferableOf(100n * UNIT, 20n * UNIT, 30n * UNIT, DEPOSIT)).toBe(90n * UNIT)
  })

  it('falls back on the deposit when the reserve covers the whole freeze', () => {
    expect(transferableOf(100n * UNIT, 30n * UNIT, 20n * UNIT, DEPOSIT)).toBe(
      100n * UNIT - DEPOSIT,
    )
  })

  it('is nothing rather than a negative when the freeze is bigger than free', () => {
    expect(transferableOf(10n * UNIT, 0n, 30n * UNIT, DEPOSIT)).toBe(0n)
  })
})

describe('what the locks hold', () => {
  it('is nothing when there are none', () => {
    expect(lockedOf([])).toBe(0n)
  })

  // Locks overlap rather than stack, so adding them up would report more than
  // the chain ever froze
  it('is the biggest of them rather than their sum', () => {
    expect(lockedOf([30n * UNIT, 5n * UNIT, 12n * UNIT])).toBe(30n * UNIT)
  })

  it('leaves out the lock that holds everything', () => {
    expect(lockedOf([WHOLE_BALANCE, 12n * UNIT])).toBe(12n * UNIT)
    expect(lockedOf([WHOLE_BALANCE])).toBe(0n)
  })
})

describe('the whole of a balance', () => {
  it('is the free side and the reserve, whatever is frozen on top', () => {
    const balance = {
      free: 70n * UNIT,
      reserved: 30n * UNIT,
      frozen: 50n * UNIT,
      transferable: 0n,
      locked: 0n,
    }
    expect(totalOf(balance)).toBe(100n * UNIT)
  })
})
