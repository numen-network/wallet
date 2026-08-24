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

describe('what calling vest would free', () => {
  it('is everything thawed and not yet asked for', () => {
    expect(releasable([schedule()], 1_000)).toBe(0n)
    expect(releasable([schedule()], 1_030)).toBe(30n * UNIT)
    expect(releasable([schedule()], 5_000)).toBe(100n * UNIT)
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
    expect(formatAmount(made.perBlock)).toBe('0.0000')
    expect(formatAmount(perDay(made, BLOCK_SECONDS))).toBe('0.2739')
  })
})
