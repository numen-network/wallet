import { describe, expect, it } from 'vitest'
import { UNIT } from './config'
import type { Spender } from './types'
import {
  approval,
  countdown,
  hasRefund,
  metadataDump,
  readMeta,
  readableTrack,
  refundsSubmission,
  SORTS,
  spendState,
  support,
  thresholds,
  TITLE_MAX,
  trackFor,
  trackLabel,
  voteByte,
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
    expect(JSON.parse(metadataDump('Fund the explorer', 'A year of hosting'))).toEqual({
      title: 'Fund the explorer',
      description: 'A year of hosting',
    })
  })

  it('reads a dump another tool wrote', () => {
    expect(readMeta('{"title":"Fund the explorer","description":"the long version"}')).toEqual({
      title: 'Fund the explorer',
      description: 'the long version',
    })
  })

  it('has nothing for anything it cannot make sense of', () => {
    for (const dump of ['not json at all', 'null', '"a bare string"', '{"title":42}']) {
      expect(readMeta(dump)).toEqual({ title: null, description: null })
    }
    expect(readMeta('{"description":"no title in here"}').title).toBeNull()
    expect(readMeta('{"title":"   "}').title).toBeNull()
  })

  // The card has one line for it. The description has a page of its own
  it('cuts a title nobody could fit on a card, and leaves the rest whole', () => {
    const long = 'x'.repeat(TITLE_MAX + 50)
    expect(readMeta(JSON.stringify({ title: long })).title).toHaveLength(TITLE_MAX)
    expect(readMeta(metadataDump(long, long)).title).toHaveLength(TITLE_MAX)
    expect(readMeta(metadataDump(long, long)).description).toHaveLength(TITLE_MAX + 50)
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
