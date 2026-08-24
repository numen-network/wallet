import { hexToU8a } from '@polkadot/util'
import { blake2AsHex } from '@polkadot/util-crypto'
import { createClient, Enum, type PolkadotClient, type PolkadotSigner } from 'polkadot-api'
import { getWsProvider } from 'polkadot-api/ws'
import type { WalletAccount } from '@/signing/types'
import { DECIMALS, SS58_PREFIX, type Network } from './config'
import {
  hasRefund,
  metadataDump,
  NO_METADATA,
  readMeta,
  readableTrack,
  voteByte,
  type ClassLock,
  type Curve,
  type Metadata,
  type NotedPreimage,
  type Proposal,
  type Referendum,
  type Outcome,
  type ReferendumState,
  type Settled,
  type Spend,
  type Tally,
  type Track,
} from './governance'

import {
  EMPTY_IDENTITY,
  IDENTITY_FIELDS,
  type IdentityInfo,
  type Judgement,
  type Registrar,
  type Registration,
  type Standing,
  type Subs,
} from './identity'
import type { Bounty, BountyState, ChildBounty, ChildState } from './bounties'
import type { VestingSchedule } from './vesting'
import {
  lockedOf,
  transferableOf,
  type AccountBalance,
  type ChainFacts,
  type ChainHead,
  type ChainRepository,
  type Operation,
  type Pending,
  type Proxy,
  type Reach,
  type ReadCall,
  type Timepoint,
  type TxProgress,
  type Unsubscribe,
} from './types'

/**
 * Until `pnpm papi:gen` has run against a live node there are no generated
 * descriptors, so this goes through `getUnsafeApi`. The shape below is the one
 * place that assertion lives, everything downstream is typed again. Running
 * papi:gen replaces `UnsafeApi` with the generated descriptors and the call
 * sites keep their names.
 */
interface AccountInfo {
  data: { free: bigint; reserved: bigint; frozen: bigint }
}

/** One entry of Balances.Locks. What put it there is `id`, which nothing reads. */
interface BalanceLock {
  amount: bigint
}

interface Subscription {
  unsubscribe(): void
}

/** What system_health answers with, which is a legacy call and so untyped. */
interface Health {
  peers: number
  isSyncing: boolean
}

interface TxResult {
  ok: boolean
  txHash: string
  dispatchError?: { type: string; value?: { type?: string; value?: { type?: string } } }
}

/** The events PAPI emits along the way, narrowed to the ones worth reporting. */
type TxEvent =
  | { type: 'signed' | 'broadcasted'; txHash: string }
  | ({ type: 'txBestBlocksState'; txHash: string } & ({ found: false } | ({ found: true } & TxResult)))
  | ({ type: 'finalized'; txHash: string } & TxResult)

interface Tx {
  getEstimatedFees(from: string): Promise<bigint>
  getEncodedData(): Promise<Uint8Array>
  /** The call itself, which is what a batch carries rather than encoded bytes. */
  decodedCall: DecodedCall
  signSubmitAndWatch(signer: PolkadotSigner): {
    subscribe(observer: {
      next: (event: TxEvent) => void
      error: (problem: unknown) => void
      complete: () => void
    }): Subscription
  }
}

/** What a dispatch costs the block, which as_multi has to be told up front. */
interface Weight {
  ref_time: bigint
  proof_size: bigint
}

/** As pallet_proxy stores it, a bounded list of definitions beside its deposit. */
type ProxiesEntry = [{ delegate: string; proxy_type: { type: string }; delay: number }[], bigint]

/** pallet_identity's Data, one variant per byte length plus the hashed forms. */
type IdentityData = { type: string; value?: string | number }

interface RegistrationEntry {
  judgements: [number, { type: string }][]
  deposit: bigint
  info: Record<string, IdentityData>
}

/**
 * Governance and identity are read from the best block rather than the finalized
 * one. A vote or a registration that only appears once finality catches up reads
 * as a call that did nothing. Balances stay on finality, where a number that
 * turns out not to exist costs more than one that shows up late.
 */
const BEST = { at: 'best' } as const

/** A pallet_referenda Curve. The linear parts are Perbill, the rest FixedI64. */
type CurveInfo =
  | { type: 'LinearDecreasing'; value: { length: number; floor: number; ceil: number } }
  | { type: 'Reciprocal'; value: { factor: bigint; x_offset: bigint; y_offset: bigint } }
  | { type: 'SteppedDecreasing'; value: unknown }

interface TrackInfo {
  name: string
  max_deciding: number
  decision_deposit: bigint
  prepare_period: number
  decision_period: number
  confirm_period: number
  min_enactment_period: number
  min_approval: CurveInfo
  min_support: CurveInfo
}

/** As pallet_referenda stores a running referendum. */
interface ReferendumStatus {
  track: number
  proposal: { type: string; value: Uint8Array | { hash: Uint8Array } }
  submitted: number
  decision_deposit?: { amount: bigint }
  deciding?: { since: number; confirming?: number }
  tally: Tally
  in_queue: boolean
}

interface DepositEntry {
  who: string
  amount: bigint
}

/** As pallet_bounties books one, with everything that varies inside the status. */
interface BountyEntry {
  proposer: string
  value: bigint
  fee: bigint
  curator_deposit: bigint
  bond: bigint
  status: {
    type: string
    value?: { curator?: string; beneficiary?: string; update_due?: number; unlock_at?: number }
  }
}

/** A piece of a bounty, which carries no proposer or bond of its own. */
interface ChildBountyEntry {
  parent_bounty: number
  value: bigint
  fee: bigint
  curator_deposit: bigint
  status: {
    type: string
    value?: { curator?: string; beneficiary?: string; unlock_at?: number }
  }
}

/** As pallet_multisig holds a call that has not gathered enough signatures. */
interface MultisigEntry {
  when: { height: number; index: number }
  deposit: bigint
  depositor: string
  approvals: string[]
}

/**
 * Every way a referendum ends carries the block it ended on and the two
 * deposits, either of which is gone once it has been refunded. Killed is the
 * exception and carries only the block.
 */
type SettledInfo = [number, DepositEntry | undefined, DepositEntry | undefined]

type ReferendumInfo =
  | { type: 'Ongoing'; value: ReferendumStatus }
  | { type: 'Approved' | 'Rejected' | 'TimedOut' | 'Cancelled'; value: SettledInfo }
  | { type: string; value: unknown }

const CHILD_STATES: Record<string, ChildState | undefined> = {
  Added: 'added',
  CuratorProposed: 'curatorProposed',
  Active: 'active',
  PendingPayout: 'pendingPayout',
}

/** ApprovedWithCurator reads as approved, since nothing may be done to either. */
const BOUNTY_STATES: Record<string, BountyState | undefined> = {
  Proposed: 'proposed',
  Approved: 'approved',
  ApprovedWithCurator: 'approved',
  Funded: 'funded',
  CuratorProposed: 'curatorProposed',
  Active: 'active',
  PendingPayout: 'pendingPayout',
}

/** Killed is left out, since it keeps no deposit for anybody to ask back. */
const OUTCOMES: Record<string, Outcome | undefined> = {
  Approved: 'approved',
  Rejected: 'rejected',
  TimedOut: 'timedOut',
  Cancelled: 'cancelled',
}

/**
 * An approved spend, as pallet_treasury books it. The runtime's asset kind is
 * the unit type and its beneficiary an account, so only the amount and the two
 * block bounds carry anything.
 */
interface SpendEntry {
  amount: bigint
  beneficiary: string
  valid_from: number
  expire_at: number
  status: { type: 'Pending' | 'Attempted' | 'Failed' }
}

/**
 * pallet_preimage keys the bytes by hash and length together, and the length is
 * only ever written down here. An Unrequested one always knows it, a Requested
 * one knows it once the bytes have landed.
 */
type PreimageStatus =
  | { type: 'Unrequested'; value: { ticket: [string, bigint]; len: number } }
  | { type: 'Requested'; value: { maybe_len?: number } }

interface VotingEntry {
  type: 'Casting' | 'Delegating'
  value: { votes?: [number, unknown][]; prior: [number, bigint] }
}

interface DecodedCall {
  type: string
  value: {
    type: string
    value?: {
      amount?: bigint
      beneficiary?: string
      /** A MultiAddress, which for everything the wallet builds is a plain Id. */
      dest?: { type: string; value?: string }
      value?: bigint
      calls?: DecodedCall[]
      /** Everything else the call carries, which is read rather than understood. */
      [name: string]: unknown
    }
  }
}

interface UnsafeApi {
  query: {
    System: {
      Account: {
        watchValue(address: string): {
          subscribe(next: (update: { value: AccountInfo | undefined }) => void): Subscription
        }
      }
    }
    EVMChainId: {
      ChainId: { getValue(): Promise<bigint> }
    }
    Proxy: {
      Proxies: {
        getValue(address: string): Promise<ProxiesEntry | undefined>
      }
    }
    Identity: {
      IdentityOf: {
        getValue(address: string, at: typeof BEST): Promise<RegistrationEntry | undefined>
      }
      Registrars: {
        getValue(
          at: typeof BEST,
        ): Promise<({ account: string; fee: bigint; fields: bigint } | undefined)[] | undefined>
      }
      SuperOf: {
        getValue(address: string, at: typeof BEST): Promise<[string, IdentityData] | undefined>
      }
      SubsOf: {
        getValue(address: string, at: typeof BEST): Promise<[bigint, string[]] | undefined>
      }
    }
    Referenda: {
      ReferendumInfoFor: {
        getEntries(at: typeof BEST): Promise<{ keyArgs: [number]; value: ReferendumInfo }[]>
      }
      ReferendumCount: { getValue(at: typeof BEST): Promise<number> }
      MetadataOf: { getValue(index: number, at: typeof BEST): Promise<string | undefined> }
    }
    Treasury: {
      Spends: {
        getEntries(at: typeof BEST): Promise<{ keyArgs: [number]; value: SpendEntry }[]>
      }
    }
    Multisig: {
      Multisigs: {
        getValue(
          multisig: string,
          callHash: string,
          at: typeof BEST,
        ): Promise<MultisigEntry | undefined>
        getEntries(
          at: typeof BEST,
        ): Promise<{ keyArgs: [string, string]; value: MultisigEntry }[]>
      }
    }
    Preimage: {
      RequestStatusFor: {
        getValue(hash: string, at: typeof BEST): Promise<PreimageStatus | undefined>
        getEntries(at: typeof BEST): Promise<{ keyArgs: [string]; value: PreimageStatus }[]>
      }
      PreimageFor: {
        getValue(key: [string, number], at: typeof BEST): Promise<Uint8Array | undefined>
      }
    }
    ConvictionVoting: {
      VotingFor: {
        getValue(address: string, track: number, at: typeof BEST): Promise<VotingEntry>
      }
      ClassLocksFor: {
        getValue(address: string, at: typeof BEST): Promise<[number, bigint][]>
      }
    }
    Bounties: {
      Bounties: {
        getEntries(at: typeof BEST): Promise<{ keyArgs: [number]; value: BountyEntry }[]>
      }
      BountyDescriptions: {
        getValue(index: number, at: typeof BEST): Promise<Uint8Array | undefined>
      }
    }
    ChildBounties: {
      ChildBounties: {
        getEntries(
          at: typeof BEST,
        ): Promise<{ keyArgs: [number, number]; value: ChildBountyEntry }[]>
      }
      ChildBountyDescriptionsV1: {
        getValue(parent: number, child: number, at: typeof BEST): Promise<Uint8Array | undefined>
      }
    }
    Vesting: {
      Vesting: {
        getValue(
          address: string,
          at: typeof BEST,
        ): Promise<{ locked: bigint; per_block: bigint; starting_block: number }[] | undefined>
      }
    }
    Balances: {
      TotalIssuance: { getValue(at: typeof BEST): Promise<bigint> }
      InactiveIssuance: { getValue(at: typeof BEST): Promise<bigint> }
      Locks: {
        watchValue(address: string): {
          subscribe(next: (update: { value: BalanceLock[] | undefined }) => void): Subscription
        }
      }
    }
  }
  constants: {
    System: { SS58Prefix(): Promise<number> }
    Balances: { ExistentialDeposit(): Promise<bigint> }
    ConvictionVoting: { VoteLockingPeriod(): Promise<number> }
    Difficulty: { TargetBlockTime(): Promise<bigint> }
    Identity: {
      BasicDeposit(): Promise<bigint>
      ByteDeposit(): Promise<bigint>
      SubAccountDeposit(): Promise<bigint>
    }
    Origins: { SpendCaps(): Promise<[number, { type: string }, bigint][]> }
    Precompiles: { BalancesErc20(): Promise<string> }
    Proxy: {
      ProxyDepositBase(): Promise<bigint>
      ProxyDepositFactor(): Promise<bigint>
      MaxProxies(): Promise<number>
    }
    Referenda: {
      Tracks(): Promise<[number, TrackInfo][]>
      UndecidingTimeout(): Promise<number>
    }
    Vesting: { MinVestedTransfer(): Promise<bigint> }
  }
  txFromCallData(data: Uint8Array): Promise<Tx & { decodedCall: DecodedCall }>
  apis: {
    TransactionPaymentCallApi: {
      query_call_info(call: unknown, len: number): Promise<{ weight: Weight }>
    }
  }
  tx: {
    Balances: {
      transfer_keep_alive(args: { dest: { type: 'Id'; value: string }; value: bigint }): Tx
      transfer_all(args: { dest: { type: 'Id'; value: string }; keep_alive: boolean }): Tx
    }
    Proxy: {
      add_proxy(args: {
        delegate: { type: 'Id'; value: string }
        proxy_type: { type: string }
        delay: number
      }): Tx
      remove_proxy(args: {
        delegate: { type: 'Id'; value: string }
        proxy_type: { type: string }
        delay: number
      }): Tx
      proxy(args: {
        real: { type: 'Id'; value: string }
        force_proxy_type: undefined
        call: unknown
      }): Tx
    }
    ConvictionVoting: {
      delegate(args: {
        class: number
        to: { type: 'Id'; value: string }
        conviction: { type: string }
        balance: bigint
      }): Tx
      undelegate(args: { class: number }): Tx
      vote(args: { poll_index: number; vote: { type: string; value: unknown } }): Tx
      remove_vote(args: { class: number; index: number }): Tx
      unlock(args: { class: number; target: { type: 'Id'; value: string } }): Tx
    }
    Referenda: {
      submit(args: {
        proposal_origin: { type: string; value: unknown }
        proposal: { type: string; value: Uint8Array }
        enactment_moment: { type: string; value: number }
      }): Tx
      place_decision_deposit(args: { index: number }): Tx
      set_metadata(args: { index: number; maybe_hash: string | undefined }): Tx
      refund_submission_deposit(args: { index: number }): Tx
      refund_decision_deposit(args: { index: number }): Tx
    }
    Multisig: {
      as_multi(args: {
        threshold: number
        other_signatories: string[]
        maybe_timepoint: { height: number; index: number } | undefined
        call: unknown
        max_weight: Weight
      }): Tx
      cancel_as_multi(args: {
        threshold: number
        other_signatories: string[]
        timepoint: { height: number; index: number }
        call_hash: string
      }): Tx
    }
    Vesting: {
      vest(args: Record<string, never>): Tx
      vested_transfer(args: {
        target: { type: 'Id'; value: string }
        schedule: { locked: bigint; per_block: bigint; starting_block: number }
      }): Tx
    }
    ChildBounties: {
      add_child_bounty(args: {
        parent_bounty_id: number
        value: bigint
        description: Uint8Array
      }): Tx
      propose_curator(args: {
        parent_bounty_id: number
        child_bounty_id: number
        curator: { type: 'Id'; value: string }
        fee: bigint
      }): Tx
      accept_curator(args: { parent_bounty_id: number; child_bounty_id: number }): Tx
      award_child_bounty(args: {
        parent_bounty_id: number
        child_bounty_id: number
        beneficiary: { type: 'Id'; value: string }
      }): Tx
      claim_child_bounty(args: { parent_bounty_id: number; child_bounty_id: number }): Tx
      unassign_curator(args: { parent_bounty_id: number; child_bounty_id: number }): Tx
      close_child_bounty(args: { parent_bounty_id: number; child_bounty_id: number }): Tx
    }
    Bounties: {
      propose_bounty(args: { value: bigint; description: Uint8Array }): Tx
      accept_curator(args: { bounty_id: number }): Tx
      award_bounty(args: { bounty_id: number; beneficiary: { type: 'Id'; value: string } }): Tx
      claim_bounty(args: { bounty_id: number }): Tx
      unassign_curator(args: { bounty_id: number }): Tx
      extend_bounty_expiry(args: { bounty_id: number; remark: Uint8Array }): Tx
    }
    Preimage: {
      note_preimage(args: { bytes: Uint8Array }): Tx
      unnote_preimage(args: { hash: string }): Tx
    }
    Utility: {
      batch_all(args: { calls: unknown[] }): Tx
    }
    Treasury: {
      spend(args: {
        asset_kind: undefined
        amount: bigint
        beneficiary: string
        valid_from: undefined
      }): Tx
      payout(args: { index: number }): Tx
    }
    Identity: {
      set_identity(args: { info: Record<string, IdentityData> }): Tx
      clear_identity(args: Record<string, never>): Tx
      /** A plain account, unlike add_sub and remove_sub, which take a lookup. */
      set_subs(args: { subs: [string, IdentityData][] }): Tx
      quit_sub(args: Record<string, never>): Tx
      request_judgement(args: { reg_index: number; max_fee: bigint }): Tx
      provide_judgement(args: {
        reg_index: number
        target: { type: 'Id'; value: string }
        judgement: { type: Judgement }
        /** blake2 of the encoded info, which is what binds a verdict to one identity. */
        identity: string
      }): Tx
      cancel_request(args: { reg_index: number }): Tx
      set_fee(args: { index: number; fee: bigint }): Tx
    }
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const toHex = (bytes: Uint8Array): string =>
  `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`

/** How far into a call's own structure is worth writing out before it is noise. */
const DEEP = 4

/** Bytes, whether the codec handed them over raw or wrapped. */
const asBytes = (value: unknown): Uint8Array | null => {
  if (value instanceof Uint8Array) return value
  const wrapped = value as { asBytes?: () => Uint8Array }
  return typeof wrapped?.asBytes === 'function' ? wrapped.asBytes() : null
}

/**
 * Data carries its byte length in the variant name, and PAPI wants a fixed size
 * field as a hex string, except the one byte case where its codec takes the
 * bare number and rejects hex.
 */
function toData(text: string): IdentityData {
  if (text === '') return Enum('None')
  const bytes = encoder.encode(text)
  if (bytes.length === 1) return Enum('Raw1', bytes[0]!) as IdentityData
  return Enum(`Raw${bytes.length}`, toHex(bytes)) as IdentityData
}

/** Anything the chain holds as a hash rather than as text reads back as empty. */
function fromData(data: IdentityData | undefined): string {
  if (!data?.type.startsWith('Raw') || !data.value) return ''
  if (typeof data.value === 'number') return decoder.decode(Uint8Array.of(data.value))
  const bytes = data.value.slice(2).match(/../g) ?? []
  return decoder.decode(Uint8Array.from(bytes, (byte) => parseInt(byte, 16)))
}

const toIdentityInfo = (info: Record<string, IdentityData>): IdentityInfo =>
  Object.fromEntries(
    IDENTITY_FIELDS.map((field) => [field, fromData(info[field])]),
  ) as IdentityInfo

const fromIdentityInfo = (info: IdentityInfo): Record<string, IdentityData> =>
  Object.fromEntries(IDENTITY_FIELDS.map((field) => [field, toData(info[field])]))

/** Perbill and FixedI64 both scale by a billion, which is all the curves need. */
const BILLIONTHS = 1_000_000_000

/**
 * Numen builds thresholds with `Curve::make_linear` and `Curve::make_reciprocal`,
 * so a stepped one is the runtime having changed under the wallet rather than
 * something to draw around.
 */
function toCurve(curve: CurveInfo): Curve {
  switch (curve.type) {
    case 'LinearDecreasing':
      return {
        kind: 'linear',
        length: curve.value.length / BILLIONTHS,
        floor: curve.value.floor / BILLIONTHS,
        ceil: curve.value.ceil / BILLIONTHS,
      }
    case 'Reciprocal':
      return {
        kind: 'reciprocal',
        factor: Number(curve.value.factor) / BILLIONTHS,
        xOffset: Number(curve.value.x_offset) / BILLIONTHS,
        yOffset: Number(curve.value.y_offset) / BILLIONTHS,
      }
    default:
      throw new Error(`Referenda: ${curve.type} curve`)
  }
}

const toTrack = ([id, info]: [number, TrackInfo]): Track => ({
  id,
  name: readableTrack(info.name),
  decisionDeposit: info.decision_deposit,
  preparePeriod: info.prepare_period,
  decisionPeriod: info.decision_period,
  confirmPeriod: info.confirm_period,
  minEnactmentPeriod: info.min_enactment_period,
  maxDeciding: info.max_deciding,
  approvalCurve: toCurve(info.min_approval),
  supportCurve: toCurve(info.min_support),
})

/** Where a referendum has got to, which the chain splits over two fields. */
/**
 * The four an Ongoing referendum passes through. Nothing has been decided until
 * `deciding` is set, and `in_queue` says whether it is waiting on its prepare
 * period or on a track with every deciding slot taken.
 */
export function toState(status: ReferendumStatus): ReferendumState {
  if (!status.deciding) return status.in_queue ? 'queued' : 'preparing'
  return status.deciding.confirming === undefined ? 'deciding' : 'confirming'
}

function toBalance(
  info: AccountInfo | undefined,
  locks: BalanceLock[],
  existentialDeposit: bigint,
): AccountBalance {
  const free = info?.data.free ?? 0n
  const reserved = info?.data.reserved ?? 0n
  const frozen = info?.data.frozen ?? 0n
  return {
    free,
    reserved,
    frozen,
    transferable: transferableOf(free, reserved, frozen, existentialDeposit),
    locked: lockedOf(locks.map((lock) => lock.amount)),
  }
}

/**
 * Turns a failed dispatch into something a user can read. A module error holds
 * the pallet that refused the call and, inside that, what it refused it for, so
 * anything that stops at the first level names the pallet and never the reason.
 */
function dispatchMessage(result: TxResult): string {
  const error = result.dispatchError
  if (!error) return 'Transaction failed'
  const inner = error.value
  if (!inner?.type) return error.type
  return inner.value?.type ? `${inner.type}: ${inner.value.type}` : `${error.type}: ${inner.type}`
}

export function createPapiRepository(network: Network): ChainRepository {
  const client: PolkadotClient = createClient(getWsProvider(network.rpc))
  const api = client.getUnsafeApi() as unknown as UnsafeApi

  /**
   * What one argument of a call says. The runtime's own metadata has already
   * turned the bytes into values, so this only has to write them down: an
   * address is a string, an amount a bigint, a variant a name over its
   * contents. A blob is the exception, since printing a runtime is no use to
   * anybody and its hash is what an upgrade is checked against.
   */
  const spell = (value: unknown, depth = 0): string => {
    if (value === undefined || value === null) return 'none'
    if (typeof value === 'bigint') return value.toString()
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)

    const bytes = asBytes(value)
    if (bytes) {
      if (bytes.length <= 32) return toHex(bytes)
      return `${bytes.length.toLocaleString('en-US')} bytes, blake2 ${blake2AsHex(bytes, 256)}`
    }

    if (Array.isArray(value)) {
      if (depth >= DEEP) return `${value.length} of them`
      return value.map((entry) => spell(entry, depth + 1)).join(', ')
    }

    if (typeof value === 'object') {
      const variant = value as { type?: unknown; value?: unknown }
      if (typeof variant.type === 'string') {
        const inner = 'value' in variant ? spell(variant.value, depth + 1) : 'none'
        return inner === 'none' ? variant.type : `${variant.type} ${inner}`
      }
      if (depth >= DEEP) return '…'
      return Object.entries(value)
        .map(([name, held]) => `${name} ${spell(held, depth + 1)}`)
        .join(', ')
    }

    return String(value)
  }

  /**
   * The wallet's own reading of a call it did not build. Only the shapes it
   * knows how to make come back as an operation, since those are the ones it
   * can put into words. Everything else is shown by the name the runtime gives
   * it, which is honest about how much has been understood.
   */
  const asOperation = (decoded: DecodedCall): Operation | null => {
    const { type: pallet, value: call } = decoded
    const args = call.value ?? {}

    if (pallet === 'Balances' && call.type === 'transfer_keep_alive' && args.dest) {
      return { kind: 'transfer', to: args.dest.value ?? '', amount: args.value ?? 0n }
    }
    if (pallet === 'Balances' && call.type === 'transfer_all' && args.dest) {
      return { kind: 'transferAll', to: args.dest.value ?? '' }
    }
    if (pallet === 'Utility' && call.type === 'batch_all' && args.calls) {
      const inner = args.calls.map(asOperation)
      return inner.every((entry) => entry !== null) ? { kind: 'batch', calls: inner } : null
    }

    return null
  }

  /**
   * An inline proposal carries the call itself, so the runtime's own metadata
   * reads it back. Anything held as a preimage is named by its hash instead,
   * since fetching and decoding it is the explorer's job.
   */
  const readProposal = async (proposal: ReferendumStatus['proposal']): Promise<Proposal> => {
    if (proposal.type !== 'Inline') {
      const held = proposal.value as { hash: Uint8Array }
      return { kind: 'other', label: held.hash ? `preimage ${toHex(held.hash).slice(0, 14)}…` : 'a preimage' }
    }

    try {
      const { decodedCall } = await api.txFromCallData(proposal.value as Uint8Array)
      const spend = decodedCall.value
      if (decodedCall.type !== 'Treasury' || spend.type !== 'spend' || !spend.value) {
        return { kind: 'other', label: `${decodedCall.type}.${spend.type}` }
      }
      return {
        kind: 'spend',
        amount: spend.value.amount ?? 0n,
        beneficiary: spend.value.beneficiary ?? '',
      }
    } catch {
      return { kind: 'other', label: 'a call this build cannot read' }
    }
  }

  /**
   * The metadata names a preimage rather than holding the text, so what a
   * referendum says about itself costs two more reads. Any step coming up empty
   * means no metadata, which is the same answer as a referendum nobody wrote
   * any for.
   */
  const readMetaOf = async (index: number): Promise<Metadata> => {
    const hash = await api.query.Referenda.MetadataOf.getValue(index, BEST)
    if (!hash) return NO_METADATA

    const status = await api.query.Preimage.RequestStatusFor.getValue(hash, BEST)
    const len = status?.type === 'Unrequested' ? status.value.len : status?.value.maybe_len
    if (len === undefined) return NO_METADATA

    const bytes = await api.query.Preimage.PreimageFor.getValue([hash, len], BEST)
    return bytes ? readMeta(new TextDecoder().decode(bytes)) : NO_METADATA
  }

  const readRegistration = async (address: string): Promise<Registration | null> => {
    const entry = await api.query.Identity.IdentityOf.getValue(address, BEST)
    if (!entry) return null

    return {
      info: toIdentityInfo(entry.info),
      judgements: entry.judgements.map(([registrar, judgement]) => ({
        registrar,
        judgement: judgement.type as Judgement,
      })),
      deposit: entry.deposit,
    }
  }

  // The table never changes without a runtime upgrade, and a proposal needs it
  let tracks: Promise<Track[]> | null = null
  const trackTable = () => (tracks ??= api.constants.Referenda.Tracks().then((table) => table.map(toTrack)))

  // Same story for the rest of the constants, so one read serves the session
  let constants: Promise<ChainFacts> | null = null
  const chainFacts = () => (constants ??= readFacts())

  const readFacts = async (): Promise<ChainFacts> => {
    const [
      ss58Prefix,
      existentialDeposit,
      blockSeconds,
      voteLockingPeriod,
      undecidingTimeout,
      proxyDepositBase,
      proxyDepositFactor,
      maxProxies,
      identityBasicDeposit,
      identityByteDeposit,
      subAccountDeposit,
      minVestedTransfer,
      caps,
      balancesErc20,
      evmChainId,
    ] = await Promise.all([
      api.constants.System.SS58Prefix(),
      api.constants.Balances.ExistentialDeposit(),
      api.constants.Difficulty.TargetBlockTime(),
      api.constants.ConvictionVoting.VoteLockingPeriod(),
      api.constants.Referenda.UndecidingTimeout(),
      api.constants.Proxy.ProxyDepositBase(),
      api.constants.Proxy.ProxyDepositFactor(),
      api.constants.Proxy.MaxProxies(),
      api.constants.Identity.BasicDeposit(),
      api.constants.Identity.ByteDeposit(),
      api.constants.Identity.SubAccountDeposit(),
      api.constants.Vesting.MinVestedTransfer(),
      api.constants.Origins.SpendCaps(),
      api.constants.Precompiles.BalancesErc20(),
      api.query.EVMChainId.ChainId.getValue(),
    ])

    // Addresses and amounts are formatted long before anything is read from
    // the chain, so those two are settings rather than answers. Checking them
    // here turns a chain that disagrees into a refusal rather than into
    // addresses nobody can use and amounts off by orders of magnitude.
    const { tokenDecimals, tokenSymbol } = (await client.getChainSpecData()).properties as {
      tokenDecimals?: number
      tokenSymbol?: string
    }
    if (ss58Prefix !== SS58_PREFIX) {
      throw new Error(`Chain uses address format ${ss58Prefix}, this wallet is built for ${SS58_PREFIX}`)
    }
    if (tokenDecimals !== DECIMALS) {
      throw new Error(`Chain carries ${tokenDecimals} decimals, this wallet is built for ${DECIMALS}`)
    }
    if (!tokenSymbol) {
      throw new Error('Chain names no token symbol in its spec')
    }

    return {
      ss58Prefix,
      decimals: tokenDecimals,
      symbol: tokenSymbol,
      evmChainId: Number(evmChainId),
      balancesErc20,
      existentialDeposit,
      blockSeconds: Number(blockSeconds),
      voteLockingPeriod,
      undecidingTimeout,
      proxyDepositBase,
      proxyDepositFactor,
      maxProxies,
      identityBasicDeposit,
      identityByteDeposit,
      subAccountDeposit,
      minVestedTransfer,
      spenders: caps.map(([track, origin, cap]) => ({ track, origin: origin.type, cap })),
    }
  }

  /**
   * Only a proposal has to reach for anything before it can be built, since it
   * carries the call it would run and the track says how soon that may happen.
   */
  /**
   * When the call being signed was first started, which every signature after
   * the first has to name. Nobody upstream carries it, so nobody upstream can
   * get it wrong, and a call nobody has started yet simply has none.
   */
  const timepointOf = async (multisig: string, callHash: string): Promise<Timepoint | undefined> =>
    (await api.query.Multisig.Multisigs.getValue(multisig, callHash, BEST))?.when

  const build = async (operation: Operation): Promise<Tx> => {
    if (operation.kind === 'propose') {
      const spend = api.tx.Treasury.spend({
        asset_kind: undefined,
        amount: operation.amount,
        beneficiary: operation.beneficiary,
        valid_from: undefined,
      })
      const table = await trackTable()
      const track = table.find((entry) => entry.id === operation.track)
      const spender = (await chainFacts()).spenders.find((entry) => entry.track === operation.track)
      if (!track || !spender) throw new Error(`Track ${operation.track} takes no proposals`)

      // A treasury spend is well under the inline bound, so it needs no preimage
      const submit = api.tx.Referenda.submit({
        proposal_origin: Enum('Origins', Enum(spender.origin)),
        proposal: Enum('Inline', await spend.getEncodedData()),
        enactment_moment: Enum('After', track.minEnactmentPeriod),
      })

      // The title has to be a preimage of its own before set_metadata will take
      // it, and set_metadata has to name an index the chain has not handed out
      // yet. Batching all three means a racing proposal takes the index, ours
      // fails on it, and the whole thing reverts rather than titling somebody
      // else's referendum
      const dump = new TextEncoder().encode(metadataDump(operation.title, operation.description))
      const note = api.tx.Preimage.note_preimage({ bytes: dump })
      const name = api.tx.Referenda.set_metadata({
        index: await api.query.Referenda.ReferendumCount.getValue(BEST),
        maybe_hash: blake2AsHex(dump, 256),
      })

      return api.tx.Utility.batch_all({
        calls: [note.decodedCall, submit.decodedCall, name.decodedCall],
      })
    }

    if (operation.kind === 'batch') {
      const inner = await Promise.all(operation.calls.map(build))
      return api.tx.Utility.batch_all({ calls: inner.map((tx) => tx.decodedCall) })
    }

    if (operation.kind === 'asProxy') {
      const inner = await build(operation.call)
      return api.tx.Proxy.proxy({
        real: Enum('Id', operation.real),
        force_proxy_type: undefined,
        call: inner.decodedCall,
      })
    }

    if (operation.kind === 'multisigApprove') {
      // Every signature carries the call, so the chain can run it the moment
      // the last one lands, and it has to be told what running it may cost
      const inner = await build(operation.call)
      const encoded = await inner.getEncodedData()
      const { weight } = await api.apis.TransactionPaymentCallApi.query_call_info(
        inner.decodedCall,
        encoded.length,
      )

      return api.tx.Multisig.as_multi({
        threshold: operation.threshold,
        other_signatories: operation.others,
        maybe_timepoint: await timepointOf(operation.multisig, blake2AsHex(encoded, 256)),
        call: inner.decodedCall,
        max_weight: weight,
      })
    }

    if (operation.kind === 'multisigApproveData') {
      const inner = await api.txFromCallData(hexToU8a(operation.hex))
      const encoded = await inner.getEncodedData()
      const { weight } = await api.apis.TransactionPaymentCallApi.query_call_info(
        inner.decodedCall,
        encoded.length,
      )

      return api.tx.Multisig.as_multi({
        threshold: operation.threshold,
        other_signatories: operation.others,
        maybe_timepoint: await timepointOf(operation.multisig, blake2AsHex(encoded, 256)),
        call: inner.decodedCall,
        max_weight: weight,
      })
    }

    if (operation.kind === 'multisigCancel') {
      const when = await timepointOf(operation.multisig, operation.callHash)
      if (!when) throw new Error('That call is no longer waiting on signatures')

      return api.tx.Multisig.cancel_as_multi({
        threshold: operation.threshold,
        other_signatories: operation.others,
        timepoint: when,
        call_hash: operation.callHash,
      })
    }

    if (operation.kind === 'provideJudgement') {
      // The chain takes the hash of the identity a verdict is for and refuses
      // the call if the identity has moved on since. Hashing what the registrar
      // was shown is what makes that check worth anything, so the info comes in
      // with the call rather than being read off the chain again here.
      //
      // Two bytes off the front of the call drops the pallet and call index,
      // which leaves the encoded info the chain hashes.
      const encoded = await api.tx.Identity.set_identity({
        info: fromIdentityInfo(operation.info),
      }).getEncodedData()

      return api.tx.Identity.provide_judgement({
        reg_index: operation.registrar,
        target: Enum('Id', operation.target),
        judgement: Enum(operation.judgement),
        identity: blake2AsHex(encoded.slice(2), 256),
      })
    }

    return sync(operation)
  }

  const sync = (
    operation: Exclude<
      Operation,
      | { kind: 'propose' }
      | { kind: 'provideJudgement' }
      | { kind: 'multisigApprove' }
      | { kind: 'multisigApproveData' }
      | { kind: 'multisigCancel' }
      | { kind: 'asProxy' }
      | { kind: 'batch' }
    >,
  ): Tx => {
    switch (operation.kind) {
      case 'transfer':
        return api.tx.Balances.transfer_keep_alive({
          dest: Enum('Id', operation.to),
          value: operation.amount,
        })
      case 'transferAll':
        return api.tx.Balances.transfer_all({
          dest: Enum('Id', operation.to),
          keep_alive: false,
        })
      case 'delegate':
        return api.tx.ConvictionVoting.delegate({
          class: operation.delegation.track,
          to: Enum('Id', operation.delegation.to),
          conviction: Enum(operation.delegation.conviction),
          balance: operation.delegation.amount,
        })
      case 'undelegate':
        return api.tx.ConvictionVoting.undelegate({ class: operation.track })
      // A delay would make the proxy announce before it acts. Nobody asks for
      // one from a wallet, so this always sets it up without
      case 'addProxy':
        return api.tx.Proxy.add_proxy({
          delegate: Enum('Id', operation.proxy.delegate),
          proxy_type: Enum(operation.proxy.type),
          delay: 0,
        })
      case 'removeProxy':
        return api.tx.Proxy.remove_proxy({
          delegate: Enum('Id', operation.proxy.delegate),
          proxy_type: Enum(operation.proxy.type),
          delay: 0,
        })
      case 'registerIdentity': {
        const set = api.tx.Identity.set_identity({ info: fromIdentityInfo(operation.info) })
        const calls = [set]
        // The pallet's own fee rail. The chain reserves the registrar's
        // declared fee here and hands it over with the judgement
        if (operation.registrar) {
          calls.push(
            api.tx.Identity.request_judgement({
              reg_index: operation.registrar.index,
              max_fee: operation.registrar.maxFee,
            }),
          )
        }
        // batch_all lands all or none, so the payment and the record it pays
        // for cannot come apart, and the judge only counts a transfer riding
        // the extrinsic that set the identity. A rewrite owing nothing rides
        // no transfer at all
        if (operation.pay && operation.pay.amount > 0n) {
          calls.push(
            api.tx.Balances.transfer_keep_alive({
              dest: Enum('Id', operation.pay.to),
              value: operation.pay.amount,
            }),
          )
        }
        return calls.length === 1
          ? set
          : api.tx.Utility.batch_all({ calls: calls.map((call) => call.decodedCall) })
      }
      case 'clearIdentity':
        return api.tx.Identity.clear_identity({})
      case 'setSubs':
        return api.tx.Identity.set_subs({
          subs: operation.subs.map((sub) => [sub.address, toData(sub.name)]),
        })
      case 'quitSub':
        return api.tx.Identity.quit_sub({})
      case 'vest':
        return api.tx.Vesting.vest({})
      case 'vestedTransfer':
        return api.tx.Vesting.vested_transfer({
          target: Enum('Id', operation.to),
          schedule: {
            locked: operation.schedule.locked,
            per_block: operation.schedule.perBlock,
            starting_block: operation.schedule.startingBlock,
          },
        })
      case 'proposeBounty':
        return api.tx.Bounties.propose_bounty({
          value: operation.value,
          description: new TextEncoder().encode(operation.description),
        })
      case 'acceptCurator':
        return api.tx.Bounties.accept_curator({ bounty_id: operation.bounty })
      case 'awardBounty':
        return api.tx.Bounties.award_bounty({
          bounty_id: operation.bounty,
          beneficiary: Enum('Id', operation.beneficiary),
        })
      case 'claimBounty':
        return api.tx.Bounties.claim_bounty({ bounty_id: operation.bounty })
      case 'unassignCurator':
        return api.tx.Bounties.unassign_curator({ bounty_id: operation.bounty })
      case 'extendBounty':
        return api.tx.Bounties.extend_bounty_expiry({
          bounty_id: operation.bounty,
          remark: new Uint8Array(),
        })
      case 'addChild':
        return api.tx.ChildBounties.add_child_bounty({
          parent_bounty_id: operation.bounty,
          value: operation.value,
          description: new TextEncoder().encode(operation.description),
        })
      case 'proposeChildCurator':
        return api.tx.ChildBounties.propose_curator({
          parent_bounty_id: operation.bounty,
          child_bounty_id: operation.child,
          curator: Enum('Id', operation.curator),
          fee: operation.fee,
        })
      case 'acceptChildCurator':
        return api.tx.ChildBounties.accept_curator({
          parent_bounty_id: operation.bounty,
          child_bounty_id: operation.child,
        })
      case 'awardChild':
        return api.tx.ChildBounties.award_child_bounty({
          parent_bounty_id: operation.bounty,
          child_bounty_id: operation.child,
          beneficiary: Enum('Id', operation.beneficiary),
        })
      case 'claimChild':
        return api.tx.ChildBounties.claim_child_bounty({
          parent_bounty_id: operation.bounty,
          child_bounty_id: operation.child,
        })
      case 'unassignChildCurator':
        return api.tx.ChildBounties.unassign_curator({
          parent_bounty_id: operation.bounty,
          child_bounty_id: operation.child,
        })
      case 'closeChild':
        return api.tx.ChildBounties.close_child_bounty({
          parent_bounty_id: operation.bounty,
          child_bounty_id: operation.child,
        })
      case 'requestJudgement':
        return api.tx.Identity.request_judgement({
          reg_index: operation.registrar,
          max_fee: operation.maxFee,
        })
      case 'cancelJudgement':
        return api.tx.Identity.cancel_request({ reg_index: operation.registrar })
      case 'setFee':
        return api.tx.Identity.set_fee({ index: operation.registrar, fee: operation.fee })
      case 'vote':
        return api.tx.ConvictionVoting.vote({
          poll_index: operation.poll,
          vote:
            operation.ballot.kind === 'abstain'
              ? Enum('SplitAbstain', { aye: 0n, nay: 0n, abstain: operation.ballot.amount })
              : Enum('Standard', {
                  vote: voteByte(operation.ballot),
                  balance: operation.ballot.amount,
                }),
        })
      case 'removeVote':
        return api.tx.ConvictionVoting.remove_vote({
          class: operation.track,
          index: operation.poll,
        })
      case 'unlock':
        return api.tx.ConvictionVoting.unlock({
          class: operation.track,
          target: Enum('Id', operation.target),
        })
      case 'decisionDeposit':
        return api.tx.Referenda.place_decision_deposit({ index: operation.poll })
      case 'payout':
        return api.tx.Treasury.payout({ index: operation.spend })
      case 'refundSubmission':
        return api.tx.Referenda.refund_submission_deposit({ index: operation.poll })
      case 'refundDecision':
        return api.tx.Referenda.refund_decision_deposit({ index: operation.poll })
      case 'unnotePreimage':
        return api.tx.Preimage.unnote_preimage({ hash: operation.hash })
    }
  }

  // Asked at connect so a chain that disagrees refuses up front rather than
  // on whichever screen happens to read a constant first
  chainFacts().catch(() => {})

  return {
    /**
     * One request timed end to end. system_health is asked for because it is
     * never served from a cache and brings back what the node makes of its own
     * position, which no round trip on its own would say.
     */
    facts(): Promise<ChainFacts> {
      return chainFacts()
    },

    async reach(): Promise<Reach> {
      const ask = async () => {
        const at = performance.now()
        const health = await client._request<Health, []>('system_health', [])
        return { ms: performance.now() - at, health }
      }

      // Twice, keeping the shorter. A reply that lands behind whatever the page
      // was busy with is timed from the queue rather than the wire, and one
      // stalled render reads as a node an order of magnitude slower than it is
      const first = await ask()
      const second = await ask()
      const { health } = second

      return {
        ms: Math.min(first.ms, second.ms),
        peers: health.peers,
        syncing: health.isSyncing,
      }
    },

    subscribeHead(onHead: (head: ChainHead) => void): Unsubscribe {
      const sub = client.finalizedBlock$.subscribe((block) => {
        onHead({ number: block.number, hash: block.hash })
      })
      return () => sub.unsubscribe()
    },

    /**
     * Two storage items make one balance. The account carries the amounts and
     * the lock list carries what froze them, and either changes without the
     * other, so both are watched. Nothing goes out until both have spoken, or
     * the first reading would show the account with no locks on it.
     */
    subscribeBalance(address, onBalance): Unsubscribe {
      let info: AccountInfo | undefined
      let locks: BalanceLock[] | undefined
      // An account nobody has ever touched reads as undefined, which is an
      // answer, so the amounts need a flag of their own to say they arrived
      let amounts = false
      // The deposit decides what stays untouchable, so nothing can be reported
      // before it lands. It arrives once and every later update reuses it.
      let deposit: bigint | undefined

      const push = () => {
        if (amounts && locks && deposit !== undefined) onBalance(toBalance(info, locks, deposit))
      }

      void chainFacts().then((facts) => {
        deposit = facts.existentialDeposit
        push()
      })

      const account = api.query.System.Account.watchValue(address).subscribe((update) => {
        info = update.value
        amounts = true
        push()
      })
      const held = api.query.Balances.Locks.watchValue(address).subscribe((update) => {
        locks = update.value ?? []
        push()
      })

      return () => {
        account.unsubscribe()
        held.unsubscribe()
      }
    },

    async proxies(address: string): Promise<Proxy[]> {
      const entry = await api.query.Proxy.Proxies.getValue(address)
      return (entry?.[0] ?? []).map((definition) => ({
        delegate: definition.delegate,
        type: definition.proxy_type.type as Proxy['type'],
      }))
    },

    /**
     * The pallet keeps the list on the parent and each name on the sub, so what
     * the parent is holding takes one read and the names take one apiece.
     */
    async subsOf(address: string): Promise<Subs> {
      const entry = await api.query.Identity.SubsOf.getValue(address, BEST)
      if (!entry) return { deposit: 0n, list: [] }

      const [deposit, addresses] = entry
      const list = await Promise.all(
        addresses.map(async (sub) => {
          const link = await api.query.Identity.SuperOf.getValue(sub, BEST)
          return { address: sub, name: link ? fromData(link[1]) : '' }
        }),
      )
      return { deposit, list }
    },

    /**
     * The description is stored apart from the record, so naming a bounty is a
     * read of its own. What the status carries depends on which one it is.
     */
    async bounties(): Promise<Bounty[]> {
      const entries = await api.query.Bounties.Bounties.getEntries(BEST)

      const read = entries.flatMap(({ keyArgs: [index], value }) => {
        const state = BOUNTY_STATES[value.status.type]
        if (!state) return []
        return [{ index, value, state }]
      })

      return (
        await Promise.all(
          read.map(async ({ index, value, state }) => {
            const bytes = await api.query.Bounties.BountyDescriptions.getValue(index, BEST)
            const held = value.status.value ?? {}
            return {
              index,
              description: bytes ? new TextDecoder().decode(bytes) : '',
              proposer: value.proposer,
              value: value.value,
              fee: value.fee,
              bond: value.bond,
              curatorDeposit: value.curator_deposit,
              state,
              curator: held.curator ?? null,
              beneficiary: held.beneficiary ?? null,
              until: held.unlock_at ?? held.update_due ?? null,
            }
          }),
        )
      ).sort((one, other) => other.index - one.index)
    },

    /** Keyed by the parent and the child together, which is the only name one has. */
    async childBounties(): Promise<ChildBounty[]> {
      const entries = await api.query.ChildBounties.ChildBounties.getEntries(BEST)

      const read = entries.flatMap(({ keyArgs: [parent, index], value }) => {
        const state = CHILD_STATES[value.status.type]
        return state ? [{ parent, index, value, state }] : []
      })

      return (
        await Promise.all(
          read.map(async ({ parent, index, value, state }) => {
            const bytes = await api.query.ChildBounties.ChildBountyDescriptionsV1.getValue(
              parent,
              index,
              BEST,
            )
            const held = value.status.value ?? {}
            return {
              parent,
              index,
              description: bytes ? new TextDecoder().decode(bytes) : '',
              value: value.value,
              fee: value.fee,
              curatorDeposit: value.curator_deposit,
              state,
              curator: held.curator ?? null,
              beneficiary: held.beneficiary ?? null,
              until: held.unlock_at ?? null,
            }
          }),
        )
      ).sort((one, other) => other.index - one.index)
    },

    async vesting(address: string): Promise<VestingSchedule[]> {
      const schedules = await api.query.Vesting.Vesting.getValue(address, BEST)
      return (schedules ?? []).map((schedule) => ({
        locked: schedule.locked,
        perBlock: schedule.per_block,
        startingBlock: schedule.starting_block,
      }))
    },

    async standingOf(address: string): Promise<Standing> {
      // The runtime's gate reads the account's own record first and the parent's
      // after, so both are wanted whether or not the first one turns up
      const [own, link] = await Promise.all([
        readRegistration(address),
        api.query.Identity.SuperOf.getValue(address, BEST),
      ])
      if (!link) return { own, sub: null }

      const [parent, name] = link
      return {
        own,
        sub: { name: fromData(name), parent, registration: await readRegistration(parent) },
      }
    },

    async registrars(): Promise<Registrar[]> {
      const entries = (await api.query.Identity.Registrars.getValue(BEST)) ?? []
      // The list is sparse once one is removed, and the index is what a request
      // names, so a gap keeps its slot rather than shifting the ones after it
      return entries.flatMap((entry, index) =>
        entry ? [{ index, account: entry.account, fee: entry.fee, fields: entry.fields }] : [],
      )
    },

    tracks: trackTable,

    /**
     * The running ones. A settled referendum is history, which the explorer
     * keeps. What order they come back in is the list's business.
     */
    async referenda(): Promise<Referendum[]> {
      const entries = await api.query.Referenda.ReferendumInfoFor.getEntries(BEST)

      const running = entries.flatMap(({ keyArgs: [index], value }) =>
        value.type === 'Ongoing' ? [{ index, status: value.value as ReferendumStatus }] : [],
      )

      const read = running.map(async ({ index, status }) => ({
        index,
        track: status.track,
        ...(await readMetaOf(index)),
        state: toState(status),
        tally: status.tally,
        proposal: await readProposal(status.proposal),
        decisionDeposit: status.decision_deposit?.amount ?? null,
        submitted: status.submitted,
        deciding: status.deciding
          ? { since: status.deciding.since, confirming: status.deciding.confirming ?? null }
          : null,
      }))

      return Promise.all(read)
    },

    /**
     * The ones that are over and have not given their deposits back. A refunded
     * deposit is taken out of the record, so what is left here is what is owed.
     */
    async settled(): Promise<Settled[]> {
      const entries = await api.query.Referenda.ReferendumInfoFor.getEntries(BEST)

      return entries
        .flatMap(({ keyArgs: [index], value }) => {
          const outcome = OUTCOMES[value.type]
          if (!outcome) return []

          const [, submission, decision] = value.value as SettledInfo
          return [{ index, outcome, submission: submission ?? null, decision: decision ?? null }]
        })
        .filter(hasRefund)
        .sort((one, other) => other.index - one.index)
    },

    /**
     * What each of these multisigs has started and not finished. The pallet
     * keys them by the multisig and the hash of the call, so the pair is the
     * only name a waiting call has.
     */
    async pending(multisigs: string[]): Promise<Pending[]> {
      if (multisigs.length === 0) return []
      const wanted = new Set(multisigs)
      const entries = await api.query.Multisig.Multisigs.getEntries(BEST)

      return entries.flatMap(({ keyArgs: [multisig, callHash], value }) =>
        wanted.has(multisig)
          ? [{
              multisig,
              callHash,
              when: value.when,
              deposit: value.deposit,
              depositor: value.depositor,
              approvals: value.approvals,
            }]
          : [],
      )
    },

    /**
     * What a multisig signatory hands the next one. The chain keeps only the
     * hash, so these bytes are the only copy of what was started.
     */
    async callData(operation: Operation) {
      const tx = await build(operation)
      const encoded = await tx.getEncodedData()
      return {
        name: `${tx.decodedCall.type}.${tx.decodedCall.value.type}`,
        args: Object.entries(tx.decodedCall.value.value ?? {}).map(([name, value]) => ({
          name,
          value: spell(value),
        })),
        hex: toHex(encoded),
        hash: blake2AsHex(encoded, 256),
      }
    },

    /**
     * The other end of that. The hash comes off the call as the runtime encodes
     * it rather than off the bytes handed in, so what the reader is shown and
     * what the hash names are the same call.
     */
    async readCall(hex: string): Promise<ReadCall> {
      if (!/^0x[0-9a-fA-F]*$/.test(hex.trim()) || hex.trim().length % 2 !== 0) {
        throw new Error('Call data is a 0x hex string')
      }

      const read = await api.txFromCallData(hexToU8a(hex.trim()))
      const args = read.decodedCall.value.value ?? {}
      return {
        hash: blake2AsHex(await read.getEncodedData(), 256),
        operation: asOperation(read.decodedCall),
        label: `${read.decodedCall.type}.${read.decodedCall.value.type}`,
        args: Object.entries(args).map(([name, value]) => ({ name, value: spell(value) })),
      }
    },

    /**
     * Only the account that noted a preimage may clear it, so anything nobody
     * here owns is somebody else's to deal with. A requested one is held by the
     * chain rather than by its noter and cannot be cleared at all.
     */
    async preimages(owners: string[]): Promise<NotedPreimage[]> {
      if (owners.length === 0) return []
      const wanted = new Set(owners)
      const entries = await api.query.Preimage.RequestStatusFor.getEntries(BEST)

      return entries.flatMap(({ keyArgs: [hash], value }) => {
        if (value.type !== 'Unrequested') return []
        const [who, amount] = value.value.ticket
        return wanted.has(who) ? [{ hash, who, len: value.value.len, amount }] : []
      })
    },

    /**
     * Everything the treasury still owes. A spend it has already paid out stays
     * until somebody clears the record, and that record is what says it worked.
     */
    async spends(): Promise<Spend[]> {
      const entries = await api.query.Treasury.Spends.getEntries(BEST)

      return entries
        .map(({ keyArgs: [index], value }) => ({
          index,
          amount: value.amount,
          beneficiary: value.beneficiary,
          validFrom: value.valid_from,
          expireAt: value.expire_at,
          paid: value.status.type === 'Attempted',
        }))
        .sort((one, other) => other.index - one.index)
    },

    async locks(address: string): Promise<ClassLock[]> {
      const held = await api.query.ConvictionVoting.ClassLocksFor.getValue(address, BEST)

      return Promise.all(
        held.map(async ([track, amount]) => {
          const voting = await api.query.ConvictionVoting.VotingFor.getValue(address, track, BEST)
          const [freeAt] = voting.value.prior
          return { track, amount, polls: voting.value.votes?.map(([poll]) => poll) ?? [], freeAt }
        }),
      )
    },

    async activeIssuance(): Promise<bigint> {
      const [total, inactive] = await Promise.all([
        api.query.Balances.TotalIssuance.getValue(BEST),
        api.query.Balances.InactiveIssuance.getValue(BEST),
      ])
      return total - inactive
    },

    async estimateFee(from: string, operation: Operation): Promise<bigint> {
      return (await build(operation)).getEstimatedFees(from)
    },

    submit(
      account: WalletAccount,
      operation: Operation,
      onProgress?: (progress: TxProgress) => void,
    ): Promise<string> {
      return new Promise((resolve, reject) => {
        build(operation)
          .then((tx) =>
            tx.signSubmitAndWatch(account.signer).subscribe({
              next(event) {
                if (event.type === 'signed') onProgress?.({ stage: 'signed', hash: event.txHash })
                if (event.type === 'broadcasted') {
                  onProgress?.({ stage: 'broadcast', hash: event.txHash })
                }
                if (event.type === 'txBestBlocksState' && event.found) {
                  if (!event.ok) return reject(new Error(dispatchMessage(event)))
                  onProgress?.({ stage: 'inBlock', hash: event.txHash })
                }
                if (event.type === 'finalized') {
                  if (!event.ok) return reject(new Error(dispatchMessage(event)))
                  onProgress?.({ stage: 'finalized', hash: event.txHash })
                  resolve(event.txHash)
                }
              },
              error: reject,
              complete: () => undefined,
            }),
          )
          .catch(reject)
      })
    },

    disconnect() {
      client.destroy()
    },
  }
}
