import { describe, expect, it } from 'vitest'
import { UNIT } from './config'
import type { Spender } from './types'
import {
  approval,
  countdown,
  dumpBytes,
  hasRefund,
  lockAfter,
  metadataDump,
  readMeta,
  readVoteByte,
  readableTrack,
  releaseOf,
  refundsSubmission,
  shutsTooSoon,
  SORTS,
  spendState,
  support,
  thresholds,
  TITLE_MAX,
  trackFor,
  trackLabel,
  trackRelease,
  voteByte,
  type CastVote,
  type ClassLock,
  type Referendum,
  type ReferendumState,
  type Settled,
  type Spend,
  type Track,
} from './governance'

describe('the track table the chain hands over', () => {
  it('reads a padded snake case name', () => {
    expect(readableTrack('small_spender\0\0\0\0')).toBe('Small spender')
    expect(readableTrack('big_spender')).toBe('Big spender')
  })

  it('names a track it has never heard of rather than showing nothing', () => {
    expect(trackLabel(undefined, 2)).toBe('Track 2')
    expect(trackLabel([], 2)).toBe('Track 2')
  })
})

describe('the bar a tally has to beat', () => {
  // The medium track as the runtime carries it
  const track = {
    id: 1,
    decisionPeriod: 1_000,
    approvalCurve: { kind: 'reciprocal', factor: 0.213017753, xOffset: 0.384615386, yOffset: 0.446153845 },
    supportCurve: { kind: 'linear', length: 1, floor: 0.02, ceil: 0.5 },
  } as Track
  const poll = (over: Partial<Referendum>) => ({ index: 1, track: 1, ...over }) as Referendum

  const at = (height: number, over: Partial<Referendum> = { deciding: { since: 0, confirming: null } }) =>
    thresholds(poll(over), [track], height)

  it('holds both curves at their hardest until the deciding starts', () => {
    const start = at(500, { deciding: null })
    expect(start?.approval).toBeCloseTo(100)
    expect(start?.support).toBeCloseTo(50)
  })

  it('eases both off as the decision period runs', () => {
    const half = at(500)
    expect(half?.approval).toBeCloseTo(68.7, 1)
    expect(half?.support).toBeCloseTo(26)
  })

  it('flattens both at the floor once the period is over', () => {
    const over = at(4_000)
    expect(over?.approval).toBeCloseTo(60)
    expect(over?.support).toBeCloseTo(2)
  })

  it('says nothing about a track it has no curves for', () => {
    expect(thresholds(poll({ deciding: null }), undefined, 0)).toBeNull()
    expect(thresholds(poll({ deciding: null }), [], 0)).toBeNull()
  })
})

/** What the runtime gives a referendum before it is called off undecided. */
const UNDECIDING_TIMEOUT = (14 * 24 * 3600) / 10

describe('the clock a running referendum is on', () => {
  const track = { id: 1, decisionPeriod: 1_000 } as Track
  const poll = (over: Partial<Referendum>) => ({ index: 1, track: 1, submitted: 100, ...over }) as Referendum

  it('counts one that has not started down to being called off', () => {
    const called = { label: 'Called off in', blocks: 100 + UNDECIDING_TIMEOUT - 500 }
    expect(countdown(poll({ deciding: null }), [track], 500, UNDECIDING_TIMEOUT)).toEqual(called)
  })

  it('counts a deciding one down to the end of its decision period', () => {
    const deciding = poll({ deciding: { since: 400, confirming: null } })
    expect(countdown(deciding, [track], 500, UNDECIDING_TIMEOUT)).toEqual({ label: 'Decision ends in', blocks: 900 })
  })

  it('counts a confirming one down to the block it passes at', () => {
    const confirming = poll({ deciding: { since: 400, confirming: 1_500 } })
    expect(countdown(confirming, [track], 500, UNDECIDING_TIMEOUT)).toEqual({ label: 'Passes in', blocks: 1_000 })
  })

  it('says nothing about a decision period it has no track for', () => {
    const deciding = poll({ deciding: { since: 400, confirming: null } })
    expect(countdown(deciding, undefined, 500, UNDECIDING_TIMEOUT)).toBeNull()
    expect(countdown(deciding, [], 500, UNDECIDING_TIMEOUT)).toBeNull()
  })
})

describe('the order the running list is read in', () => {
  const poll = (index: number, state: ReferendumState) => ({ index, state }) as Referendum
  const indexes = (list: Referendum[], sort: keyof typeof SORTS) =>
    [...list].sort(SORTS[sort]).map((referendum) => referendum.index)

  const list = [
    poll(0, 'preparing'),
    poll(1, 'deciding'),
    poll(2, 'queued'),
    poll(3, 'confirming'),
    poll(4, 'deciding'),
  ]

  it('puts the one nearest a decision at the top', () => {
    expect(indexes(list, 'state')).toEqual([3, 4, 1, 2, 0])
  })

  it('falls back to the newest inside a state', () => {
    expect(indexes([poll(1, 'deciding'), poll(7, 'deciding')], 'state')).toEqual([7, 1])
  })

  it('counts down by index when that is what was asked for', () => {
    expect(indexes(list, 'newest')).toEqual([4, 3, 2, 1, 0])
  })
})

describe('what a referendum carries as metadata', () => {
  it('survives the round trip through the dump, both halves of it', () => {
    expect(readMeta(metadataDump('Fund the explorer', 'A year of hosting'))).toEqual({
      title: 'Fund the explorer',
      description: 'A year of hosting',
    })
    expect(metadataDump('Fund the explorer', 'A year of hosting')).toBe(
      'Fund the explorer\n\nA year of hosting',
    )
  })

  it('reads a dump another tool wrote, blank separator or not', () => {
    expect(readMeta('Fund the explorer\n\nthe long version\nover two lines')).toEqual({
      title: 'Fund the explorer',
      description: 'the long version\nover two lines',
    })
    expect(readMeta('Fund the explorer\nthe long version')).toEqual({
      title: 'Fund the explorer',
      description: 'the long version',
    })
  })

  it('has nothing for a half that is not there', () => {
    expect(readMeta('')).toEqual({ title: null, description: null })
    expect(readMeta('   \n\n  ')).toEqual({ title: null, description: null })
    expect(readMeta('Only a subject')).toEqual({ title: 'Only a subject', description: null })
    expect(readMeta('\n\nno subject in here')).toEqual({
      title: null,
      description: 'no subject in here',
    })
    expect(metadataDump('Only a subject', '')).toBe('Only a subject')
  })

  it('keeps a break out of the title, which would smuggle it into the body', () => {
    expect(metadataDump('two\nlines', 'body')).toBe('two lines\n\nbody')
  })

  // The card has one line for it. The description has a page of its own
  it('cuts a title nobody could fit on a card, and leaves the rest whole', () => {
    const long = 'x'.repeat(TITLE_MAX + 50)
    expect(readMeta(long).title).toHaveLength(TITLE_MAX)
    expect(readMeta(metadataDump(long, long)).title).toHaveLength(TITLE_MAX)
    expect(readMeta(metadataDump(long, long)).description).toHaveLength(TITLE_MAX + 50)
  })

  it('prices a dump in bytes rather than characters', () => {
    expect(dumpBytes('概要')).toBe(6)
  })
})

describe('an approved treasury spend, which pays nobody on its own', () => {
  const spend = (over: Partial<Spend> = {}): Spend => ({
    index: 0,
    amount: UNIT,
    beneficiary: 'nu7',
    validFrom: 100,
    expireAt: 200,
    paid: false,
    ...over,
  })

  it('reads the bounds the payout call checks, the same way round', () => {
    expect(spendState(spend(), 99)).toBe('waiting')
    expect(spendState(spend(), 100)).toBe('ready')
    expect(spendState(spend(), 199)).toBe('ready')
    // payout wants expire_at strictly after now, so the last block is not one
    expect(spendState(spend(), 200)).toBe('expired')
  })

  it('is paid whatever the clock says, since the money has already moved', () => {
    expect(spendState(spend({ paid: true }), 0)).toBe('paid')
    expect(spendState(spend({ paid: true }), 5_000)).toBe('paid')
  })
})

describe('a payout the referendum would outlast', () => {
  // Blocks, at the ten second target the runtime holds
  const DAY = (24 * 3600) / 10
  const HEIGHT = 4_000_000
  // Big spender takes longer to run than the window a spend is claimable for
  const BIG = 35 * DAY
  const WINDOW = 30 * DAY

  it('turns down a date the referendum has not finished by', () => {
    expect(shutsTooSoon(HEIGHT + 3 * DAY, HEIGHT, BIG, WINDOW)).toBe(true)
  })

  it('takes one far enough out to still be claimable', () => {
    expect(shutsTooSoon(HEIGHT + 6 * DAY, HEIGHT, BIG, WINDOW)).toBe(false)
  })

  // payout wants expire_at strictly after now, so landing on it is already shut
  it('counts the boundary as shut, the way the pallet reads it', () => {
    expect(shutsTooSoon(HEIGHT + 5 * DAY, HEIGHT, BIG, WINDOW)).toBe(true)
  })

  it('leaves a dateless payout alone, since the chain dates it on enactment', () => {
    expect(shutsTooSoon(null, HEIGHT, BIG, WINDOW)).toBe(false)
  })

  it('lets any date through on a track that finishes inside the window', () => {
    expect(shutsTooSoon(HEIGHT + 1, HEIGHT, 8 * DAY, WINDOW)).toBe(false)
  })
})

describe('what a finished referendum gives back', () => {
  const held = { who: 'nu7', amount: 100n * UNIT }
  const settled = (over: Partial<Settled> = {}): Settled => ({
    index: 0,
    outcome: 'approved',
    submission: held,
    decision: held,
    ...over,
  })

  // Losing costs the submission deposit, which is the whole point of it
  it('hands the submission deposit back only after approval or a cancel', () => {
    expect(refundsSubmission(settled({ outcome: 'approved' }))).toBe(true)
    expect(refundsSubmission(settled({ outcome: 'cancelled' }))).toBe(true)
    expect(refundsSubmission(settled({ outcome: 'rejected' }))).toBe(false)
    expect(refundsSubmission(settled({ outcome: 'timedOut' }))).toBe(false)
  })

  it('hands the decision deposit back however it ended', () => {
    for (const outcome of ['approved', 'rejected', 'timedOut', 'cancelled'] as const) {
      expect(hasRefund(settled({ outcome, submission: null }))).toBe(true)
    }
  })

  it('has nothing to show once there is nothing left to ask for', () => {
    expect(hasRefund(settled({ submission: null, decision: null }))).toBe(false)
    // Rejected keeps the submission deposit, so holding one is not owing one
    expect(hasRefund(settled({ outcome: 'rejected', decision: null }))).toBe(false)
    expect(hasRefund(settled({ outcome: 'approved', decision: null }))).toBe(true)
  })
})

/** The spender table as the runtime publishes it, cheapest track first. */
const SPENDERS: Spender[] = [
  { track: 0, origin: 'SmallSpender', cap: 200_000n * UNIT },
  { track: 1, origin: 'MediumSpender', cap: 1_000_000n * UNIT },
  { track: 2, origin: 'BigSpender', cap: 10_000_000n * UNIT },
]

describe('picking the track for a proposal', () => {
  it('takes the cheapest one that can release the amount', () => {
    expect(trackFor(1n, SPENDERS)).toBe(0)
    expect(trackFor(200_000n * UNIT, SPENDERS)).toBe(0)
    expect(trackFor(200_000n * UNIT + 1n, SPENDERS)).toBe(1)
    expect(trackFor(1_000_000n * UNIT, SPENDERS)).toBe(1)
    expect(trackFor(9_999_999n * UNIT, SPENDERS)).toBe(2)
  })

  it('has nothing for an amount past the biggest cap', () => {
    expect(trackFor(10_000_001n * UNIT, SPENDERS)).toBeNull()
  })
})

describe('packing a vote into the byte the chain stores', () => {
  it('sets the top bit for aye and carries the conviction below it', () => {
    expect(voteByte({ kind: 'aye', conviction: 'Locked1x', amount: 1n })).toBe(0x81)
    expect(voteByte({ kind: 'nay', conviction: 'Locked1x', amount: 1n })).toBe(0x01)
    expect(voteByte({ kind: 'aye', conviction: 'None', amount: 1n })).toBe(0x80)
    expect(voteByte({ kind: 'aye', conviction: 'Locked6x', amount: 1n })).toBe(0x86)
    expect(voteByte({ kind: 'nay', conviction: 'Locked6x', amount: 1n })).toBe(0x06)
  })

  it('gives abstain no side and no conviction', () => {
    expect(voteByte({ kind: 'abstain', amount: 1n })).toBe(0)
  })
})

describe('what the two curves are compared against', () => {
  const tally = { ayes: 30n * UNIT, nays: 10n * UNIT, support: 25n * UNIT }

  it('measures approval against the votes cast', () => {
    expect(approval(tally)).toBe(75)
    expect(approval({ ayes: 0n, nays: 0n, support: 0n })).toBe(0)
  })

  // The treasury pot is deactivated, so counting it would put every referendum
  // out of reach of its support curve
  it('measures support against active issuance rather than everything minted', () => {
    expect(support(tally, 100n * UNIT)).toBe(25)
    expect(support(tally, 0n)).toBe(0)
  })
})

const LOCKING = 60_480
const HEIGHT = 1_000_000
const ENDED = HEIGHT - 1_000

const cast = (over: Partial<CastVote> = {}): CastVote => ({
  poll: 1,
  side: 'aye',
  conviction: 'Locked3x',
  amount: 100n * UNIT,
  outcome: { kind: 'ended', approved: true, at: ENDED },
  ...over,
})

const lock = (votes: CastVote[], prior = { until: 0, amount: 0n }): ClassLock => ({
  track: 0,
  amount: 0n,
  votes,
  prior,
})

describe('reading a vote back out of the byte the chain stores', () => {
  it('takes the top bit for the side and the rest for the conviction', () => {
    expect(readVoteByte(0x81)).toEqual({ side: 'aye', conviction: 'Locked1x' })
    expect(readVoteByte(0x06)).toEqual({ side: 'nay', conviction: 'Locked6x' })
    expect(readVoteByte(0x80)).toEqual({ side: 'aye', conviction: 'None' })
  })

  it('turns down a byte naming no conviction', () => {
    expect(() => readVoteByte(0x07)).toThrow('names no conviction')
  })
})

describe('when one vote lets go of its balance', () => {
  it('says nothing about a referendum still running, which has no end to count from', () => {
    expect(releaseOf(cast({ outcome: { kind: 'running' } }), LOCKING, HEIGHT)).toEqual({
      kind: 'running',
    })
  })

  it('frees a vote on a referendum that was called off', () => {
    expect(releaseOf(cast({ outcome: { kind: 'void' } }), LOCKING, HEIGHT)).toEqual({
      kind: 'free',
      why: 'cancelled',
    })
  })

  // Locked3x is four lock periods, which is where the multiplier stops matching
  // the count of periods
  it('holds the winning side for as many periods as the conviction bought', () => {
    expect(releaseOf(cast(), LOCKING, HEIGHT)).toEqual({
      kind: 'held',
      until: ENDED + 4 * LOCKING,
    })
  })

  it('holds a nay the referendum agreed with', () => {
    const nay = cast({ side: 'nay', outcome: { kind: 'ended', approved: false, at: ENDED } })
    expect(releaseOf(nay, LOCKING, HEIGHT)).toEqual({ kind: 'held', until: ENDED + 4 * LOCKING })
  })

  it('frees the losing side however heavy the conviction', () => {
    const lost = cast({ conviction: 'Locked6x', outcome: { kind: 'ended', approved: false, at: ENDED } })
    expect(releaseOf(lost, LOCKING, HEIGHT)).toEqual({ kind: 'free', why: 'lost' })
  })

  it('frees a vote cast without conviction', () => {
    expect(releaseOf(cast({ conviction: 'None' }), LOCKING, HEIGHT)).toEqual({
      kind: 'free',
      why: null,
    })
  })

  it('frees a split or an abstain, neither of which names a side', () => {
    expect(releaseOf(cast({ side: 'split', conviction: 'None' }), LOCKING, HEIGHT)).toEqual({
      kind: 'free',
      why: null,
    })
    expect(releaseOf(cast({ side: 'abstain', conviction: 'None' }), LOCKING, HEIGHT)).toEqual({
      kind: 'free',
      why: null,
    })
  })

  it('frees a vote whose conviction has already run out', () => {
    const old = cast({ outcome: { kind: 'ended', approved: true, at: HEIGHT - 5 * LOCKING } })
    expect(releaseOf(old, LOCKING, HEIGHT)).toEqual({ kind: 'free', why: null })
  })
})

describe('when a whole track lets go', () => {
  it('reports what it is waiting on rather than a time it cannot know', () => {
    const held = lock([cast(), cast({ poll: 2, outcome: { kind: 'running' } })])
    expect(trackRelease(held, LOCKING, HEIGHT)).toEqual({ kind: 'running', count: 1 })
  })

  it('waits on the last of its convictions to run out', () => {
    const held = lock([cast(), cast({ poll: 2, conviction: 'Locked1x' })])
    expect(trackRelease(held, LOCKING, HEIGHT)).toEqual({
      kind: 'held',
      until: ENDED + 4 * LOCKING,
    })
  })

  it('counts what earlier votes still hold', () => {
    const held = lock([cast({ conviction: 'None' })], { until: HEIGHT + 500, amount: 5n * UNIT })
    expect(trackRelease(held, LOCKING, HEIGHT)).toEqual({ kind: 'held', until: HEIGHT + 500 })
  })

  it('is free once nothing is holding it', () => {
    const held = lock([cast({ conviction: 'None' })], { until: HEIGHT - 1, amount: 5n * UNIT })
    expect(trackRelease(held, LOCKING, HEIGHT)).toEqual({ kind: 'free' })
  })
})

describe('what a track still locks once its finished votes are taken back', () => {
  // Locks overlap rather than stack, so a 100 and a 300 hold 300 between them
  it('holds the largest of what stays rather than adding them up', () => {
    const held = lock([cast(), cast({ poll: 2, amount: 300n * UNIT })])
    expect(lockAfter(held, LOCKING, HEIGHT)).toBe(300n * UNIT)
  })

  it('drops a vote that is free and keeps one still running', () => {
    const held = lock([
      cast({ amount: 900n * UNIT, conviction: 'None' }),
      cast({ poll: 2, amount: 200n * UNIT, outcome: { kind: 'running' } }),
    ])
    expect(lockAfter(held, LOCKING, HEIGHT)).toBe(200n * UNIT)
  })

  it('goes on holding what a vote carried into the prior span', () => {
    const held = lock([cast({ amount: 400n * UNIT })])
    expect(lockAfter(held, LOCKING, HEIGHT)).toBe(400n * UNIT)
  })

  it('lets go of everything once every vote is free and the prior span has run out', () => {
    const held = lock([cast({ conviction: 'None' })], { until: HEIGHT - 1, amount: 5n * UNIT })
    expect(lockAfter(held, LOCKING, HEIGHT)).toBe(0n)
  })
})
