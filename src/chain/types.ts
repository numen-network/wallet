import type { WalletAccount } from '@/signing/types'
import type {
  Ballot,
  ClassLock,
  NotedPreimage,
  Referendum,
  Settled,
  Spend,
  Track,
} from './governance'
import type { Bounty, ChildBounty } from './bounties'
import type { IdentityInfo, Registrar, Ruling, Standing, Subs } from './identity'
import type { VestingSchedule } from './vesting'

/**
 * Domain types the UI speaks. No PAPI type crosses this boundary, that is what
 * makes swapping the chain client a one file change.
 */

export interface AccountBalance {
  free: bigint
  reserved: bigint
  frozen: bigint
  /** What may leave the account, worked out the way `transferableOf` says. */
  transferable: bigint
  /**
   * What the lock list holds, which comes out of Balances.Locks rather than the
   * frozen field. The two answer different questions, so this and transferable
   * do not add up to the balance and are not meant to.
   */
  locked: bigint
}

/** Everything the account holds, sendable or not. */
export function totalOf(balance: AccountBalance): bigint {
  return balance.free + balance.reserved
}

/** A lock this size holds everything, and reporting it as a figure says nothing. */
const WHOLE_BALANCE = (1n << 128n) - 1n

/**
 * What the locks hold between them. Locks overlap rather than stack, so the
 * biggest of them is the whole of it, which is what pallet_balances freezes and
 * what the explorer and polkadot.js both show.
 */
export function lockedOf(locks: readonly bigint[]): bigint {
  return locks.reduce((most, lock) => (lock !== WHOLE_BALANCE && lock > most ? lock : most), 0n)
}

/**
 * What may leave the account, as polkadot.js works it out. A freeze applies to
 * the whole account, so the reserve answers for it first. Anything holding a
 * reserve or a freeze also holds a reference keeping the account alive, and an
 * account that has to stay alive has to keep the deposit back.
 */
export function transferableOf(
  free: bigint,
  reserved: bigint,
  frozen: bigint,
  existentialDeposit: bigint,
): bigint {
  const alive = frozen === 0n && reserved === 0n ? 0n : existentialDeposit
  const bites = frozen - reserved
  const untouchable = bites > alive ? bites : alive
  return free > untouchable ? free - untouchable : 0n
}

export const ZERO_BALANCE: AccountBalance = {
  free: 0n,
  reserved: 0n,
  frozen: 0n,
  transferable: 0n,
  locked: 0n,
}

export interface ChainHead {
  number: number
  hash: string
}

/**
 * How long the delegated balance stays locked once the delegation ends, counted
 * in vote locking periods. None is the odd one out, a tenth of a vote for no lock
 * at all, which is why it is not simply zero.
 */
export type Conviction =
  | 'None'
  | 'Locked1x'
  | 'Locked2x'
  | 'Locked3x'
  | 'Locked4x'
  | 'Locked5x'
  | 'Locked6x'

export const CONVICTIONS: { value: Conviction; weight: string; periods: number }[] = [
  { value: 'None', weight: '0.1x', periods: 0 },
  { value: 'Locked1x', weight: '1x', periods: 1 },
  { value: 'Locked2x', weight: '2x', periods: 2 },
  { value: 'Locked3x', weight: '3x', periods: 4 },
  { value: 'Locked4x', weight: '4x', periods: 8 },
  { value: 'Locked5x', weight: '5x', periods: 16 },
  { value: 'Locked6x', weight: '6x', periods: 32 },
]

/**
 * What a proxy may do on the account's behalf, as the runtime's ProxyType has
 * it. Governance is the one that pairs with delegation, a hot account that can
 * vote and cannot spend.
 */
export type ProxyType = 'Any' | 'NonTransfer' | 'Governance'

export const PROXY_TYPES: { value: ProxyType; label: string }[] = [
  { value: 'Any', label: 'Any, the whole account' },
  { value: 'NonTransfer', label: 'Everything but moving funds' },
  { value: 'Governance', label: 'Governance only' },
]

/** A block and the extrinsic in it, which is how a multisig names its first approval. */
export interface Timepoint {
  height: number
  index: number
}

/** A call waiting on more signatures, as pallet_multisig records it. */
export interface Pending {
  multisig: string
  callHash: string
  when: Timepoint
  /** Held from whoever started it, and returned to them when it lands or is called off. */
  deposit: bigint
  depositor: string
  approvals: string[]
}

/** An account standing in for another, as the chain has it. */
export interface Proxy {
  delegate: string
  type: ProxyType
}

/** One track's worth of voting power handed to somebody else. */
export interface Delegation {
  track: number
  to: string
  conviction: Conviction
  amount: bigint
}

/**
 * Everything the wallet asks an account to sign. One shape for all of them, so a
 * fee is quoted for the call that gets submitted rather than for a stand in.
 */
export type Operation =
  | { kind: 'transfer'; to: string; amount: bigint }
  /** Sends the lot and lets the account be reaped, so there is no amount. */
  | { kind: 'transferAll'; to: string }
  | { kind: 'delegate'; delegation: Delegation }
  | { kind: 'undelegate'; track: number }
  | { kind: 'addProxy'; proxy: Proxy }
  | { kind: 'removeProxy'; proxy: Proxy }
  /**
   * The identity, and whatever rides the same signature beside it. Asking a
   * registrar goes through the pallet's fee rail, paying for automated checks
   * is a plain transfer the judge matches against this very extrinsic. The
   * automatic path rides both rails at once. Every call lands together or
   * none does.
   */
  | {
      kind: 'registerIdentity'
      info: IdentityInfo
      registrar: { index: number; maxFee: bigint } | null
      pay?: { to: string; amount: bigint } | null
    }
  | { kind: 'clearIdentity' }
  /**
   * The whole list at once, which is how pallet_identity takes it. Adding and
   * renaming and removing are all the same call with a different list, so the
   * wallet has one path rather than four.
   */
  | { kind: 'setSubs'; subs: { address: string; name: string }[] }
  /** The sub letting go of the parent, which only the sub itself may do. */
  | { kind: 'quitSub' }
  /** Works the freeze out again, which is the only thing that frees what has thawed. */
  | { kind: 'vest' }
  /**
   * A grant. The money leaves at once and lands frozen on the far end, and the
   * pallet has no call that takes one back.
   */
  | { kind: 'vestedTransfer'; to: string; schedule: VestingSchedule }
  /** Anybody may put one up, and pays a bond until governance funds or refuses it. */
  | { kind: 'proposeBounty'; value: bigint; description: string }
  /** The rest are the curator's, bar the claim, which the beneficiary is owed anyway. */
  | { kind: 'acceptCurator'; bounty: number }
  | { kind: 'awardBounty'; bounty: number; beneficiary: string }
  | { kind: 'claimBounty'; bounty: number }
  | { kind: 'unassignCurator'; bounty: number }
  | { kind: 'extendBounty'; bounty: number }
  /**
   * A curator splitting their own bounty. The parent's curator adds a piece and
   * names who runs it, and that curator awards it, so governance sees none of it.
   */
  | { kind: 'addChild'; bounty: number; value: bigint; description: string }
  | { kind: 'proposeChildCurator'; bounty: number; child: number; curator: string; fee: bigint }
  | { kind: 'acceptChildCurator'; bounty: number; child: number }
  | { kind: 'awardChild'; bounty: number; child: number; beneficiary: string }
  | { kind: 'claimChild'; bounty: number; child: number }
  | { kind: 'unassignChildCurator'; bounty: number; child: number }
  | { kind: 'closeChild'; bounty: number; child: number }
  /** The registrar is paid up to maxFee, whatever they currently charge. */
  | { kind: 'requestJudgement'; registrar: number; maxFee: bigint }
  /**
   * A registrar's verdict. The identity rides along rather than the hash the
   * chain wants, so what is committed to is the info the registrar was shown
   * and not whatever the chain holds by the time the call is built.
   */
  | {
      kind: 'provideJudgement'
      registrar: number
      target: string
      judgement: Ruling
      info: IdentityInfo
    }
  | { kind: 'cancelJudgement'; registrar: number }
  /** The registrar putting a price on its work, signed by its own account. */
  | { kind: 'setFee'; registrar: number; fee: bigint }
  | { kind: 'vote'; poll: number; ballot: Ballot }
  | { kind: 'removeVote'; track: number; poll: number }
  /** Releases whatever the conviction locks have finished holding. */
  | { kind: 'unlock'; track: number; target: string }
  | { kind: 'decisionDeposit'; poll: number }
  /** Claims an approved treasury spend. Anybody may, the money goes nowhere else. */
  | { kind: 'payout'; spend: number }
  /** Both refunds go to whoever put the deposit down, whoever asks for them. */
  | { kind: 'refundSubmission'; poll: number }
  | { kind: 'refundDecision'; poll: number }
  /** Clears the bytes and hands back what they cost, which only the noter may do. */
  | { kind: 'unnotePreimage'; hash: string }
  /**
   * One signature towards a multisig call. The call rides along every time
   * rather than only on the last approval, so no signatory has to be handed the
   * bytes out of band to finish what another one started.
   */
  | {
      kind: 'multisigApprove'
      threshold: number
      /** Everybody but the signer, which is what the chain reads the address off. */
      others: string[]
      /** Whose call it is, which is where the timepoint of one already going is read. */
      multisig: string
      call: Operation
    }
  /**
   * The same signature, towards a call this wallet was handed as bytes rather
   * than built. A multisig signs whatever the bytes say, which is not limited
   * to the calls this wallet knows how to make, and the one that matters most
   * is a runtime upgrade no wallet builds.
   */
  | {
      kind: 'multisigApproveData'
      threshold: number
      others: string[]
      multisig: string
      /** The call itself, as the signatory who wrote it handed it over. */
      hex: string
      /** What it was read as, for the log. Nothing is signed off this. */
      label: string
    }
  /** Only whoever started it may call it off, which is who gets the deposit back. */
  | { kind: 'multisigCancel'; threshold: number; others: string[]; multisig: string; callHash: string }
  /**
   * A call the signer makes as somebody else. The chain checks the proxy is
   * registered and of a type that allows the call, so nothing here has to.
   */
  | { kind: 'asProxy'; real: string; call: Operation }
  /** Every track is a spender track, so a proposal is a treasury spend. */
  | {
      kind: 'propose'
      track: number
      amount: bigint
      beneficiary: string
      title: string
      description: string
    }
  /**
   * One signature over several calls, all of them the signer's own. It is
   * `batch_all`, so the chain runs the lot or none of it, which is the only
   * answer that does not leave somebody paid half of what they were owed.
   *
   * Nothing in the wallet asks anybody to build one. Each button that makes one
   * knows what it is batching, which is what keeps this off the screen.
   */
  | { kind: 'batch'; calls: Operation[] }

/**
 * One call needs nothing wrapped around it. A batch of one weighs more than the
 * call it holds and reads worse in the log, so it is only worth it past one.
 */
export function batched(calls: Operation[]): Operation {
  const [first] = calls
  return first && calls.length === 1 ? first : { kind: 'batch', calls }
}

/**
 * How far a submitted call has got. Finality is the only state that settles it,
 * the ones before are what a person watches while they wait.
 */
export type TxStage = 'signed' | 'broadcast' | 'inBlock' | 'finalized'

export interface TxProgress {
  stage: TxStage
  /** Known from the moment it is signed, which is what the explorer wants. */
  hash: string
}

export type Unsubscribe = () => void

/** How well the node on the other end is answering right now. */
export interface Reach {
  /** Round trip of one request, in milliseconds. */
  ms: number
  peers: number
  /** A node still catching up answers with state the chain has moved past. */
  syncing: boolean
}

/**
 * A call somebody was handed as bytes. The chain keeps only the hash of a
 * waiting multisig call, so the bytes travel between signatories, and reading
 * them back is how a signatory sees what they are putting their name to.
 */
/** One argument of a call, under the name the runtime gives it. */
export interface CallArg {
  name: string
  value: string
}

export interface ReadCall {
  /** What the chain would key it by, which is what it is checked against. */
  hash: string
  /** The wallet's own reading, when the call is one it knows how to make. */
  operation: Operation | null
  /** What the runtime calls it, which is there whether or not the wallet knows it. */
  label: string
  /**
   * Argument by argument, for the calls the wallet has no words of its own for.
   * A runtime upgrade is the one that matters and no wallet builds it, so the
   * name of the call alone would leave a signatory reading nothing.
   */
  args: CallArg[]
}

/** One spender track, as the runtime publishes it. */
export interface Spender {
  track: number
  /** The origin variant a proposal on this track runs under. */
  origin: string
  /** Most a referendum on this track can release. */
  cap: bigint
}

/**
 * What the chain says about itself. Every field is a runtime constant the
 * metadata carries, so this is read once per connection rather than mirrored.
 */
export interface ChainFacts {
  /** Address format, which decides what every address in the UI reads as. */
  ss58Prefix: number
  /** Digits behind the point, which decides what every amount reads as. */
  decimals: number
  /** Ticker the chain names its coin. Follows every amount the UI shows. */
  symbol: string
  /** Chain id the EVM side answers with. MetaMask signs against it. */
  evmChainId: number
  /** EVM address of the native balance ERC20 facade. A withdrawal is a call to it. */
  balancesErc20: string
  existentialDeposit: bigint
  /** Target seconds per block, which turns block counts into something readable. */
  blockSeconds: number
  /** Blocks a conviction multiplies, held in blocks the way the runtime states it. */
  voteLockingPeriod: number
  /** Blocks a referendum may sit undecided before it is called off. */
  undecidingTimeout: number
  proxyDepositBase: bigint
  proxyDepositFactor: bigint
  maxProxies: number
  identityBasicDeposit: bigint
  identityByteDeposit: bigint
  subAccountDeposit: bigint
  minVestedTransfer: bigint
  spenders: Spender[]
}

export interface ChainRepository {
  reach(): Promise<Reach>
  /** Runtime constants, which change only when the runtime does. */
  facts(): Promise<ChainFacts>
  subscribeHead(onHead: (head: ChainHead) => void): Unsubscribe
  subscribeBalance(address: string, onBalance: (balance: AccountBalance) => void): Unsubscribe
  estimateFee(from: string, operation: Operation): Promise<bigint>
  /** Who may already act for this account, which is chain state, not a guess. */
  proxies(address: string): Promise<Proxy[]>
  /** Who the chain says this address is, its own record and the parent it hangs off. */
  standingOf(address: string): Promise<Standing>
  /** The accounts hanging off this one, and what it is holding for them. */
  subsOf(address: string): Promise<Subs>
  /** What this account has vesting, which nothing thaws without being asked. */
  vesting(address: string): Promise<VestingSchedule[]>
  /** Who may check an identity, and what they charge for it. */
  registrars(): Promise<Registrar[]>
  /** The track table, which the runtime carries as a constant. */
  tracks(): Promise<Track[]>
  referenda(): Promise<Referendum[]>
  /** What passed referenda have booked and nobody has claimed yet. */
  spends(): Promise<Spend[]>
  /** Finished referenda still holding a deposit somebody could free. */
  settled(): Promise<Settled[]>
  /** Preimages these accounts paid for, since only the one that noted it may clear it. */
  preimages(owners: string[]): Promise<NotedPreimage[]>
  /** Calls these multisigs have started and not finished. */
  pending(multisigs: string[]): Promise<Pending[]>
  /**
   * What the call is, argument by argument, and the bytes it encodes to. The
   * bytes are the copy a signatory has to be handed, the rest is what anybody
   * reads to see what was signed.
   */
  callData(
    operation: Operation,
  ): Promise<{ name: string; args: CallArg[]; hex: string; hash: string }>
  /** Reads bytes back into a call, refusing anything the runtime does not know. */
  readCall(hex: string): Promise<ReadCall>
  /** Every bounty the treasury is still carrying. */
  bounties(): Promise<Bounty[]>
  /** The pieces a curator has split their bounties into. */
  childBounties(): Promise<ChildBounty[]>
  /** What this account has locked behind its votes, one entry per track. */
  locks(address: string): Promise<ClassLock[]>
  /** Total issuance less what is deactivated, which is what support is measured against. */
  activeIssuance(): Promise<bigint>
  /**
   * Resolves with the transaction hash once the call is finalized. The progress
   * arrives long before that, so nothing has to be held open waiting for it.
   */
  submit(
    account: WalletAccount,
    operation: Operation,
    onProgress?: (progress: TxProgress) => void,
  ): Promise<string>
  disconnect(): void
}
