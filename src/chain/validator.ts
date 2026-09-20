/**
 * pallet_validator decides who votes on finality and pallet_session swaps the
 * voters on a fixed period. A boundary picks the set for the session after the
 * one it starts, so whatever is signed now reaches the votes two boundaries on.
 */

export type LockStatus = 'Active' | 'ExitRequested' | 'Kicked'

export interface ValidatorLock {
  amount: bigint
  since: number
  /** Moves out on every renewal for as long as the status stays Active. */
  until: number
  status: LockStatus
}

export interface SessionKeys {
  grandpa: string
  imOnline: string
}

export interface ValidatorSet {
  /** Voting this session. */
  sitting: string[]
  /** Picked at the last boundary to vote from the next one. */
  elected: string[]
  queued: string[]
}

export interface ValidatorRecord {
  lock: ValidatorLock | null
  exempt: boolean
  /** The last block a kicked account is still barred at. The record stays until it joins again. */
  cooldown: number | null
  keys: SessionKeys | null
  /** Null unless the account votes this session. */
  heartbeat: boolean | null
}

/** The first block after the head that starts a session, the way PeriodicSessions counts. */
export function nextBoundary(height: number, period: number, offset: number): number {
  if (height < offset) return offset
  return offset + (Math.floor((height - offset) / period) + 1) * period
}

/**
 * The block a change signed now first shows in this account's votes. An account
 * already picked for the next session votes as picked through it, so the change
 * waits a session longer. Null for an account that is neither voting nor picked.
 */
export function handoverAt(
  set: ValidatorSet,
  address: string,
  boundary: number,
  period: number,
): number | null {
  if (set.elected.includes(address)) return boundary + period
  if (set.sitting.includes(address)) return boundary
  return null
}

/**
 * What joining now locks and until when, the way Validator.lock works it out. A
 * lock still running is refreshed rather than replaced, and the refresh keeps
 * whichever amount and expiry bind harder.
 */
export function stakeFor(
  record: ValidatorRecord,
  stake: bigint,
  height: number,
  period: number,
): { amount: bigint; until: number } {
  const required = record.exempt ? 0n : stake
  const fresh = height + period
  const previous = record.lock
  if (!previous) return { amount: required, until: fresh }
  return {
    amount: previous.amount > required ? previous.amount : required,
    until: Math.max(previous.until, fresh),
  }
}

/** The checks Validator.lock runs before it takes anybody, in its order. */
export const GATES = ['membership', 'seats', 'keys', 'identity', 'cooldown', 'balance'] as const

export type Gate = (typeof GATES)[number]

export interface Candidate {
  address: string
  set: ValidatorSet
  record: ValidatorRecord
  qualified: boolean
  free: bigint
  /** What joining locks, which is what the free balance has to cover. */
  amount: bigint
  height: number
  maxValidators: number
}

export function gatesFor(candidate: Candidate): Record<Gate, boolean> {
  const { address, set, record } = candidate
  return {
    membership: !set.elected.includes(address) && !set.queued.includes(address),
    seats: set.elected.length + set.queued.length < candidate.maxValidators,
    keys: record.keys !== null,
    identity: candidate.qualified,
    // The call lands a block past the head at the earliest
    cooldown: record.cooldown === null || record.cooldown <= candidate.height,
    balance: candidate.free >= candidate.amount,
  }
}
