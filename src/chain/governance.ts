import { compactSize } from './identity'
import { CONVICTIONS, type Conviction, type Spender } from './types'

/** OpenGov as Numen runs it. */

/**
 * A threshold curve in one of the two shapes the runtime builds. Approval falls
 * straight from ceil to floor. Support runs down a reciprocal that eases off
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
  /** The origin a referendum on this track runs under. */
  origin: string
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

/**
 * One instalment of a proposal. pallet_treasury books each spend separately, so
 * every one names its own beneficiary and waits on its own block. A null release
 * pays the moment the referendum enacts.
 */
export interface Payout {
  amount: bigint
  beneficiary: string
  validFrom: number | null
}

/** What a referendum runs once it passes. */
export type Motion =
  | { kind: 'spend'; payouts: Payout[] }
  /** Runs nothing, and carries the title and description where nobody can edit them. */
  | { kind: 'remark'; text: string }
  | { kind: 'cancel'; poll: number }
  | { kind: 'kill'; poll: number }
  | { kind: 'addRegistrar'; account: string }
  | { kind: 'removeRegistrar'; registrar: number }
  | { kind: 'addUsernameAuthority'; authority: string; suffix: string; allocation: number }
  | { kind: 'removeUsernameAuthority'; authority: string; suffix: string }

/** One booking a proposal makes, as the chain has it written down. */
export interface ProposalSpend {
  amount: bigint
  beneficiary: string
  /** Block the payout window opens on, null when the call names none. */
  validFrom: number | null
}

export type Proposal =
  | { kind: 'spend'; spends: ProposalSpend[] }
  /** Anything the wallet cannot read as treasury spending. */
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
  /** Who opened it, which is who may rewrite what it says. */
  submitter: string
  /** Preimage the metadata points at, null when nobody set any. */
  metadataHash: string | null
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
 * pallet_referenda keeps a referendum's metadata as a preimage of a text dump
 * shaped like a commit message. The first line is the title and everything
 * past the first blank line is the description. The pallet says nothing about
 * what goes in it, so this shape is the whole of the contract between whatever
 * opens a referendum and whatever reads one back. Anybody may write their own
 * dump, so nothing in there is trusted past these two strings.
 */
export const TITLE_MAX = 120

/** As much of a dump as the wallet will believe, which is two strings. */
export interface Metadata {
  title: string | null
  description: string | null
}

export const NO_METADATA: Metadata = { title: null, description: null }

export function readMeta(dump: string): Metadata {
  const cut = dump.indexOf('\n')
  const headline = (cut === -1 ? dump : dump.slice(0, cut)).trim().slice(0, TITLE_MAX)
  // Whatever length the proposer paid to store, since cutting it here would
  // hide half of what somebody is being asked to vote on
  const body = cut === -1 ? '' : dump.slice(cut + 1).trim()

  return { title: headline || null, description: body || null }
}

export function metadataDump(title: string, description: string): string {
  // A break inside the title would smuggle half of it into the body
  const headline = title.replace(/[\r\n]+/g, ' ').trim().slice(0, TITLE_MAX)
  const body = description.trim()
  return body ? `${headline}\n\n${body}` : headline
}

/** UTF-8 length of a dump, which is what the chain prices and caps. */
export function dumpBytes(dump: string): number {
  return new TextEncoder().encode(dump).length
}

/** Encoded size of a System.remark call carrying that many bytes of text. */
export function remarkBytes(length: number): number {
  return 2 + compactSize(length) + length
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

/**
 * Whether a payout would already be past claiming by the time the referendum
 * enacts. pallet_treasury refuses that spend outright, and `batch_all` takes
 * every other payout in the same proposal down with it.
 */
export function shutsTooSoon(
  validFrom: number | null,
  height: number,
  runsFor: number,
  payoutPeriod: number,
): boolean {
  return validFrom != null && validFrom + payoutPeriod <= height + runsFor
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

/** The side a vote took, if it took one. Only a side holds a conviction. */
export type Side = 'aye' | 'nay' | 'abstain' | 'split'

/**
 * How the referendum a vote sits on came out. Cancelled, timed out and killed
 * all read as void, which holds nothing.
 */
export type PollOutcome =
  | { kind: 'running' }
  | { kind: 'void' }
  | { kind: 'ended'; approved: boolean; at: number }

/** One vote a track still counts, with how the referendum it sits on ended. */
export interface CastVote {
  poll: number
  side: Side
  conviction: Conviction
  amount: bigint
  outcome: PollOutcome
}

/** What an account has locked behind its votes on one track. */
export interface ClassLock {
  track: number
  amount: bigint
  /** Every vote still on this track. Each has to be taken back before anything unlocks. */
  votes: CastVote[]
  /** What votes already taken back still hold, merged into one span. */
  prior: { until: number; amount: bigint }
}

/** How many lock periods a conviction is worth. */
export function periodsOf(conviction: Conviction): number {
  return CONVICTIONS.find((entry) => entry.value === conviction)!.periods
}

/** The multiplier a conviction puts on a vote. */
export function weightOf(conviction: Conviction): string {
  return CONVICTIONS.find((entry) => entry.value === conviction)!.weight
}

export type Release =
  | { kind: 'running' }
  | { kind: 'free'; why: 'cancelled' | 'lost' | null }
  | { kind: 'held'; until: number }

/**
 * When one vote lets go of its balance. A conviction only bites on the side the
 * referendum agreed with, so a vote that lost is free the moment the count is in.
 */
export function releaseOf(vote: CastVote, lockingPeriod: number, height: number): Release {
  switch (vote.outcome.kind) {
    case 'running':
      return { kind: 'running' }
    case 'void':
      return { kind: 'free', why: 'cancelled' }
    case 'ended': {
      const periods = periodsOf(vote.conviction)
      const sided = vote.side === 'aye' || vote.side === 'nay'
      if (periods === 0 || !sided) return { kind: 'free', why: null }
      if ((vote.side === 'aye') !== vote.outcome.approved) return { kind: 'free', why: 'lost' }
      const until = vote.outcome.at + lockingPeriod * periods
      return until > height ? { kind: 'held', until } : { kind: 'free', why: null }
    }
  }
}

export type TrackRelease =
  | { kind: 'running'; count: number }
  | { kind: 'free' }
  | { kind: 'held'; until: number }

/**
 * When a whole track lets go. A vote on a referendum that has not finished has
 * no end to count from, so a track holding one of those can only say it waits.
 */
export function trackRelease(lock: ClassLock, lockingPeriod: number, height: number): TrackRelease {
  const releases = lock.votes.map((vote) => releaseOf(vote, lockingPeriod, height))
  const running = releases.filter((release) => release.kind === 'running').length
  if (running > 0) return { kind: 'running', count: running }

  const held = releases.flatMap((release) => (release.kind === 'held' ? [release.until] : []))
  if (lock.prior.until > height) held.push(lock.prior.until)
  return held.length === 0 ? { kind: 'free' } : { kind: 'held', until: Math.max(...held) }
}

/**
 * What this track would still lock once every finished vote is taken back.
 * Locks overlap rather than stack, so the largest of what stays is all of it.
 */
export function lockAfter(lock: ClassLock, lockingPeriod: number, height: number): bigint {
  const holding = lock.votes.flatMap((vote) => {
    const release = releaseOf(vote, lockingPeriod, height)
    return release.kind === 'free' ? [] : [vote.amount]
  })
  if (lock.prior.until > height) holding.push(lock.prior.amount)
  return holding.reduce((most, amount) => (amount > most ? amount : most), 0n)
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

/**
 * The origin a track runs under. The runtime publishes no table of them, so
 * this leans on every track being named after its origin in snake case.
 */
export function originOf(name: string): string {
  return name
    .replace(/\0+$/, '')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
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

/** The other way round, for a vote read back off the chain. */
export function readVoteByte(byte: number): { side: Side; conviction: Conviction } {
  const entry = CONVICTIONS[byte & 0x7f]
  if (!entry) throw new Error(`Vote byte ${byte} names no conviction`)
  return { side: (byte & 0x80) === 0 ? 'nay' : 'aye', conviction: entry.value }
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
