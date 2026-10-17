
/**
 * pallet_vesting freezes a balance and thaws it a fixed amount per block. The
 * chain does not move anything on its own, so what has thawed stays frozen
 * until somebody calls vest and the freeze is worked out again.
 */
export interface VestingSchedule {
  /** What it started with, which is not what is still held. */
  locked: bigint
  perBlock: bigint
  startingBlock: number
}

/** An account's schedules and the freeze the chain holds for them. */
export interface Vesting {
  schedules: VestingSchedule[]
  /**
   * The vesting entry of Balances.Locks. The pallet sets it to what the
   * schedules still hold whenever one is added or vest runs, and nothing moves
   * it in between.
   */
  lock: bigint
}

/**
 * What this schedule still holds at that block, the way VestingInfo::locked_at
 * works it out. Nothing has thawed before the starting block, and the answer
 * never goes below zero however long it has run.
 */
export function lockedAt(schedule: VestingSchedule, height: number): bigint {
  const elapsed = BigInt(Math.max(0, height - schedule.startingBlock))
  const thawed = elapsed * schedule.perBlock
  return thawed >= schedule.locked ? 0n : schedule.locked - thawed
}

export const stillLocked = (schedules: VestingSchedule[], height: number): bigint =>
  schedules.reduce((total, schedule) => total + lockedAt(schedule, height), 0n)

/**
 * What calling vest would free, which is how far the lock has fallen behind the
 * schedules. A lock written after `height` has nothing to give at it.
 */
export function releasable({ schedules, lock }: Vesting, height: number): bigint {
  const still = stillLocked(schedules, height)
  return lock > still ? lock - still : 0n
}

/** Blocks in a day, since a grant is written in days and stored per block. */
export const dayBlocks = (blockSeconds: number) => 86_400 / blockSeconds

/**
 * What a schedule thaws in a day. A per block figure of a normal grant rounds
 * to zero at any precision worth reading, so this is the rate to show.
 */
export const perDay = (schedule: VestingSchedule, blockSeconds: number): bigint =>
  schedule.perBlock * BigInt(dayBlocks(blockSeconds))

/**
 * The schedule that pays `locked` out over `days` from `start`. The chain holds
 * a rate rather than an end, so a duration is only what the rate was worked out
 * from, and endsAt is where it really lands.
 */
export function scheduleOver(
  locked: bigint,
  days: number,
  start: number,
  blockSeconds: number,
): VestingSchedule {
  const blocks = BigInt(Math.max(1, Math.round(days * dayBlocks(blockSeconds))))
  return { locked, perBlock: locked / blocks, startingBlock: start }
}

/** The block a schedule finishes on, which is what says how long is left. */
export function endsAt(schedule: VestingSchedule): number {
  if (schedule.perBlock === 0n) return schedule.startingBlock
  const blocks = schedule.locked / schedule.perBlock
  const whole = schedule.locked % schedule.perBlock === 0n ? blocks : blocks + 1n
  return schedule.startingBlock + Number(whole)
}
