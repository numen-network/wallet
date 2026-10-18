import { describe, expect, it } from 'vitest'
import { UNIT } from './config'
import { lockedOf, totalOf, transferableOf } from './types'

/**
 * The two computed figures, worked out the way the explorer reads them back.
 * Neither comes out of storage as it
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
  const held = (free: bigint, reserved: bigint, frozen: bigint) => ({
    free,
    reserved,
    frozen,
    transferable: transferableOf(free, reserved, frozen, 0n),
  })

  it('is nothing when nothing is frozen or reserved', () => {
    expect(lockedOf(held(50n * UNIT, 0n, 0n))).toBe(0n)
  })

  it('counts a deposit no lock covers', () => {
    expect(lockedOf(held(98_512_014_386_512_943_379n, 5_870_000_000_000_000_000n, 0n))).toBe(5_870_000_000_000_000_000n)
  })

  it('counts a deposit once when a bigger lock covers it', () => {
    const balance = held(2_122_000_258_102_383_578_190_096n, 2_000n * UNIT, 2_124_000n * UNIT)
    expect(lockedOf(balance)).toBe(2_124_000n * UNIT)
  })

  it('is the whole balance when the freeze outgrows it', () => {
    expect(lockedOf(held(10n * UNIT, 2n * UNIT, WHOLE_BALANCE))).toBe(12n * UNIT)
  })

  it('and transferable add up to the balance', () => {
    const balance = held(70n * UNIT, 30n * UNIT, 50n * UNIT)
    expect(balance.transferable + lockedOf(balance)).toBe(totalOf(balance))
  })
})

describe('the whole of a balance', () => {
  it('is the free side and the reserve, whatever is frozen on top', () => {
    const balance = {
      free: 70n * UNIT,
      reserved: 30n * UNIT,
      frozen: 50n * UNIT,
      transferable: 0n,
    }
    expect(totalOf(balance)).toBe(100n * UNIT)
  })
})
