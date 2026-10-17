import { describe, expect, it } from 'vitest'
import { formatAmount } from '@/lib/balance'
import { UNIT } from './config'
import {
  dayBlocks,
  endsAt,
  lockedAt,
  perDay,
  releasable,
  scheduleOver,
  stillLocked,
  type Vesting,
  type VestingSchedule,
} from './vesting'

const schedule = (over: Partial<VestingSchedule> = {}): VestingSchedule => ({
  locked: 100n * UNIT,
  perBlock: UNIT,
  startingBlock: 1_000,
  ...over,
})

describe('what a vesting schedule is still holding', () => {
  it('holds all of it until the starting block, however far before it is asked', () => {
    expect(lockedAt(schedule(), 0)).toBe(100n * UNIT)
    expect(lockedAt(schedule(), 999)).toBe(100n * UNIT)
    expect(lockedAt(schedule(), 1_000)).toBe(100n * UNIT)
  })

  it('thaws the per block amount every block after it', () => {
    expect(lockedAt(schedule(), 1_001)).toBe(99n * UNIT)
    expect(lockedAt(schedule(), 1_050)).toBe(50n * UNIT)
  })

  it('never holds less than nothing, whatever the clock says', () => {
    expect(lockedAt(schedule(), 1_100)).toBe(0n)
    expect(lockedAt(schedule(), 9_999_999)).toBe(0n)
  })

  it('adds up across the schedules an account carries', () => {
    const held = [schedule(), schedule({ locked: 40n * UNIT, perBlock: 2n * UNIT })]
    expect(stillLocked(held, 1_010)).toBe(90n * UNIT + 20n * UNIT)
  })
})

/** What the account carries once the pallet has worked the lock out at `at`. */
const vestedAt = (schedules: VestingSchedule[], at: number): Vesting => ({
  schedules,
  lock: stillLocked(schedules, at),
})

describe('what calling vest would free', () => {
  it('is everything thawed since the grant when nobody has asked for it', () => {
    expect(releasable(vestedAt([schedule()], 0), 1_000)).toBe(0n)
    expect(releasable(vestedAt([schedule()], 0), 1_030)).toBe(30n * UNIT)
    expect(releasable(vestedAt([schedule()], 0), 5_000)).toBe(100n * UNIT)
  })

  it('is only what thawed since the lock was last worked out', () => {
    expect(releasable(vestedAt([schedule()], 1_020), 1_030)).toBe(10n * UNIT)
  })

  it('adds up across the schedules an account carries', () => {
    const held = [schedule(), schedule({ locked: 40n * UNIT, perBlock: 2n * UNIT })]
    expect(releasable(vestedAt(held, 1_010), 1_020)).toBe(30n * UNIT)
  })

  // The head is finalized and the lock is read at the best block
  it('is nothing when the lock was worked out after the block asked about', () => {
    expect(releasable(vestedAt([schedule()], 1_040), 1_030)).toBe(0n)
  })

  // Read off mainnet the block before this account vested at 206,761
  it('frees what the chain freed', () => {
    const granted = schedule({
      locked: 49_309_252_606_758_216_526_604n,
      perBlock: 7_817_930_715_176_024n,
      startingBlock: 0,
    })
    const vesting = { schedules: [granted], lock: 49_270_460_034_549_513_095_516n }
    expect(releasable(vesting, 206_761)).toBe(1_577_650_600_391_806_467_176n)
  })
})

describe('when a schedule runs out', () => {
  it('lands on the block the last of it thaws', () => {
    expect(endsAt(schedule())).toBe(1_100)
    expect(lockedAt(schedule(), endsAt(schedule()))).toBe(0n)
  })

  // A remainder needs one more block, so rounding down would say it is done
  it('takes a whole block for what is left over', () => {
    const odd = schedule({ locked: 100n * UNIT + 1n })
    expect(endsAt(odd)).toBe(1_101)
    expect(lockedAt(odd, 1_100)).toBe(1n)
    expect(lockedAt(odd, 1_101)).toBe(0n)
  })
})

/** Block time the cases below are written against. */
const BLOCK_SECONDS = 10
const DAY_BLOCKS = dayBlocks(BLOCK_SECONDS)

describe('writing a schedule from a duration', () => {
  it('spreads the grant across the days asked for', () => {
    const made = scheduleOver(3_650n * UNIT, 365, 500, BLOCK_SECONDS)
    expect(made.startingBlock).toBe(500)
    expect(made.perBlock).toBe((3_650n * UNIT) / BigInt(365 * DAY_BLOCKS))
  })

  // The chain holds a rate, and a rate that does not divide the grant evenly
  // runs one block over rather than paying the remainder early
  it('lands within a block of the duration', () => {
    for (const [locked, days] of [
      [3_650n * UNIT, 365],
      [7n * UNIT + 13n, 11],
      [1n * UNIT, 1],
    ] as const) {
      const made = scheduleOver(locked, days, 0, BLOCK_SECONDS)
      const asked = days * DAY_BLOCKS
      expect(endsAt(made)).toBeGreaterThanOrEqual(asked)
      expect(endsAt(made)).toBeLessThanOrEqual(asked + 1)
      expect(lockedAt(made, endsAt(made))).toBe(0n)
    }
  })

  it('thaws it all in one block when no duration is asked for', () => {
    const made = scheduleOver(100n * UNIT, 0, 90, BLOCK_SECONDS)
    expect(made.perBlock).toBe(100n * UNIT)
    expect(endsAt(made)).toBe(91)
  })

  it('reads out as a daily rate, since a per block one rounds to nothing', () => {
    const made = scheduleOver(100n * UNIT, 365, 0, BLOCK_SECONDS)
    expect(formatAmount(made.perBlock)).toBe('≈0.0000')
    expect(formatAmount(perDay(made, BLOCK_SECONDS))).toBe('≈0.2739')
  })
})
