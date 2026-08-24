import { CONVICTIONS, type Conviction, type Spender } from './types'

/**
 * OpenGov as Numen runs it. Every track is a spender track, so a referendum is
 * always a treasury spend and nothing else can be proposed through one.
 */

/**
 * A threshold curve in one of the two shapes the runtime builds. Support falls
 * straight from ceil to floor. Approval runs down a reciprocal that eases off
 * early and then holds near its floor for the rest of the decision period.
 */
export type Curve =
  | {
      kind: 'linear'
      /** A fraction of the decision period. Past it the line is flat at the floor. */
      length: number
      /** Both are fractions of the vote. */
      floor: number
      ceil: number
    }
  | {
      kind: 'reciprocal'
      /** y = factor / (x + xOffset) + yOffset over the fraction of the period run. */
      factor: number
      xOffset: number
      yOffset: number
    }

export interface Track {
  id: number
  name: string
  decisionDeposit: bigint
  /** All four are block counts, which is what the chain thinks in. */
  preparePeriod: number
  decisionPeriod: number
  confirmPeriod: number
  minEnactmentPeriod: number
  maxDeciding: number
  approvalCurve: Curve
  supportCurve: Curve
}

export interface Tally {
  ayes: bigint
  nays: bigint
  /** Votes counted without their conviction, which is what the support bar wants. */
  support: bigint
}

/** How an account votes. Abstain carries weight for support and for neither side. */
export type Ballot =
  | { kind: 'aye' | 'nay'; conviction: Conviction; amount: bigint }
  | { kind: 'abstain'; amount: bigint }

export type Proposal =
  | { kind: 'spend'; amount: bigint; beneficiary: string }
  /** Anything else the chain is carrying, which on these tracks means a preimage. */
  | { kind: 'other'; label: string }

/**
 * Only the states a running referendum passes through. A settled one is history,
 * which is the explorer's to keep, so the wallet never reads one.
 */
export type ReferendumState = 'preparing' | 'queued' | 'deciding' | 'confirming'

export interface Referendum {
  index: number
  track: number
  /** What its metadata calls it, null until somebody sets one. */
  title: string | null
  /** The long version, from the same dump the title comes out of. */
  description: string | null
  state: ReferendumState
  tally: Tally
  proposal: Proposal
  decisionDeposit: bigint | null
  submitted: number
  /**
   * Null until it starts being decided. `confirming` is the block it passes at,
   * which the chain clears again if it loses its lead before then.
   */
  deciding: { since: number; confirming: number | null } | null
}

/**
 * pallet_referenda keeps a referendum's metadata as a preimage of a JSON dump.
 * The pallet says nothing about what goes in it, so the two keys below are the
 * whole of the contract between whatever opens a referendum and whatever reads
 * one back. Anybody may write their own dump, so nothing in there is trusted
 * past these two strings.
 */
export const TITLE_MAX = 120

/** As much of a dump as the wallet will believe, which is two strings. */
export interface Metadata {
  title: string | null
  description: string | null
}

export const NO_METADATA: Metadata = { title: null, description: null }

export function readMeta(dump: string): Metadata {
  let parsed: unknown
  try {
    parsed = JSON.parse(dump)
  } catch {
    return NO_METADATA
  }

  const held = parsed as { title?: unknown; description?: unknown } | null
  const headline = typeof held?.title === 'string' ? held.title.trim().slice(0, TITLE_MAX) : ''
  // Whatever length the proposer paid to store, since cutting it here would
  // hide half of what somebody is being asked to vote on
  const body = typeof held?.description === 'string' ? held.description.trim() : ''

  return { title: headline || null, description: body || null }
}

export function metadataDump(title: string, description: string): string {
  return JSON.stringify({
    title: title.trim().slice(0, TITLE_MAX),
    description: description.trim(),
  })
}

/**
 * A referendum that passes moves no money. pallet_treasury books an approved
 * spend, and somebody has to claim it before the payout window shuts, after
 * which the money stays where it was.
 */
export interface Spend {
  index: number
  amount: bigint
  beneficiary: string
  /** Block counts, which is what the chain thinks in. */
  validFrom: number
  expireAt: number
  /** True once the payout moved it and only the record is left behind. */
  paid: boolean
}

export type SpendState = 'waiting' | 'ready' | 'paid' | 'expired'

/** The bounds pallet_treasury's payout checks, read the same way round. */
export function spendState(spend: Spend, height: number): SpendState {
  if (spend.paid) return 'paid'
  if (height >= spend.expireAt) return 'expired'
  return height < spend.validFrom ? 'waiting' : 'ready'
}

export const SPEND_LABELS: Record<SpendState, string> = {
  waiting: 'not yet',
  ready: 'ready',
  paid: 'paid',
  expired: 'expired',
}

/** Whose money a deposit is, which is who it goes back to. */
export interface Held {
  who: string
  amount: bigint
}

/**
 * How a referendum ended. Killed carries no deposits, so nothing here can come
 * from one and the wallet never draws it.
 */
export type Outcome = 'approved' | 'rejected' | 'timedOut' | 'cancelled'

/**
 * A referendum that is over and still holding money. Both deposits are refunded
 * by a call anybody may make, and both go back to whoever put them down.
 */
export interface Settled {
  index: number
  outcome: Outcome
  submission: Held | null
  decision: Held | null
}

/**
 * Being rejected costs the submission deposit and being timed out costs it too.
 * Only a referendum that passed or was called off hands it back.
 */
export function refundsSubmission(settled: Settled): boolean {
  return settled.outcome === 'approved' || settled.outcome === 'cancelled'
}

/** Whether anything is left to claim, which is what puts one on the page at all. */
export function hasRefund(settled: Settled): boolean {
  return settled.decision !== null || (settled.submission !== null && refundsSubmission(settled))
}

export const OUTCOME_LABELS: Record<Outcome, string> = {
  approved: 'approved',
  rejected: 'rejected',
  timedOut: 'timed out',
  cancelled: 'cancelled',
}

/**
 * Bytes somebody paid to put on chain. A referendum's title and description go
 * up as one of these, and clearing the metadata when the referendum ends leaves
 * the preimage and its deposit behind for the account that noted it.
 */
export interface NotedPreimage {
  hash: string
  who: string
  len: number
  amount: bigint
}

/** What an account has locked behind its votes on one track. */
export interface ClassLock {
  track: number
  amount: bigint
  /** The polls still counting a vote here. Each has to be taken back before anything unlocks. */
  polls: number[]
  /** The block the conviction lock runs out, zero when nothing is waiting. */
  freeAt: number
}

export const STATE_LABELS: Record<ReferendumState, string> = {
  preparing: 'preparing',
  queued: 'queued',
  deciding: 'deciding',
  confirming: 'confirming',
}

export interface Thresholds {
  approval: number
  support: number
}

function fallenTo(curve: Curve, ran: number): number {
  const over = Math.min(Math.max(ran, 0), 1)
  if (curve.kind === 'reciprocal') {
    const level = curve.factor / (over + curve.xOffset) + curve.yOffset
    return Math.min(Math.max(level, 0), 1) * 100
  }
  const along = Math.min(over, curve.length)
  return (curve.ceil - ((curve.ceil - curve.floor) * along) / curve.length) * 100
}

/**
 * What both curves ask for right now, as percentages to read against the tally.
 * Both start at their hardest and ease off as the decision period runs, so one
 * that is not being decided yet sits at the start of the fall.
 */
export function thresholds(
  referendum: Referendum,
  tracks: Track[] | undefined,
  height: number,
): Thresholds | null {
  const track = tracks?.find((entry) => entry.id === referendum.track)
  if (!track) return null

  const since = referendum.deciding?.since
  const ran = since === undefined ? 0 : (height - since) / track.decisionPeriod
  return {
    approval: fallenTo(track.approvalCurve, ran),
    support: fallenTo(track.supportCurve, ran),
  }
}

/** What the badge has no room to say. */
export const STATE_SAYS: Record<ReferendumState, string> = {
  preparing:
    'Nothing counts yet. The preparation period has to run out and the decision deposit has to be down.',
  queued: 'Every deciding slot on this track is taken, so it waits for one to come free.',
  deciding: 'Votes are counting. It has to be ahead by enough before the period runs out.',
  confirming: 'It is ahead by enough. Losing that lead before the countdown ends drops it back.',
}

export interface Countdown {
  label: string
  blocks: number
}

/**
 * The one clock that matters where a referendum has got to. Nothing times a
 * referendum out once it is being decided, and nothing else times one out
 * before that.
 */
export function countdown(
  referendum: Referendum,
  tracks: Track[] | undefined,
  height: number,
  undecidingTimeout: number,
): Countdown | null {
  const { deciding } = referendum
  if (!deciding) {
    return { label: 'Called off in', blocks: referendum.submitted + undecidingTimeout - height }
  }
  if (deciding.confirming !== null) {
    return { label: 'Passes in', blocks: deciding.confirming - height }
  }

  const track = tracks?.find((entry) => entry.id === referendum.track)
  if (!track) return null
  return { label: 'Decision ends in', blocks: deciding.since + track.decisionPeriod - height }
}

/** How near a referendum is to being settled, confirming being one tick away. */
const URGENCY: Record<ReferendumState, number> = {
  confirming: 0,
  deciding: 1,
  queued: 2,
  preparing: 3,
}

const newest = (one: Referendum, other: Referendum) => other.index - one.index

/** The order the running list may be read in. Nothing else decides it. */
export const SORTS = {
  state: (one: Referendum, other: Referendum) =>
    URGENCY[one.state] - URGENCY[other.state] || newest(one, other),
  newest,
}

export type Sort = keyof typeof SORTS

export const SORT_LABELS: Record<Sort, string> = {
  state: 'By state',
  newest: 'Newest first',
}

/** The chain pads a track name to a fixed width and writes it in snake case. */
export function readableTrack(name: string): string {
  const trimmed = name.replace(/\0+$/, '').replace(/_/g, ' ')
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

export function trackLabel(tracks: Track[] | undefined, id: number): string {
  return tracks?.find((track) => track.id === id)?.name ?? `Track ${id}`
}

/** The cheapest track that can release this much, since a bigger one only costs more. */
export function trackFor(amount: bigint, spenders: Spender[]): number | null {
  const fits = [...spenders]
    .sort((one, other) => (one.cap < other.cap ? -1 : 1))
    .find((spender) => amount <= spender.cap)

  return fits ? fits.track : null
}

/**
 * pallet_conviction_voting packs a vote into one byte, the top bit for aye and
 * the rest for the conviction.
 */
export function voteByte(ballot: Ballot): number {
  if (ballot.kind === 'abstain') return 0
  const conviction = CONVICTIONS.findIndex((entry) => entry.value === ballot.conviction)
  return ballot.kind === 'aye' ? 0x80 + conviction : conviction
}

/** What share of the votes cast are ayes, which is the approval curve's input. */
export function approval(tally: Tally): number {
  const cast = tally.ayes + tally.nays
  return cast === 0n ? 0 : Number((tally.ayes * 10_000n) / cast) / 100
}

/** What share of everything that could vote did, which is the support curve's. */
export function support(tally: Tally, activeIssuance: bigint): number {
  if (activeIssuance === 0n) return 0
  return Number((tally.support * 10_000n) / activeIssuance) / 100
}
