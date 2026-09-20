import { stringToU8a } from '@polkadot/util'
import { encodeMultiAddress } from '@polkadot/util-crypto'
import { palletAccount } from '@/lib/address'
import { replaceBigInt, reviveBigInt } from '@/lib/json'
import { DECIMALS, SS58_PREFIX, UNIT } from './config'
import {
  hasRefund,
  metadataDump,
  readMeta,
  refundsSubmission,
  releaseOf,
  type CastVote,
  type ClassLock,
  type Motion,
  type NotedPreimage,
  type PollOutcome,
  type Proposal,
  type Referendum,
  type Settled,
  type Spend,
  type Curve,
  type Track,
} from './governance'
import {
  depositFor,
  EMPTY_IDENTITY,
  isQualified,
  type Registrar,
  type Registration,
  type Standing,
  type SubIdentity,
  type Subs,
  type UsernameAuthority,
} from './identity'
import type { WalletAccount } from '@/signing/types'
import type { Bounty, ChildBounty } from './bounties'
import {
  stakeFor,
  type SessionKeys,
  type ValidatorLock,
  type ValidatorRecord,
  type ValidatorSet,
} from './validator'
import { releasable, type VestingSchedule } from './vesting'
import {
  transferableOf,
  type AccountBalance,
  type ChainFacts,
  type ChainHead,
  type CallArg,
  type ChainRepository,
  type Operation,
  type Pending,
  type Proxy,
  type Reach,
  type ReadCall,
  type TxProgress,
  type Unsubscribe,
} from './types'

/**
 * Lets the UI run with no node attached. Selected by VITE_CHAIN=mock so the
 * real client stays the default and nobody ships fake balances by accident.
 * Balances are derived from the address, so a given account always shows the
 * same numbers and screenshots stay comparable.
 */
function hash(value: string): bigint {
  let h = 2166136261n
  for (const ch of value) {
    h ^= BigInt(ch.codePointAt(0) ?? 0)
    h = (h * 16777619n) & 0xffffffffn
  }
  return h
}

function seedBalance(address: string): AccountBalance {
  const h = hash(address)
  const free = (h % 900_000n) * UNIT + (h % 1_000_000_000_000_000_000n)
  const frozen = h % 4n === 0n ? free / 3n : 0n
  const reserved = h % 3n === 0n ? UNIT / 2n : 0n
  // One lock is what froze the account, so the two figures agree the way the
  // chain has them agree
  return {
    free,
    reserved,
    frozen,
    transferable: transferableOf(free, reserved, frozen, FACTS.existentialDeposit),
    locked: frozen,
  }
}

const FEE = 6_400_000_000_000_000n

/** Base plus the per byte rate on a metadata dump of the length below. */
const PREIMAGE_DEPOSIT = 5n * UNIT + 214n * UNIT / 100n

/**
 * What a real chain would answer for its constants. Invented like the rest of
 * this file, but kept at the runtime's own figures so the UI reads the same
 * here as it does against a node.
 */
const FACTS: ChainFacts = {
  ss58Prefix: SS58_PREFIX,
  decimals: DECIMALS,
  symbol: 'tNUMN',
  evmChainId: 320262,
  balancesErc20: '0x0000000000000000000000000000000000000802',
  existentialDeposit: UNIT / 1_000_000n,
  blockSeconds: 10,
  voteLockingPeriod: (7 * 24 * 3600) / 10,
  undecidingTimeout: (14 * 24 * 3600) / 10,
  submissionDeposit: 5n * UNIT,
  payoutPeriod: (30 * 24 * 3600) / 10,
  preimageBaseDeposit: 5n * UNIT,
  preimageByteDeposit: UNIT / 100n,
  treasury: palletAccount(stringToU8a('py/trsry')),
  proxyDepositBase: 5n * UNIT,
  proxyDepositFactor: (37n * UNIT) / 100n,
  maxProxies: 32,
  identityBasicDeposit: 5n * UNIT + (17n * UNIT) / 100n,
  identityByteDeposit: UNIT / 100n,
  subAccountDeposit: 5n * UNIT + (53n * UNIT) / 100n,
  maxSuffixLength: 7,
  minVestedTransfer: UNIT,
  spenders: [
    { track: 30, cap: 200_000n * UNIT },
    { track: 31, cap: 1_000_000n * UNIT },
    { track: 32, cap: 10_000_000n * UNIT },
  ],
  validatorStake: 100_000_000n * UNIT,
  validatorLockPeriod: (180 * 24 * 3600) / 10,
  maxValidators: 1_000,
  sessionPeriod: 600 / 10,
  sessionOffset: 0,
}
const PREIMAGE_LEN = 214



const same = (one: Proxy, other: Proxy) =>
  one.delegate === other.delegate && one.type === other.type

const receipt = (seed: string) => `0x${hash(seed).toString(16).padStart(64, '0')}`

/**
 * Call data, mocked. A real chain SCALE encodes the call and hashes the bytes,
 * and what matters here is only that the bytes carry the whole call and read
 * back as the same call, so the operation itself goes in as text.
 */
const callText = (operation: Operation): string => JSON.stringify(operation, replaceBigInt)

const encodeCall = (operation: Operation): string =>
  `0x${Array.from(new TextEncoder().encode(callText(operation)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')}`

/** Everything the operation carries past which one it is. */
const callArgs = (operation: Operation): CallArg[] =>
  Object.entries(operation)
    .filter(([name]) => name !== 'kind')
    .map(([name, value]) => ({ name, value: String(value) }))

const decodeCall = (hex: string): Operation => {
  const bytes = hex.slice(2).match(/../g) ?? []
  const text = new TextDecoder().decode(Uint8Array.from(bytes, (pair) => parseInt(pair, 16)))
  return JSON.parse(text, reviveBigInt) as Operation
}

const callHashOf = (operation: Operation) => receipt(callText(operation))

/**
 * The dev chain's Alice, its one genesis validator and its first registrar. Bob
 * stands in for an account prime has already waived the stake for. The dev
 * phrase restores both, which is how a test walks an invitation through.
 */
const ALICE = 'nu7SVAyQhPoGBJfFg7di66oYTV2KVBBeCw3Gt9qTRE2zpSUyb'
const BOB = 'nu5sKtuEZG5GH9emAghk9MTdVPBJbieEsSD8Z6UKkA45afKcv'

const ALICE_KEYS: SessionKeys = {
  grandpa: '0x88dc3417d5058ec4b4503e0c12ea1a0a89be200fe98922423d4334014fa6b0ee',
  imOnline: '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d',
}

/** Two public keys back to back, which is all the mock checks a pasted blob for. */
const splitKeys = (hex: string): SessionKeys => {
  const blob = hex.trim()
  if (!/^0x[0-9a-f]{128}$/i.test(blob)) throw new Error('Not the session keys this chain takes')
  return { grandpa: `0x${blob.slice(2, 66)}`, imOnline: `0x${blob.slice(66)}` }
}

/**
 * Two registrars, the automated one and a human one. The first sits on the
 * account the local network names as its bot. The second takes manual requests.
 */
const REGISTRARS: Registrar[] = [
  {
    index: 0,
    account: ALICE,
    fee: UNIT / 2n,
  },
  {
    index: 1,
    account: 'nu5uyy5Nbb59unGAqDVLUM85nDJyyhx7irzPtdUcrSTG6xNXm',
    fee: UNIT / 2n,
  },
]

/**
 * One beneficiary the registrar has checked, so the referenda list has both a
 * name to show and an address with nothing behind it.
 */
const TEAM = 'nu2uaQWzSyDzXHrgd78sQL2871qL2LpPU6kHeeb4ETtXfnASg'
const PAYOUTS = 'nu6mvwk9LrcGA1tffi5xKw1z6mNbc7FjwoGG2nemwHYjPtbLW'

const SEEDED_IDENTITIES: [string, Registration][] = [
  [
    TEAM,
    {
      info: { ...EMPTY_IDENTITY, display: 'Numen Explorer Team', telegram: '@numen_explorer' },
      judgements: [{ registrar: 0, judgement: 'Reasonable' }],
      deposit: UNIT,
    },
  ],
]

/** One sub, which registers nothing of its own and answers to the parent. */
const SEEDED_SUBS: [string, SubIdentity][] = [
  [PAYOUTS, { name: 'Payouts', parent: TEAM, registration: null }],
]

const SEEDED_AUTHORITIES: UsernameAuthority[] = [
  { suffix: 'numen', account: TEAM, allocation: 500 },
]

/** What the chain reads back for every call but a spend, named by pallet and call. */
const CALL_NAMES: Record<Exclude<Motion['kind'], 'spend'>, string> = {
  remark: 'System.remark',
  cancel: 'Referenda.cancel',
  kill: 'Referenda.kill',
  addRegistrar: 'Identity.add_registrar',
  removeRegistrar: 'Identity.remove_registrar',
  addUsernameAuthority: 'Identity.add_username_authority',
  removeUsernameAuthority: 'Identity.remove_username_authority',
}

const proposalOf = (motion: Motion): Proposal =>
  motion.kind === 'spend'
    ? { kind: 'spend', spends: motion.payouts.map((payout) => ({ ...payout })) }
    : { kind: 'other', label: CALL_NAMES[motion.kind] }

const MINUTES = 6
const HOURS = 60 * MINUTES
const DAYS = 24 * HOURS

/** The runtime's own table, which is a constant there and so a constant here. */
/** As Curve::make_linear sets one, running a fraction of the decision period. */
const line = (length: number, floor: number, ceil: number): Curve => ({
  kind: 'linear',
  length,
  floor,
  ceil,
})

/** The three parts Curve::make_reciprocal solves for, copied off the runtime. */
const reciprocal = (factor: number, xOffset: number, yOffset: number): Curve => ({
  kind: 'reciprocal',
  factor,
  xOffset,
  yOffset,
})

const APP_PRIVILEGED = reciprocal(0.222222224, 0.333333335, 0.333333332)
const SUP_UNWIND = line(1, 0, 0.5)
const SUP_TAPER = reciprocal(0.016649324, 0.032258065, -0.016129033)

const TRACKS: Track[] = [
  {
    id: 0,
    name: 'Root',
    origin: 'Root',
    decisionDeposit: 100_000n * UNIT,
    preparePeriod: DAYS,
    decisionPeriod: 28 * DAYS,
    confirmPeriod: DAYS,
    minEnactmentPeriod: DAYS,
    maxDeciding: 1,
    approvalCurve: APP_PRIVILEGED,
    supportCurve: SUP_UNWIND,
  },
  {
    id: 1,
    name: 'Runtime upgrade',
    origin: 'RuntimeUpgrade',
    decisionDeposit: 100n * UNIT,
    preparePeriod: 10 * MINUTES,
    decisionPeriod: 28 * DAYS,
    confirmPeriod: 10 * MINUTES,
    minEnactmentPeriod: 10 * MINUTES,
    maxDeciding: 1,
    approvalCurve: APP_PRIVILEGED,
    supportCurve: reciprocal(0.000378501, 0.000756429, -0.000378215),
  },
  {
    id: 2,
    name: 'Wish for change',
    origin: 'WishForChange',
    decisionDeposit: 1_000n * UNIT,
    preparePeriod: 2 * HOURS,
    decisionPeriod: 28 * DAYS,
    confirmPeriod: DAYS,
    minEnactmentPeriod: 10 * MINUTES,
    maxDeciding: 10,
    approvalCurve: APP_PRIVILEGED,
    supportCurve: SUP_UNWIND,
  },
  {
    id: 10,
    name: 'Identity admin',
    origin: 'IdentityAdmin',
    decisionDeposit: 1_000n * UNIT,
    preparePeriod: 2 * HOURS,
    decisionPeriod: 28 * DAYS,
    confirmPeriod: DAYS,
    minEnactmentPeriod: 10 * MINUTES,
    maxDeciding: 10,
    approvalCurve: APP_PRIVILEGED,
    supportCurve: SUP_TAPER,
  },
  {
    id: 20,
    name: 'Referendum canceller',
    origin: 'ReferendumCanceller',
    decisionDeposit: 1_000n * UNIT,
    preparePeriod: 2 * HOURS,
    decisionPeriod: 7 * DAYS,
    confirmPeriod: DAYS,
    minEnactmentPeriod: 10 * MINUTES,
    maxDeciding: 1_000,
    approvalCurve: line(1, 0.5, 1),
    supportCurve: SUP_TAPER,
  },
  {
    id: 21,
    name: 'Referendum killer',
    origin: 'ReferendumKiller',
    decisionDeposit: 10_000n * UNIT,
    preparePeriod: 2 * HOURS,
    decisionPeriod: 28 * DAYS,
    confirmPeriod: DAYS,
    minEnactmentPeriod: 10 * MINUTES,
    maxDeciding: 1_000,
    approvalCurve: line(1, 0.5, 1),
    supportCurve: SUP_TAPER,
  },
  {
    id: 30,
    name: 'Small spender',
    origin: 'SmallSpender',
    decisionDeposit: 100n * UNIT,
    preparePeriod: 4 * HOURS,
    decisionPeriod: 28 * DAYS,
    confirmPeriod: DAYS,
    minEnactmentPeriod: DAYS,
    maxDeciding: 100,
    approvalCurve: line(0.25, 0.5, 1),
    supportCurve: reciprocal(0.003846922, 0.007712083, 0.001182519),
  },
  {
    id: 31,
    name: 'Medium spender',
    origin: 'MediumSpender',
    decisionDeposit: 200n * UNIT,
    preparePeriod: 4 * HOURS,
    decisionPeriod: 28 * DAYS,
    confirmPeriod: 3 * DAYS,
    minEnactmentPeriod: DAYS,
    maxDeciding: 20,
    approvalCurve: line(0.5, 0.5, 1),
    supportCurve: reciprocal(0.005846821, 0.011734029, 0.001720990),
  },
  {
    id: 32,
    name: 'Big spender',
    origin: 'BigSpender',
    decisionDeposit: 1_000n * UNIT,
    preparePeriod: 4 * HOURS,
    decisionPeriod: 28 * DAYS,
    confirmPeriod: 7 * DAYS,
    minEnactmentPeriod: DAYS,
    maxDeciding: 2,
    approvalCurve: line(1, 0.5, 1),
    supportCurve: reciprocal(0.007901235, 0.015873016, 0.002222222),
  },
]

const ACTIVE_ISSUANCE = 12_000_000n * UNIT

/** Where the invented chain is up to, which every seeded clock is set against. */
const NOW = 4_182_907

/**
 * One of each state an Ongoing referendum passes through, and between them all
 * three ways the list names a beneficiary.
 */
const SEEDED: Referendum[] = [
  {
    index: 3,
    track: 31,
    title: 'Pay for the runtime security audit',
    description:
      'Two firms quoted for a full pass over the runtime and the node. This covers the cheaper of the two, with the report published either way.',
    submitter: TEAM,
    metadataHash: receipt('meta 3'),
    state: 'confirming',
    // Past both curves, which is the only way one gets to be confirming
    tally: { ayes: 7_800_000n * UNIT, nays: 200_000n * UNIT, support: 5_200_000n * UNIT },
    proposal: { kind: 'spend', spends: [{ amount: 400_000n * UNIT, beneficiary: TEAM, validFrom: null }] },
    decisionDeposit: 200n * UNIT,
    submitted: 4_178_200,
    deciding: { since: NOW - 3 * DAYS, confirming: NOW + 12 * HOURS },
  },
  {
    index: 2,
    track: 30,
    title: 'Top up the testnet faucet',
    description: 'The faucet runs dry about once a month and somebody has to notice.',
    submitter: PAYOUTS,
    metadataHash: receipt('meta 2'),
    state: 'queued',
    tally: { ayes: 0n, nays: 0n, support: 0n },
    proposal: { kind: 'spend', spends: [{ amount: 5_000n * UNIT, beneficiary: PAYOUTS, validFrom: null }] },
    decisionDeposit: 100n * UNIT,
    submitted: 4_182_600,
    deciding: null,
  },
  {
    index: 1,
    track: 31,
    title: 'Fund the block explorer for a year',
    description:
      'Hosting, the indexer and one person to keep it running. Twelve months, paid a quarter at a time, and the code stays open whatever happens after that.',
    submitter: TEAM,
    metadataHash: receipt('meta 1'),
    state: 'deciding',
    tally: { ayes: 4_100_000n * UNIT, nays: 900_000n * UNIT, support: 2_600_000n * UNIT },
    // Four quarters off one referendum, which is what a batch of spends buys
    proposal: {
      kind: 'spend',
      spends: [
        { amount: 62_500n * UNIT, beneficiary: TEAM, validFrom: null },
        { amount: 62_500n * UNIT, beneficiary: TEAM, validFrom: NOW + 90 * DAYS },
        { amount: 62_500n * UNIT, beneficiary: TEAM, validFrom: NOW + 180 * DAYS },
        { amount: 62_500n * UNIT, beneficiary: TEAM, validFrom: NOW + 270 * DAYS },
      ],
    },
    decisionDeposit: 200n * UNIT,
    submitted: 4_180_000,
    deciding: { since: NOW - 2 * DAYS, confirming: null },
  },
  // Nobody set metadata on this one, so the card falls back to the track
  {
    index: 0,
    track: 30,
    title: null,
    description: null,
    submitter: PAYOUTS,
    metadataHash: null,
    state: 'preparing',
    tally: { ayes: 0n, nays: 0n, support: 0n },
    proposal: {
      kind: 'spend',
      spends: [
        {
          amount: 12_000n * UNIT,
          beneficiary: 'nu3oNksEGXV3Tsr4sBeRUpcfA5zYp4VvZ7t9uKVPMAe2UCo98',
          validFrom: null,
        },
      ],
    },
    decisionDeposit: null,
    submitted: 4_182_400,
    deciding: null,
  },
]

/**
 * One spend to claim now, one the enactment has not reached yet, and one the
 * payout window has already shut on.
 */
const SEEDED_SPENDS: Spend[] = [
  {
    index: 2,
    amount: 250_000n * UNIT,
    beneficiary: TEAM,
    validFrom: 4_182_000,
    expireAt: 4_182_000 + 30 * DAYS,
    paid: false,
  },
  {
    index: 1,
    amount: 5_000n * UNIT,
    beneficiary: PAYOUTS,
    validFrom: 4_190_000,
    expireAt: 4_190_000 + 30 * DAYS,
    paid: false,
  },
  {
    index: 0,
    amount: 12_000n * UNIT,
    beneficiary: 'nu3oNksEGXV3Tsr4sBeRUpcfA5zYp4VvZ7t9uKVPMAe2UCo98',
    validFrom: 4_100_000,
    expireAt: 4_180_000,
    paid: false,
  },
]

/**
 * One bounty at each point a signature is wanted, which between them cover
 * every button the list draws.
 */
const SEEDED_BOUNTIES: Bounty[] = [
  {
    index: 3,
    description: 'Write the validator handbook',
    proposer: TEAM,
    value: 40_000n * UNIT,
    fee: 4_000n * UNIT,
    bond: 10n * UNIT,
    curatorDeposit: 0n,
    state: 'curatorProposed',
    curator: PAYOUTS,
    beneficiary: null,
    until: null,
  },
  {
    index: 2,
    description: 'Run the testnet faucet for a year',
    proposer: TEAM,
    value: 20_000n * UNIT,
    fee: 2_000n * UNIT,
    bond: 10n * UNIT,
    curatorDeposit: 500n * UNIT,
    state: 'active',
    curator: PAYOUTS,
    beneficiary: null,
    until: 4_200_000,
  },
  {
    index: 1,
    description: 'Port the explorer to mobile',
    proposer: PAYOUTS,
    value: 60_000n * UNIT,
    fee: 6_000n * UNIT,
    bond: 10n * UNIT,
    curatorDeposit: 1_500n * UNIT,
    state: 'pendingPayout',
    curator: PAYOUTS,
    beneficiary: TEAM,
    until: 4_182_000,
  },
  {
    index: 0,
    description: 'Translate the docs into Japanese',
    proposer: TEAM,
    value: 8_000n * UNIT,
    fee: 800n * UNIT,
    bond: 10n * UNIT,
    curatorDeposit: 0n,
    state: 'funded',
    curator: null,
    beneficiary: null,
    until: null,
  },
]

/** Two pieces of the active bounty, one still looking and one already running. */
const SEEDED_CHILDREN: ChildBounty[] = [
  {
    parent: 2,
    index: 1,
    description: 'Keep the faucet topped up for six months',
    value: 6_000n * UNIT,
    fee: 600n * UNIT,
    curatorDeposit: 150n * UNIT,
    state: 'active',
    curator: TEAM,
    beneficiary: null,
    until: null,
  },
  {
    parent: 2,
    index: 0,
    description: 'Write the faucet a status page',
    value: 3_000n * UNIT,
    fee: 300n * UNIT,
    curatorDeposit: 0n,
    state: 'added',
    curator: null,
    beneficiary: null,
    until: null,
  },
]

/**
 * One of each way a referendum ends, so the list shows both what comes back and
 * what being rejected costs.
 */
const SEEDED_SETTLED: Settled[] = [
  {
    index: 12,
    outcome: 'approved',
    submission: { who: TEAM, amount: 100n * UNIT },
    decision: { who: TEAM, amount: 5_000n * UNIT },
  },
  {
    index: 11,
    outcome: 'rejected',
    submission: { who: PAYOUTS, amount: 100n * UNIT },
    decision: { who: PAYOUTS, amount: 100n * UNIT },
  },
  {
    index: 10,
    outcome: 'timedOut',
    submission: { who: TEAM, amount: 100n * UNIT },
    decision: null,
  },
  {
    index: 9,
    outcome: 'cancelled',
    submission: { who: TEAM, amount: 100n * UNIT },
    decision: { who: PAYOUTS, amount: 5_000n * UNIT },
  },
]

/**
 * When each settled referendum finished, which is where a conviction lock counts
 * from. The chain keeps this on the referendum itself.
 */
const SETTLED_AT: Record<number, number> = {
  12: NOW - 5 * DAYS,
  11: NOW - 20 * DAYS,
  10: NOW - 40 * DAYS,
  9: NOW - 8 * DAYS,
}

/** A vote as it was cast. How the referendum went is read back when asked. */
type Cast = Omit<CastVote, 'outcome'>

interface Held {
  amount: bigint
  cast: Cast[]
  prior: { until: number; amount: bigint }
}

const NOTHING_PRIOR = { until: 0, amount: 0n }

export function createMockRepository(): ChainRepository {
  let height = NOW
  const balances = new Map<string, AccountBalance>()
  const listeners = new Map<string, Set<(balance: AccountBalance) => void>>()
  const delegated = new Set<string>()
  let nonce = 0
  const proxies = new Map<string, Proxy[]>()
  const identities = new Map<string, Registration>()
  const subs = new Map<string, SubIdentity>(SEEDED_SUBS)
  /** The chain this pretends to be already carries these, so a reconnect finds them again. */
  const seedIdentities = () => {
    identities.clear()
    for (const [address, held] of SEEDED_IDENTITIES) identities.set(address, held)
  }
  seedIdentities()
  const polls = SEEDED.map((referendum) => ({ ...referendum }))
  const spends = SEEDED_SPENDS.map((spend) => ({ ...spend }))
  const closed = SEEDED_SETTLED.map((entry) => ({ ...entry }))
  const cleared = new Set<string>()
  const schedules = new Map<string, VestingSchedule[]>()
  const rewards = SEEDED_BOUNTIES.map((bounty) => ({ ...bounty }))
  const pieces = SEEDED_CHILDREN.map((child) => ({ ...child }))
  const waiting: Pending[] = []
  const locks = new Map<string, Map<number, Held>>()
  // Nothing here rotates sessions, so whoever joins stays queued
  const sitting = [ALICE]
  const elected = [ALICE]
  let queued: string[] = []
  const stakes = new Map<string, ValidatorLock>()
  const exempted = new Set<string>()
  const keysOf = new Map<string, SessionKeys>()
  const seedValidators = () => {
    queued = []
    stakes.clear()
    stakes.set(ALICE, {
      amount: 0n,
      since: NOW,
      until: NOW + FACTS.validatorLockPeriod,
      status: 'Active',
    })
    exempted.clear()
    exempted.add(ALICE)
    exempted.add(BOB)
    keysOf.clear()
    keysOf.set(ALICE, ALICE_KEYS)
  }
  seedValidators()

  const standingFor = (address: string): Standing => {
    const sub = subs.get(address)
    return {
      own: identities.get(address) ?? null,
      sub: sub ? { ...sub, registration: identities.get(sub.parent) ?? null } : null,
    }
  }

  const recordFor = (address: string): ValidatorRecord => {
    const lock = stakes.get(address)
    return {
      lock: lock ? { ...lock } : null,
      exempt: exempted.has(address),
      // Nobody is ever kicked here
      cooldown: null,
      keys: keysOf.get(address) ?? null,
      heartbeat: sitting.includes(address) ? true : null,
    }
  }

  const poll = (index: number) => polls.find((referendum) => referendum.index === index)

  const piece = (parent: number, index: number) => {
    const found = pieces.find((child) => child.parent === parent && child.index === index)
    if (!found) throw new Error('Bounties: InvalidIndex')
    return found
  }

  const reward = (index: number) => {
    const found = rewards.find((bounty) => bounty.index === index)
    if (!found) throw new Error('Bounties: InvalidIndex')
    return found
  }

  const lockedBy = (address: string) => {
    const held = locks.get(address) ?? new Map<number, Held>()
    locks.set(address, held)
    return held
  }

  const outcomeOf = (index: number): PollOutcome => {
    if (poll(index)) return { kind: 'running' }
    const settled = closed.find((entry) => entry.index === index)
    const at = SETTLED_AT[index]
    if (!settled || at === undefined) return { kind: 'void' }
    if (settled.outcome === 'approved') return { kind: 'ended', approved: true, at }
    if (settled.outcome === 'rejected') return { kind: 'ended', approved: false, at }
    return { kind: 'void' }
  }

  const withOutcome = (entry: Cast): CastVote => ({ ...entry, outcome: outcomeOf(entry.poll) })

  /** update_lock, which is the only thing that ever moves the number on the account. */
  const relock = (address: string, track: number) => {
    const held = lockedBy(address).get(track)
    if (!held) return
    const prior = held.prior.until > height ? held.prior : NOTHING_PRIOR
    const need = held.cast.reduce(
      (most, entry) => (entry.amount > most ? entry.amount : most),
      prior.amount,
    )
    if (need === 0n) lockedBy(address).delete(track)
    else lockedBy(address).set(track, { ...held, amount: need, prior })
  }

  const read = (address: string): AccountBalance => {
    const known = balances.get(address)
    if (known) return known
    const seeded = seedBalance(address)
    balances.set(address, seeded)
    return seeded
  }

  const write = (address: string, free: bigint) => {
    const current = read(address)
    const next: AccountBalance = {
      ...current,
      free,
      transferable: transferableOf(free, current.reserved, current.frozen, FACTS.existentialDeposit),
    }
    balances.set(address, next)
    for (const notify of listeners.get(address) ?? []) notify(next)
  }

  /** One schedule on the first account the tab ever looked at, and none anywhere else. */
  const vestingOf = (address: string): VestingSchedule[] => {
    const known = schedules.get(address)
    if (known) return known
    const [first] = [...balances.keys()]
    const seeded =
      address === first
        ? [{ locked: 60_000n * UNIT, perBlock: UNIT, startingBlock: height - 20_000 }]
        : []
    schedules.set(address, seeded)
    return seeded
  }

  const vest = (address: string) => {
    const held = vestingOf(address)
    if (held.length === 0) throw new Error('Vesting: NotVesting')
    schedules.set(address, [])
    write(address, read(address).free + releasable(held, height))
  }

  /**
   * What a call does to the invented chain, with none of the walk it takes to
   * get there. batch_all is atomic on a real chain. This is not one, so a call
   * that throws part way leaves whatever ran before it standing.
   */
  const apply = async (account: WalletAccount, operation: Operation) => {
    const from = read(account.address)

    switch (operation.kind) {
      case 'transfer': {
        if (from.transferable < operation.amount + FEE) throw new Error('Token: FundsUnavailable')
        write(account.address, from.free - operation.amount - FEE)
        write(operation.to, read(operation.to).free + operation.amount)
        return
      }
      case 'transferAll': {
        if (from.transferable <= FEE) throw new Error('Token: FundsUnavailable')
        write(account.address, from.free - from.transferable)
        write(operation.to, read(operation.to).free + from.transferable - FEE)
        return
      }
      // Delegations are only remembered so that taking one back can fail the
      // way the chain fails it, with nothing there to take
      case 'delegate': {
        delegated.add(`${account.address}:${operation.delegation.track}`)
        return
      }
      case 'undelegate': {
        if (!delegated.delete(`${account.address}:${operation.track}`)) {
          throw new Error('ConvictionVoting: NotDelegating')
        }
        return
      }
      case 'addProxy': {
        const held = proxies.get(account.address) ?? []
        if (held.some((proxy) => same(proxy, operation.proxy))) {
          throw new Error('Proxy: Duplicate')
        }
        proxies.set(account.address, [...held, operation.proxy])
        return
      }
      case 'removeProxy': {
        const held = proxies.get(account.address) ?? []
        const rest = held.filter((proxy) => !same(proxy, operation.proxy))
        if (rest.length === held.length) throw new Error('Proxy: NotFound')
        proxies.set(account.address, rest)
        return
      }
      /**
       * Changing the identity drops the verdicts a registrar can no longer
       * stand behind. A paid request and a rejection stick, which is what the
       * chain calls sticky, so somebody who edits without asking again is
       * still in the queue they were already in.
       */
      case 'registerIdentity': {
        const { registrar, pay } = operation
        const seat = registrar ? REGISTRARS.find((entry) => entry.index === registrar.index) : null
        if (registrar && !seat) throw new Error('Identity: EmptyIndex')
        const held = identities.get(account.address)
        const sticky = (held?.judgements ?? []).filter(
          (verdict) => verdict.judgement === 'FeePaid' || verdict.judgement === 'Erroneous',
        )
        // A paid record is judged moments later by the site's judge, so the
        // mock skips the wait and hands the verdict straight back
        const judgements = pay
          ? [
              ...sticky.filter((verdict) => verdict.registrar !== 0),
              { registrar: 0, judgement: 'Reasonable' as const },
            ]
          : seat
            ? [
                ...sticky.filter((verdict) => verdict.registrar !== seat.index),
                { registrar: seat.index, judgement: 'FeePaid' as const, fee: seat.fee },
              ]
            : sticky
        identities.set(account.address, {
          info: operation.info,
          judgements,
          deposit: depositFor(operation.info, FACTS.identityBasicDeposit, FACTS.identityByteDeposit),
        })
        return
      }
      case 'clearIdentity': {
        if (!identities.delete(account.address)) throw new Error('Identity: NoIdentity')
        return
      }
      case 'requestJudgement': {
        const held = identities.get(account.address)
        if (!held) throw new Error('Identity: NoIdentity')
        const registrar = REGISTRARS.find((entry) => entry.index === operation.registrar)
        if (!registrar) throw new Error('Identity: EmptyIndex')
        if (registrar.fee > operation.maxFee) throw new Error('Identity: FeeChanged')
        identities.set(account.address, {
          ...held,
          judgements: [{ registrar: operation.registrar, judgement: 'FeePaid', fee: registrar.fee }],
        })
        return
      }
      case 'provideJudgement': {
        const held = identities.get(operation.target)
        if (!held) throw new Error('Identity: InvalidTarget')
        // One verdict per registrar, and a new one takes the place of whatever
        // that registrar said before, paid request included
        const rest = held.judgements.filter(
          (verdict) => verdict.registrar !== operation.registrar,
        )
        identities.set(operation.target, {
          ...held,
          judgements: [...rest, { registrar: operation.registrar, judgement: operation.judgement }],
        })
        return
      }
      case 'setFee': {
        const seat = REGISTRARS.find((entry) => entry.index === operation.registrar)
        if (!seat || seat.account !== account.address) throw new Error('Identity: InvalidIndex')
        seat.fee = operation.fee
        return
      }
      case 'setKeys': {
        keysOf.set(account.address, splitKeys(operation.keys))
        return
      }
      case 'lockStake': {
        const who = account.address
        if (elected.includes(who) || queued.includes(who)) {
          throw new Error('Validator: AlreadyValidator')
        }
        if (elected.length + queued.length >= FACTS.maxValidators) {
          throw new Error('Validator: TooManyValidators')
        }
        if (!keysOf.has(who)) throw new Error('Validator: SessionKeysNotRegistered')
        if (!isQualified(standingFor(who))) throw new Error('Validator: IdentityNotQualified')

        const { amount, until } = stakeFor(
          recordFor(who),
          FACTS.validatorStake,
          height,
          FACTS.validatorLockPeriod,
        )
        if (from.free < amount) throw new Error('Validator: InsufficientBalance')
        queued.push(who)
        stakes.set(who, { amount, since: height, until, status: 'Active' })
        return
      }
      case 'requestExit': {
        const lock = stakes.get(account.address)
        if (!lock) throw new Error('Validator: NotValidator')
        if (lock.status !== 'Active') throw new Error('Validator: InvalidStatus')
        stakes.set(account.address, { ...lock, status: 'ExitRequested' })
        queued = queued.filter((who) => who !== account.address)
        return
      }
      case 'cancelJudgement': {
        const held = identities.get(account.address)
        const rest = held?.judgements.filter(
          (verdict) => verdict.registrar !== operation.registrar,
        )
        if (!held || rest?.length === held.judgements.length) {
          throw new Error('Identity: NotFound')
        }
        identities.set(account.address, { ...held, judgements: rest ?? [] })
        return
      }
      case 'vote': {
        const target = poll(operation.poll)
        if (!target) throw new Error('ConvictionVoting: NotOngoing')
        const weight = BigInt(operation.ballot.kind === 'abstain' ? 0 : 1)
        if (operation.ballot.kind === 'aye') target.tally.ayes += operation.ballot.amount * weight
        if (operation.ballot.kind === 'nay') target.tally.nays += operation.ballot.amount * weight
        target.tally.support += operation.ballot.amount
        const standing = lockedBy(account.address).get(target.track)
        const cast: Cast = {
          poll: operation.poll,
          side: operation.ballot.kind,
          conviction: operation.ballot.kind === 'abstain' ? 'None' : operation.ballot.conviction,
          amount: operation.ballot.amount,
        }
        const kept = (standing?.cast ?? []).filter((entry) => entry.poll !== operation.poll)
        lockedBy(account.address).set(target.track, {
          amount: 0n,
          cast: [...kept, cast],
          prior: standing?.prior ?? NOTHING_PRIOR,
        })
        relock(account.address, target.track)
        return
      }
      case 'removeVote': {
        const held = lockedBy(account.address).get(operation.track)
        const gone = held?.cast.find((entry) => entry.poll === operation.poll)
        if (!held || !gone) throw new Error('ConvictionVoting: NotVoter')
        // The vote goes, and what its conviction still holds moves into the prior span
        const release = releaseOf(withOutcome(gone), FACTS.voteLockingPeriod, height)
        lockedBy(account.address).set(operation.track, {
          ...held,
          cast: held.cast.filter((entry) => entry.poll !== operation.poll),
          prior:
            release.kind === 'held'
              ? {
                  until: Math.max(held.prior.until, release.until),
                  amount: held.prior.amount > gone.amount ? held.prior.amount : gone.amount,
                }
              : held.prior,
        })
        return
      }
      case 'unlock': {
        // The chain never refuses this. update_lock frees whatever is free,
        // which is nothing at all while a vote or a conviction still holds it
        relock(operation.target, operation.track)
        return
      }
      case 'decisionDeposit': {
        const target = poll(operation.poll)
        if (!target) throw new Error('Referenda: BadReferendum')
        if (target.decisionDeposit !== null) throw new Error('Referenda: HasDeposit')
        target.decisionDeposit = TRACKS.find((t) => t.id === target.track)?.decisionDeposit ?? 0n
        target.state = 'deciding'
        target.deciding = { since: height, confirming: null }
        return
      }
      case 'payout': {
        const spend = spends.find((entry) => entry.index === operation.spend)
        if (!spend) throw new Error('Treasury: InvalidIndex')
        if (height < spend.validFrom) throw new Error('Treasury: EarlyPayout')
        if (height >= spend.expireAt) throw new Error('Treasury: SpendExpired')
        if (spend.paid) throw new Error('Treasury: AlreadyAttempted')
        spend.paid = true
        write(spend.beneficiary, read(spend.beneficiary).free + spend.amount)
        return
      }
      case 'unnotePreimage': {
        if (cleared.has(account.address)) throw new Error('Preimage: NotNoted')
        cleared.add(account.address)
        write(account.address, read(account.address).free + PREIMAGE_DEPOSIT)
        return
      }
      case 'editMetadata': {
        const entry = poll(operation.poll)
        if (!entry) throw new Error('Referenda: NotOngoing')
        if (entry.submitter !== account.address) throw new Error('Referenda: NoPermission')
        Object.assign(entry, readMeta(metadataDump(operation.title, operation.description)))
        return
      }
      case 'proposeBounty': {
        rewards.unshift({
          index: rewards.length,
          description: operation.description,
          proposer: account.address,
          value: operation.value,
          fee: 0n,
          bond: 10n * UNIT,
          curatorDeposit: 0n,
          state: 'proposed',
          curator: null,
          beneficiary: null,
          until: null,
        })
        return
      }
      case 'acceptCurator': {
        const bounty = reward(operation.bounty)
        if (bounty.state !== 'curatorProposed') throw new Error('Bounties: UnexpectedStatus')
        bounty.state = 'active'
        bounty.until = height + 30 * DAYS
        return
      }
      case 'awardBounty': {
        const bounty = reward(operation.bounty)
        if (bounty.state !== 'active') throw new Error('Bounties: UnexpectedStatus')
        bounty.state = 'pendingPayout'
        bounty.beneficiary = operation.beneficiary
        bounty.until = height + DAYS
        return
      }
      case 'claimBounty': {
        const bounty = reward(operation.bounty)
        if (bounty.state !== 'pendingPayout') throw new Error('Bounties: UnexpectedStatus')
        if (height < (bounty.until ?? 0)) throw new Error('Bounties: Premature')
        write(bounty.beneficiary!, read(bounty.beneficiary!).free + bounty.value - bounty.fee)
        rewards.splice(rewards.indexOf(bounty), 1)
        return
      }
      case 'unassignCurator': {
        const bounty = reward(operation.bounty)
        bounty.state = 'funded'
        bounty.curator = null
        bounty.until = null
        return
      }
      case 'extendBounty': {
        const bounty = reward(operation.bounty)
        if (bounty.state !== 'active') throw new Error('Bounties: UnexpectedStatus')
        bounty.until = height + 30 * DAYS
        return
      }
      case 'addChild': {
        pieces.unshift({
          parent: operation.bounty,
          index: pieces.length,
          description: operation.description,
          value: operation.value,
          fee: 0n,
          curatorDeposit: 0n,
          state: 'added',
          curator: null,
          beneficiary: null,
          until: null,
        })
        return
      }
      case 'proposeChildCurator': {
        const child = piece(operation.bounty, operation.child)
        child.state = 'curatorProposed'
        child.curator = operation.curator
        child.fee = operation.fee
        return
      }
      case 'acceptChildCurator': {
        const child = piece(operation.bounty, operation.child)
        if (child.state !== 'curatorProposed') throw new Error('Bounties: UnexpectedStatus')
        child.state = 'active'
        return
      }
      case 'awardChild': {
        const child = piece(operation.bounty, operation.child)
        if (child.state !== 'active') throw new Error('Bounties: UnexpectedStatus')
        child.state = 'pendingPayout'
        child.beneficiary = operation.beneficiary
        child.until = height + DAYS
        return
      }
      case 'claimChild': {
        const child = piece(operation.bounty, operation.child)
        if (child.state !== 'pendingPayout') throw new Error('Bounties: UnexpectedStatus')
        if (height < (child.until ?? 0)) throw new Error('Bounties: Premature')
        write(child.beneficiary!, read(child.beneficiary!).free + child.value - child.fee)
        pieces.splice(pieces.indexOf(child), 1)
        return
      }
      case 'unassignChildCurator': {
        const child = piece(operation.bounty, operation.child)
        child.state = 'added'
        child.curator = null
        return
      }
      case 'closeChild': {
        const child = piece(operation.bounty, operation.child)
        if (child.state === 'pendingPayout') throw new Error('Bounties: PendingPayout')
        pieces.splice(pieces.indexOf(child), 1)
        return
      }
      case 'vest': {
        vest(account.address)
        return
      }
      case 'vestOther': {
        vest(operation.target)
        return
      }
      case 'vestedTransfer': {
        const { locked } = operation.schedule
        const held = vestingOf(operation.to)
        if (from.transferable < locked + FEE) throw new Error('Token: FundsUnavailable')
        write(account.address, from.free - locked - FEE)
        write(operation.to, read(operation.to).free + locked)
        schedules.set(operation.to, [...held, operation.schedule])
        return
      }
      case 'setSubs': {
        for (const [sub, held] of [...subs.entries()]) {
          if (held.parent === account.address) subs.delete(sub)
        }
        for (const sub of operation.subs) {
          subs.set(sub.address, { name: sub.name, parent: account.address, registration: null })
        }
        return
      }
      case 'quitSub': {
        if (!subs.delete(account.address)) throw new Error('Identity: NotSub')
        return
      }
      case 'batch': {
        for (const call of operation.calls) await apply(account, call)
        return
      }
      case 'asProxy': {
        const held = proxies.get(operation.real) ?? []
        if (!held.some((entry) => entry.delegate === account.address)) {
          throw new Error('Proxy: NotProxy')
        }
        // The call runs as the account being acted for, not as the signer
        await apply({ ...account, address: operation.real }, operation.call)
        return
      }
      case 'multisigApproveData':
        // The bytes are the call, so the mock reads them back into one and
        // takes the same path a call it built itself would take
        await apply(account, {
          kind: 'multisigApprove',
          threshold: operation.threshold,
          others: operation.others,
          multisig: operation.multisig,
          call: decodeCall(operation.hex),
        })
        return
      case 'multisigApprove': {
        // The address the chain would read off the set, which is the one the
        // wallet already derived when the account was added
        const signatories = [...operation.others, account.address].sort()
        const multisig = encodeMultiAddress(signatories, operation.threshold, SS58_PREFIX)
        const callHash = callHashOf(operation.call)
        const held = waiting.find(
          (entry) => entry.multisig === multisig && entry.callHash === callHash,
        )

        if (!held) {
          waiting.push({
            multisig,
            callHash,
            when: { height, index: (nonce += 1) },
            deposit: UNIT,
            depositor: account.address,
            approvals: [account.address],
          })
        } else if (held.approvals.includes(account.address)) {
          throw new Error('Multisig: AlreadyApproved')
        } else {
          held.approvals.push(account.address)
          if (held.approvals.length >= operation.threshold) {
            waiting.splice(waiting.indexOf(held), 1)
            // The call runs as the multisig, not as whoever put the last
            // signature on it, which is the whole point of the account
            await apply({ ...account, address: multisig }, operation.call)
          }
        }

        return
      }
      case 'multisigCancel': {
        const held = waiting.find(
          (entry) => entry.multisig === operation.multisig && entry.callHash === operation.callHash,
        )
        if (!held) throw new Error('Multisig: NotFound')
        if (held.depositor !== account.address) throw new Error('Multisig: NotOwner')
        waiting.splice(waiting.indexOf(held), 1)
        return
      }
      case 'refundSubmission': {
        const entry = closed.find((held) => held.index === operation.poll)
        if (!entry) throw new Error('Referenda: BadReferendum')
        if (!refundsSubmission(entry)) throw new Error('Referenda: BadStatus')
        if (!entry.submission) throw new Error('Referenda: NoDeposit')
        write(entry.submission.who, read(entry.submission.who).free + entry.submission.amount)
        entry.submission = null
        return
      }
      case 'refundDecision': {
        const entry = closed.find((held) => held.index === operation.poll)
        if (!entry) throw new Error('Referenda: BadReferendum')
        if (!entry.decision) throw new Error('Referenda: NoDeposit')
        write(entry.decision.who, read(entry.decision.who).free + entry.decision.amount)
        entry.decision = null
        return
      }
      case 'propose': {
        if (!TRACKS.some((entry) => entry.id === operation.track))
          throw new Error('Referenda: NoTrack')
        polls.push({
          index: polls.length,
          track: operation.track,
          ...readMeta(metadataDump(operation.title, operation.description)),
          submitter: account.address,
          metadataHash: receipt(`meta ${polls.length}`),
          state: 'preparing',
          tally: { ayes: 0n, nays: 0n, support: 0n },
          proposal: proposalOf(operation.motion),
          decisionDeposit: null,
          submitted: height,
          deciding: null,
        })
        return
      }
    }
  }

  return {
    async facts(): Promise<ChainFacts> {
      return FACTS
    },

    // Invented like everything else here, and steady so it reads as a stub
    async reach(): Promise<Reach> {
      return { ms: 24, peers: 3, syncing: false }
    },

    subscribeHead(onHead: (head: ChainHead) => void): Unsubscribe {
      const emit = () =>
        onHead({ number: height, hash: `0x${height.toString(16).padStart(64, '0')}` })
      emit()
      const tick = setInterval(() => {
        height += 1
        emit()
      }, 9_000)
      return () => clearInterval(tick)
    },

    subscribeBalance(address, onBalance): Unsubscribe {
      const set = listeners.get(address) ?? new Set()
      listeners.set(address, set)
      set.add(onBalance)
      onBalance(read(address))
      return () => set.delete(onBalance)
    },

    async proxies(address: string): Promise<Proxy[]> {
      return proxies.get(address) ?? []
    },

    async childBounties(): Promise<ChildBounty[]> {
      return pieces.map((child) => ({ ...child }))
    },

    async bounties(): Promise<Bounty[]> {
      return rewards.map((bounty) => ({ ...bounty }))
    },

    async vesting(address: string): Promise<VestingSchedule[]> {
      return vestingOf(address)
    },

    async subsOf(address: string): Promise<Subs> {
      const list = [...subs.entries()]
        .filter(([, sub]) => sub.parent === address)
        .map(([sub, held]) => ({ address: sub, name: held.name }))
      return { deposit: BigInt(list.length) * FACTS.subAccountDeposit, list }
    },

    async standingOf(address: string): Promise<Standing> {
      return standingFor(address)
    },

    async registrars(): Promise<Registrar[]> {
      // Copies, since setFee writes the list and the query would otherwise be
      // handed the very objects it already caches
      return REGISTRARS.map((entry) => ({ ...entry }))
    },

    async usernameAuthorities(): Promise<UsernameAuthority[]> {
      return SEEDED_AUTHORITIES.map((entry) => ({ ...entry }))
    },

    async tracks(): Promise<Track[]> {
      return TRACKS
    },

    // Copies, because a real read decodes fresh objects every time and the query
    // cache keeps the old reference when the new one is the very same object
    async referenda(): Promise<Referendum[]> {
      return polls.map((referendum) => ({
        ...referendum,
        tally: { ...referendum.tally },
        proposal: { ...referendum.proposal },
      }))
    },

    async spends(): Promise<Spend[]> {
      return spends.map((spend) => ({ ...spend }))
    },

    /**
     * A real one only turns up after this account has opened a referendum, and
     * nothing here can clear the identity gate that takes, so the first account
     * asking is handed one to reclaim.
     */
    async preimages(owners: string[]): Promise<NotedPreimage[]> {
      const [first] = owners
      if (!first || cleared.has(first)) return []
      return [
        {
          hash: receipt(`preimage ${first}`),
          who: first,
          len: PREIMAGE_LEN,
          amount: PREIMAGE_DEPOSIT,
        },
      ]
    },

    async pending(multisigs: string[]): Promise<Pending[]> {
      const wanted = new Set(multisigs)
      return waiting.filter((entry) => wanted.has(entry.multisig)).map((entry) => ({ ...entry }))
    },

    async callData(operation: Operation) {
      // No metadata to file a call under, so the kind stands in for the name
      // and the operation's own fields for the arguments, the way readCall
      // already has it
      return {
        name: operation.kind,
        args: callArgs(operation),
        hex: encodeCall(operation),
        hash: callHashOf(operation),
      }
    },

    async readCall(hex: string): Promise<ReadCall> {
      if (!/^0x([0-9a-f]{2})+$/i.test(hex.trim())) throw new Error('Call data is a 0x hex string')

      let operation: Operation
      try {
        operation = decodeCall(hex.trim())
      } catch {
        throw new Error('Not a call this chain knows')
      }
      return {
        hash: callHashOf(operation),
        operation,
        label: operation.kind,
        args: callArgs(operation),
      }
    },

    async settled(): Promise<Settled[]> {
      return closed.filter(hasRefund).map((entry) => ({ ...entry }))
    },

    async locks(address: string): Promise<ClassLock[]> {
      return [...(locks.get(address) ?? new Map<number, Held>())].map(([track, held]) => ({
        track,
        amount: held.amount,
        votes: held.cast.map(withOutcome),
        prior: { ...held.prior },
      }))
    },

    async activeIssuance(): Promise<bigint> {
      return ACTIVE_ISSUANCE
    },

    async validators(): Promise<ValidatorSet> {
      return { sitting: [...sitting], elected: [...elected], queued: [...queued] }
    },

    async validatorOf(address: string): Promise<ValidatorRecord> {
      return recordFor(address)
    },

    async readKeys(hex: string): Promise<SessionKeys> {
      return splitKeys(hex)
    },

    async estimateFee() {
      return FEE
    },

    async submit(
      account,
      operation: Operation,
      onProgress?: (progress: TxProgress) => void,
    ): Promise<string> {
      // The same walk a real one takes, so the UI has something to show
      const hash = receipt(`${account.address}:${operation.kind}:${(nonce += 1)}`)
      for (const stage of ['signed', 'broadcast', 'inBlock'] as const) {
        await new Promise((resolve) => setTimeout(resolve, 250))
        onProgress?.({ stage, hash })
      }

      await apply(account, operation)
      onProgress?.({ stage: 'finalized', hash })
      return hash
    },

    disconnect() {
      listeners.clear()
      delegated.clear()
      proxies.clear()
      seedIdentities()
      locks.clear()
      seedValidators()
    },
  }
}
