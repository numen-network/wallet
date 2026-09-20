import { describe, expect, it } from 'vitest'
import { UNIT } from './config'
import {
  gatesFor,
  handoverAt,
  nextBoundary,
  stakeFor,
  type Candidate,
  type ValidatorRecord,
  type ValidatorSet,
} from './validator'

const ME = 'nu3oNksEGXV3Tsr4sBeRUpcfA5zYp4VvZ7t9uKVPMAe2UCo98'
const OTHER = 'nu2uaQWzSyDzXHrgd78sQL2871qL2LpPU6kHeeb4ETtXfnASg'
const STAKE = 100_000_000n * UNIT
const PERIOD = 1_555_200

const set = (over: Partial<ValidatorSet> = {}): ValidatorSet => ({
  sitting: [OTHER],
  elected: [OTHER],
  queued: [],
  ...over,
})

const record = (over: Partial<ValidatorRecord> = {}): ValidatorRecord => ({
  lock: null,
  exempt: false,
  cooldown: null,
  keys: { grandpa: '0x01', imOnline: '0x02' },
  heartbeat: null,
  ...over,
})

describe('the next session boundary', () => {
  it('is the next multiple of the period, never the block the head is on', () => {
    expect(nextBoundary(0, 60, 0)).toBe(60)
    expect(nextBoundary(59, 60, 0)).toBe(60)
    expect(nextBoundary(60, 60, 0)).toBe(120)
    expect(nextBoundary(61, 60, 0)).toBe(120)
  })

  it('counts from the offset, which is the first boundary there is', () => {
    expect(nextBoundary(0, 60, 5)).toBe(5)
    expect(nextBoundary(4, 60, 5)).toBe(5)
    expect(nextBoundary(5, 60, 5)).toBe(65)
  })
})

describe('when a change signed now reaches the votes', () => {
  it('waits a session past the boundary for an account already picked', () => {
    expect(handoverAt(set({ elected: [ME] }), ME, 120, 60)).toBe(180)
  })

  it('comes at the boundary for one that sits and is not picked again', () => {
    expect(handoverAt(set({ sitting: [ME] }), ME, 120, 60)).toBe(120)
  })

  it('never comes for one that is not voting', () => {
    expect(handoverAt(set({ queued: [ME] }), ME, 120, 60)).toBeNull()
  })
})

describe('what joining locks', () => {
  it('locks the stake for the whole period from a clean start', () => {
    expect(stakeFor(record(), STAKE, 1_000, PERIOD)).toEqual({
      amount: STAKE,
      until: 1_000 + PERIOD,
    })
  })

  it('locks nothing for an exempt account', () => {
    expect(stakeFor(record({ exempt: true }), STAKE, 1_000, PERIOD).amount).toBe(0n)
  })

  it('keeps whatever a running lock holds harder', () => {
    const running = record({
      exempt: true,
      lock: { amount: STAKE, since: 0, until: 9_000_000, status: 'ExitRequested' },
    })
    expect(stakeFor(running, STAKE, 1_000, PERIOD)).toEqual({ amount: STAKE, until: 9_000_000 })
  })

  it('moves a running lock out to a fresh period and up to the stake', () => {
    const running = record({
      lock: { amount: 0n, since: 0, until: 2_000, status: 'Kicked' },
    })
    expect(stakeFor(running, STAKE, 1_000, PERIOD)).toEqual({
      amount: STAKE,
      until: 1_000 + PERIOD,
    })
  })
})

describe('the checks lock runs before it takes an account', () => {
  const candidate = (over: Partial<Candidate> = {}): Candidate => ({
    address: ME,
    set: set(),
    record: record(),
    qualified: true,
    free: STAKE,
    amount: STAKE,
    height: 1_000,
    maxValidators: 1_000,
    ...over,
  })

  const failing = (over: Partial<Candidate>) =>
    Object.entries(gatesFor(candidate(over)))
      .filter(([, passes]) => !passes)
      .map(([gate]) => gate)

  it('all pass for a candidate that has done everything', () => {
    expect(failing({})).toEqual([])
  })

  it('turns away an account already picked or queued', () => {
    expect(failing({ set: set({ elected: [ME] }) })).toEqual(['membership'])
    expect(failing({ set: set({ queued: [ME] }) })).toEqual(['membership'])
  })

  it('lets back in an account that only sits, since it is on its way out', () => {
    expect(failing({ set: set({ sitting: [ME] }) })).toEqual([])
  })

  it('counts the queue against the seats', () => {
    expect(failing({ set: set({ queued: [OTHER] }), maxValidators: 2 })).toEqual(['seats'])
  })

  it('wants keys, a checked identity and the stake', () => {
    expect(failing({ record: record({ keys: null }) })).toEqual(['keys'])
    expect(failing({ qualified: false })).toEqual(['identity'])
    expect(failing({ free: STAKE - 1n })).toEqual(['balance'])
  })

  it('bars a kicked account through the last block of its cooldown', () => {
    expect(failing({ record: record({ cooldown: 1_001 }) })).toEqual(['cooldown'])
    expect(failing({ record: record({ cooldown: 1_000 }) })).toEqual([])
  })
})
