/**
 * pallet_bounties as Numen runs it. The treasury funds a bounty, a curator is
 * put on it by governance, and the curator awards it to whoever did the work.
 * Everything governance decides goes through a referendum, so the calls here
 * are only the ones an ordinary account makes.
 */

export type BountyState =
  | 'proposed'
  | 'approved'
  | 'funded'
  | 'curatorProposed'
  | 'active'
  | 'pendingPayout'

export interface Bounty {
  index: number
  description: string
  proposer: string
  /** What it pays out in total, the curator's fee included. */
  value: bigint
  fee: bigint
  /** Held from the proposer until it is funded or thrown out. */
  bond: bigint
  curatorDeposit: bigint
  state: BountyState
  curator: string | null
  /** Set once it is awarded, which is who claims it. */
  beneficiary: string | null
  /**
   * The block the curator owes an update by while it is active, or the block
   * the award can be claimed on once it is awarded.
   */
  until: number | null
}

export const BOUNTY_LABELS: Record<BountyState, string> = {
  proposed: 'proposed',
  approved: 'approved',
  funded: 'looking for a curator',
  curatorProposed: 'curator asked',
  active: 'active',
  pendingPayout: 'awarded',
}

/**
 * A curator splitting their bounty into pieces. Everything about one is the
 * parent curator's or the child curator's, so governance never sees it.
 */
export type ChildState = 'added' | 'curatorProposed' | 'active' | 'pendingPayout'

export interface ChildBounty {
  parent: number
  index: number
  description: string
  value: bigint
  fee: bigint
  curatorDeposit: bigint
  state: ChildState
  curator: string | null
  beneficiary: string | null
  /** The block the award can be claimed on, once it has been awarded. */
  until: number | null
}

export const CHILD_LABELS: Record<ChildState, string> = {
  added: 'looking for a curator',
  curatorProposed: 'curator asked',
  active: 'active',
  pendingPayout: 'awarded',
}

/** Only the curator does these, and only while the bounty is theirs to run. */
export const runsIt = (bounty: Bounty, address: string): boolean =>
  bounty.state === 'active' && bounty.curator === address

/** The curator says yes to a bounty governance has put them on. */
export const awaitsCurator = (bounty: Bounty, address: string): boolean =>
  bounty.state === 'curatorProposed' && bounty.curator === address

/**
 * An awarded bounty pays out once the delay is up, and anybody may ask for it
 * since the money only goes to the beneficiary either way.
 */
export const claimable = (bounty: Bounty, height: number): boolean =>
  bounty.state === 'pendingPayout' && height >= (bounty.until ?? 0)

/** The same three questions about a child, which its own curator answers. */
export const runsChild = (child: ChildBounty, address: string): boolean =>
  child.state === 'active' && child.curator === address

export const awaitsChildCurator = (child: ChildBounty, address: string): boolean =>
  child.state === 'curatorProposed' && child.curator === address

export const childClaimable = (child: ChildBounty, height: number): boolean =>
  child.state === 'pendingPayout' && height >= (child.until ?? 0)
