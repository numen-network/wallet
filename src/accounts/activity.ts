import { trackLabel, type Track } from '@/chain/governance'
import { IDENTITY_FIELDS, LABELS, type IdentityInfo } from '@/chain/identity'
import { CONVICTIONS, type Conviction, type Operation, type TxStage } from '@/chain/types'
import { endsAt, perDay } from '@/chain/vesting'
import { shorten } from '@/lib/address'
import { formatAmount } from '@/lib/balance'

/** How far a call got, for a log of calls that are over. */
export const STAGES: Record<TxStage, string> = {
  signed: 'signed',
  broadcast: 'sent to the network',
  inBlock: 'in a block',
  finalized: 'final',
}

/** The same walk while it is still being walked. */
export const WORKING: Record<TxStage, string> = {
  signed: 'Signing',
  broadcast: 'Broadcasting',
  inBlock: 'Being included',
  finalized: 'Done',
}

/** What to say once the chain has settled it, since each call ends differently. */
export const SETTLED: Record<Operation['kind'], string> = {
  transfer: 'Transfer confirmed',
  transferAll: 'Transfer confirmed',
  delegate: 'Votes delegated',
  undelegate: 'Delegation ended',
  addProxy: 'Proxy added',
  removeProxy: 'Proxy removed',
  registerIdentity: 'Identity registered',
  clearIdentity: 'Identity cleared',
  requestJudgement: 'Registrar asked',
  provideJudgement: 'Judgement recorded',
  cancelJudgement: 'Request withdrawn',
  setFee: 'Judgement fee set',
  vote: 'Vote counted',
  removeVote: 'Vote taken back',
  unlock: 'Balance unlocked',
  decisionDeposit: 'Decision deposit placed',
  payout: 'Treasury spend paid',
  refundSubmission: 'Submission deposit returned',
  refundDecision: 'Decision deposit returned',
  unnotePreimage: 'Preimage cleared',
  multisigApprove: 'Signature added',
  multisigApproveData: 'Signature added',
  multisigCancel: 'Multisig call called off',
  asProxy: 'Sent as the proxied account',
  setSubs: 'Sub accounts saved',
  quitSub: 'Parent identity rejected',
  vest: 'Vested balance released',
  vestedTransfer: 'Vesting schedule granted',
  proposeBounty: 'Bounty proposed',
  acceptCurator: 'Curator role accepted',
  awardBounty: 'Bounty awarded',
  claimBounty: 'Bounty paid out',
  unassignCurator: 'Curator stood down',
  extendBounty: 'Bounty expiry extended',
  addChild: 'Child bounty added',
  proposeChildCurator: 'Child curator asked',
  acceptChildCurator: 'Child curator role accepted',
  awardChild: 'Child bounty awarded',
  claimChild: 'Child bounty paid out',
  unassignChildCurator: 'Child curator stood down',
  closeChild: 'Child bounty closed',
  propose: 'Referendum opened',
  batch: 'All of it went through',
}

/** What this tab has sent, as a heading and the lines under it. */
export interface DescribeOptions {
  /**
   * Addresses in full rather than shortened. What is about to be signed has to
   * be checked against something, and two addresses that share a head and a
   * tail are cheap to come by.
   */
  whole?: boolean
  /**
   * Target seconds per block, which a vesting rate needs before it can be
   * quoted per day. Without it the rate is left out rather than guessed.
   */
  blockSeconds?: number
}

/**
 * A call written out argument by argument, which is how the chain holds one and
 * how anything that reads a call it was handed has to show it. The same shape
 * as ChainRepository's ReadCall args, so one component draws either.
 */
export interface CallField {
  name: string
  value: string
}

export interface Described {
  title: string
  fields: CallField[]
}

/** Field order is the order it is written in, which is the order it reads in. */
const row = (fields: Record<string, string>): CallField[] =>
  Object.entries(fields).map(([name, value]) => ({ name, value }))

/** A call folded onto one line, for a batch that would otherwise nest a table. */
const line = (part: Described) => part.fields.map((field) => field.value).join(', ')

const held = (conviction: Conviction) =>
  CONVICTIONS.find((entry) => entry.value === conviction)?.weight ?? conviction

export function describe(
  operation: Operation,
  symbol: string,
  tracks?: Track[],
  options: DescribeOptions = {},
): Described {
  const named = (id: number) => trackLabel(tracks, id)
  const amount = (planck: bigint) => `${formatAmount(planck, { precision: 4 })} ${symbol}`
  const who = (address: string) => (options.whole ? address : shorten(address))

  // How many of the set have to sign. This tab has no idea how many already
  // have, and a bare ratio here reads as though it did
  const signatures = (threshold: number, others: string[]) =>
    `any ${threshold} of ${others.length + 1}`

  switch (operation.kind) {
    case 'transfer':
      return {
        title: 'Transfer',
        fields: row({ amount: amount(operation.amount), to: who(operation.to) }),
      }
    case 'transferAll':
      return {
        title: 'Transfer all',
        fields: row({ amount: 'everything', to: who(operation.to) }),
      }
    case 'delegate':
      return {
        title: 'Delegate votes',
        fields: row({
          track: named(operation.delegation.track),
          to: who(operation.delegation.to),
          amount: amount(operation.delegation.amount),
          conviction: held(operation.delegation.conviction),
        }),
      }
    case 'undelegate':
      return { title: 'Take a delegation back', fields: row({ track: named(operation.track) }) }
    case 'addProxy':
      return {
        title: 'Add proxy',
        fields: row({ type: operation.proxy.type, to: who(operation.proxy.delegate) }),
      }
    case 'removeProxy':
      return {
        title: 'Remove proxy',
        fields: row({ type: operation.proxy.type, to: who(operation.proxy.delegate) }),
      }
    case 'registerIdentity':
      return {
        title: 'Set identity',
        fields: row(
          operation.pay
            ? {
                'filled in': filled(operation.info),
                'checked for': amount(operation.pay.amount),
                'paid to': who(operation.pay.to),
              }
            : operation.registrar === null
              ? { 'filled in': filled(operation.info) }
              : {
                  'filled in': filled(operation.info),
                  registrar: String(operation.registrar.index),
                  'max fee': amount(operation.registrar.maxFee),
                },
        ),
      }
    case 'setSubs':
      // A row apiece, since what a sub is called and where it lives is the
      // whole of what this call carries
      return {
        title: 'Set the sub accounts',
        fields:
          operation.subs.length === 0
            ? row({ subs: 'none' })
            : operation.subs.map((sub) => ({ name: sub.name || 'no name', value: who(sub.address) })),
      }
    case 'proposeBounty':
      return {
        title: 'Propose a bounty',
        fields: row({ amount: amount(operation.value), for: operation.description }),
      }
    case 'acceptCurator':
      return { title: 'Take on a bounty', fields: row({ bounty: String(operation.bounty) }) }
    case 'awardBounty':
      return {
        title: 'Award a bounty',
        fields: row({ bounty: String(operation.bounty), to: who(operation.beneficiary) }),
      }
    case 'claimBounty':
      return { title: 'Claim a bounty', fields: row({ bounty: String(operation.bounty) }) }
    case 'unassignCurator':
      return { title: 'Stand down as curator', fields: row({ bounty: String(operation.bounty) }) }
    case 'extendBounty':
      return { title: 'Extend a bounty', fields: row({ bounty: String(operation.bounty) }) }
    case 'addChild':
      return {
        title: 'Add a child bounty',
        fields: row({ 'out of bounty': String(operation.bounty), amount: amount(operation.value) }),
      }
    case 'proposeChildCurator':
      return {
        title: 'Ask somebody to curate a child bounty',
        fields: row({
          bounty: `${operation.bounty}.${operation.child}`,
          curator: who(operation.curator),
          fee: amount(operation.fee),
        }),
      }
    case 'acceptChildCurator':
      return {
        title: 'Take on a child bounty',
        fields: row({ bounty: `${operation.bounty}.${operation.child}` }),
      }
    case 'awardChild':
      return {
        title: 'Award a child bounty',
        fields: row({
          bounty: `${operation.bounty}.${operation.child}`,
          to: who(operation.beneficiary),
        }),
      }
    case 'claimChild':
      return {
        title: 'Claim a child bounty',
        fields: row({ bounty: `${operation.bounty}.${operation.child}` }),
      }
    case 'unassignChildCurator':
      return {
        title: 'Stand down from a child bounty',
        fields: row({ bounty: `${operation.bounty}.${operation.child}` }),
      }
    case 'closeChild':
      return {
        title: 'Close a child bounty',
        fields: row({ bounty: `${operation.bounty}.${operation.child}` }),
      }
    case 'vest':
      return { title: 'Release what has vested', fields: [] }
    case 'vestedTransfer':
      return {
        title: 'Grant a vesting schedule',
        fields: row({
          amount: amount(operation.schedule.locked),
          to: who(operation.to),
          ...(options.blockSeconds === undefined
            ? {}
            : {
                thaws: `${amount(perDay(operation.schedule, options.blockSeconds))} a day`,
              }),
          ends: `block ${endsAt(operation.schedule).toLocaleString('en-US')}`,
        }),
      }
    case 'quitSub':
      return { title: 'Reject the parent identity', fields: [] }
    case 'clearIdentity':
      return { title: 'Clear identity', fields: [] }
    case 'requestJudgement':
      return {
        title: 'Ask a registrar',
        fields: row({
          registrar: String(operation.registrar),
          'max fee': amount(operation.maxFee),
        }),
      }
    case 'provideJudgement':
      return {
        title: 'Judge an identity',
        fields: row({
          registrar: String(operation.registrar),
          target: who(operation.target),
          judgement: operation.judgement,
          'filled in': filled(operation.info),
        }),
      }
    case 'cancelJudgement':
      return { title: 'Withdraw the request', fields: row({ registrar: String(operation.registrar) }) }
    case 'setFee':
      return {
        title: 'Set the judgement fee',
        fields: row({ registrar: String(operation.registrar), fee: amount(operation.fee) }),
      }
    case 'vote':
      return {
        title: `Vote on referendum ${operation.poll}`,
        fields: row(
          operation.ballot.kind === 'abstain'
            ? { vote: 'abstain', amount: amount(operation.ballot.amount) }
            : {
                vote: operation.ballot.kind,
                amount: amount(operation.ballot.amount),
                conviction: held(operation.ballot.conviction),
              },
        ),
      }
    case 'removeVote':
      return {
        title: `Take back the vote on ${operation.poll}`,
        fields: row({ track: named(operation.track) }),
      }
    case 'unlock':
      return {
        title: 'Unlock',
        fields: row({ track: named(operation.track), for: who(operation.target) }),
      }
    case 'decisionDeposit':
      return { title: 'Place the decision deposit', fields: row({ referendum: String(operation.poll) }) }
    case 'payout':
      return { title: 'Pay out a treasury spend', fields: row({ spend: String(operation.spend) }) }
    case 'refundSubmission':
      return {
        title: 'Return the submission deposit',
        fields: row({ referendum: String(operation.poll) }),
      }
    case 'refundDecision':
      return {
        title: 'Return the decision deposit',
        fields: row({ referendum: String(operation.poll) }),
      }
    case 'unnotePreimage':
      return { title: 'Clear a preimage', fields: row({ preimage: operation.hash }) }
    case 'multisigApprove': {
      const inner = describe(operation.call, symbol, tracks, options)
      return {
        title: `Sign ${inner.title.toLowerCase()}`,
        fields: [
          ...inner.fields,
          { name: 'signatures', value: signatures(operation.threshold, operation.others) },
        ],
      }
    }
    case 'multisigApproveData':
      return {
        title: 'Sign a call this multisig has waiting',
        fields: row({
          call: operation.label,
          signatures: signatures(operation.threshold, operation.others),
        }),
      }
    case 'multisigCancel':
      return {
        title: 'Call off a multisig call',
        fields: row({ call: operation.callHash }),
      }
    case 'asProxy': {
      const inner = describe(operation.call, symbol, tracks, options)
      return { title: inner.title, fields: [...inner.fields, { name: 'as', value: who(operation.real) }] }
    }
    case 'propose':
      return {
        title: 'Open a referendum',
        fields: row({
          amount: amount(operation.amount),
          to: who(operation.beneficiary),
          track: named(operation.track),
        }),
      }
    case 'batch': {
      // Every call is written out, since a count says nothing about where the
      // money went. A title carries what its own fields leave out, such as
      // which referendum a vote is on, so calls only let the header speak for
      // them when they all say the same thing
      const parts = operation.calls.map((call) => describe(call, symbol, tracks, options))
      const [first] = parts
      if (!first) return { title: 'Nothing', fields: [] }
      if (parts.length === 1) return first

      const alike = parts.every((part) => part.title === first.title)
      return {
        title: alike ? first.title : `${parts.length} calls`,
        fields: parts.map((part, index) => ({
          name: alike ? String(index + 1) : part.title,
          value: line(part),
        })),
      }
    }
  }
}

const filled = (info: IdentityInfo) =>
  IDENTITY_FIELDS.filter((field) => info[field] !== '')
    .map((field) => LABELS[field])
    .join(', ') || 'nothing'
