import type { ReactNode } from 'react'
import { isHex } from '@polkadot/util'
import { isQualified, shortfall, type Standing } from '@/chain/identity'
import {
  useFacts,
  useHead,
  useReadKeys,
  useStanding,
  useSymbol,
  useValidatorOf,
  useValidators,
} from '@/chain/queries'
import type { AccountBalance, ChainFacts, Operation } from '@/chain/types'
import {
  GATES,
  gatesFor,
  handoverAt,
  nextBoundary,
  stakeFor,
  type Gate,
  type ValidatorLock,
  type ValidatorRecord,
  type ValidatorSet,
} from '@/chain/validator'
import { publicKeyOf } from '@/lib/address'
import { formatAmount } from '@/lib/balance'
import { waitFor, waitToTheMinute } from '@/lib/blocks'
import { Card, CardDescription } from '@/components/ui/card'
import { Empty } from '@/components/ui/empty'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { CopyButton } from '@/ui/CopyButton'
import { Facts } from '@/ui/Facts'
import { Field } from '@/ui/Field'
import { ModalFrame } from '@/ui/Modal'
import { TabBar, TabPanel, Tabs, type TabOption } from '@/ui/Tabs'
import { useDraft } from '@/ui/draft'
import { CallPage, SignerField, useCall, useSigning } from './Authorize'
import type { Account } from './types'

interface ValidatorModalProps {
  account: Account
  balance: AccountBalance | undefined
  signers: Account[]
  onClose: () => void
}

/** Everything a seat is worked out from, once the chain has answered for all of it. */
interface Chain {
  facts: ChainFacts
  set: ValidatorSet
  record: ValidatorRecord
  height: number
}

type Page = 'seat' | 'keys'

const PAGES: TabOption<Page>[] = [
  { id: 'seat', label: 'Seat' },
  { id: 'keys', label: 'Session keys' },
]

const GATE_NAMES: Record<Gate, string> = {
  membership: 'membership',
  seats: 'seats',
  keys: 'session keys',
  identity: 'identity',
  cooldown: 'cooldown',
  balance: 'balance',
}

const WARNING = 'mt-2.5 text-[12.5px] text-destructive'

const coins = (planck: bigint, symbol: string) => `${formatAmount(planck, { precision: 4 })} ${symbol}`

const blockAt = (block: number, height: number, blockSeconds: number | undefined) =>
  `block ${block.toLocaleString('en-US')}${
    blockSeconds && block > height ? `, ${waitToTheMinute(block - height, blockSeconds)}` : ''
  }`

const nextHandover = (chain: Chain, address: string) =>
  handoverAt(
    chain.set,
    address,
    nextBoundary(chain.height, chain.facts.sessionPeriod, chain.facts.sessionOffset),
    chain.facts.sessionPeriod,
  )

export function ValidatorModal(props: ValidatorModalProps) {
  const [draft, patch] = useDraft(`validator:${props.account.address}`, { page: 'seat' as Page })
  const tabs = <TabBar options={PAGES} className="w-fit" />

  return (
    <Tabs value={draft.page} onChange={(page) => patch({ page })}>
      <ModalFrame onClose={props.onClose}>
        <TabPanel value="seat">
          <Seat {...props} tabs={tabs} />
        </TabPanel>
        <TabPanel value="keys">
          <Keys {...props} tabs={tabs} />
        </TabPanel>
      </ModalFrame>
    </Tabs>
  )
}

/** Joins while the account holds no running seat, and leaves once it does. */
function Seat({
  account,
  balance,
  signers,
  tabs,
  onClose,
}: ValidatorModalProps & { tabs: ReactNode }) {
  const { data: facts } = useFacts()
  const { data: set } = useValidators()
  const { data: record } = useValidatorOf(account.address)
  const { data: standing } = useStanding(account.address)
  const head = useHead()
  const call = useCall(onClose)
  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)

  const chain = facts && set && record && head ? { facts, set, record, height: head.number } : null
  const lock = record?.lock?.status === 'Active' ? record.lock : null
  const join =
    chain && !lock && standing && balance
      ? joinOf(chain, account.address, standing, balance.free)
      : null
  const blocked = lock ? !chain : !join || GATES.some((gate) => !join.passes[gate])
  const operation: Operation = lock ? { kind: 'requestExit' } : { kind: 'lockStake' }

  return (
    <CallPage
      title="Validator seat"
      submitLabel={lock ? 'Leave the set' : 'Join the set'}
      danger={lock !== null}
      busy={call.busy}
      disabled={blocked}
      aside={tabs}
      from={signer.address}
      needsPassword={needsPassword}
      operation={blocked ? null : wrap(operation)}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={() => call.run(submit(operation, call.password))}
    >
      {lock && chain ? (
        <Leaving chain={chain} address={account.address} lock={lock} />
      ) : join && chain ? (
        <Joining chain={chain} address={account.address} {...join} />
      ) : (
        <Empty className="mt-0 p-6">Reading the chain…</Empty>
      )}
      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />
    </CallPage>
  )
}

function joinOf(chain: Chain, address: string, standing: Standing, free: bigint) {
  const { facts, set, record, height } = chain
  const stake = stakeFor(record, facts.validatorStake, height, facts.validatorLockPeriod)
  const passes = gatesFor({
    address,
    set,
    record,
    qualified: isQualified(standing),
    free,
    amount: stake.amount,
    height,
    maxValidators: facts.maxValidators,
  })
  return { standing, free, stake, passes }
}

function Leaving({ chain, address, lock }: { chain: Chain; address: string; lock: ValidatorLock }) {
  const symbol = useSymbol()
  const { facts, record, height } = chain
  const at = (block: number) => blockAt(block, height, facts.blockSeconds)
  const ends = nextHandover(chain, address)
  const staked = lock.amount > 0n
  const heartbeat =
    record.heartbeat === null
      ? []
      : [
          {
            name: 'heartbeat',
            value: record.heartbeat ? 'received this session' : 'none yet this session',
            bad: !record.heartbeat,
          },
        ]

  return (
    <>
      <Card variant="muted" size="sm">
        <Facts
          rows={[
            { name: 'stake', value: staked ? `${coins(lock.amount, symbol)} locked` : 'none locked' },
            ...heartbeat,
            { name: 'leaving takes effect', value: ends === null ? 'at once' : at(ends) },
            ...(staked ? [{ name: 'unlocks', value: at(lock.until) }] : []),
          ]}
        />
      </Card>
      {staked && (
        <p className={WARNING}>
          Nothing unlocks the stake before {at(lock.until)}. Joining again before then locks it for{' '}
          {waitFor(facts.validatorLockPeriod, facts.blockSeconds)} from that day.
        </p>
      )}
    </>
  )
}

function Joining({
  chain,
  address,
  standing,
  free,
  stake,
  passes,
}: { chain: Chain; address: string } & ReturnType<typeof joinOf>) {
  const symbol = useSymbol()
  const { facts, set, record, height } = chain
  const at = (block: number) => blockAt(block, height, facts.blockSeconds)
  const votesFrom = nextBoundary(height, facts.sessionPeriod, facts.sessionOffset) + facts.sessionPeriod
  const taken = set.elected.length + set.queued.length

  const says: Record<Gate, string> = {
    membership: passes.membership
      ? 'not in the set'
      : set.queued.includes(address)
        ? 'already queued'
        : 'already in the set',
    seats: `${taken.toLocaleString('en-US')} of ${facts.maxValidators.toLocaleString('en-US')} taken`,
    keys: passes.keys ? 'registered' : 'none, set them under Session keys',
    identity: passes.identity
      ? 'clears the standard'
      : (shortfall(standing) ?? 'does not clear the standard'),
    cooldown: record.cooldown === null || passes.cooldown ? 'none' : `through ${at(record.cooldown)}`,
    balance: passes.balance
      ? `${coins(free, symbol)} free`
      : `${coins(free, symbol)} free, ${coins(stake.amount, symbol)} needed`,
  }

  return (
    <>
      <Card variant="muted" size="sm">
        <Facts
          rows={[
            { name: 'stake', value: record.exempt ? 'exempt' : 'non-exempt' },
            { name: 'locked until', value: at(stake.until) },
            { name: 'votes from', value: at(votesFrom) },
          ]}
        />
      </Card>
      <Card variant="muted" size="sm" className="mt-2.5">
        <Facts
          rows={GATES.map((gate) => ({ name: GATE_NAMES[gate], value: says[gate], bad: !passes[gate] }))}
        />
      </Card>
      <p className={WARNING}>
        Have the node online with its session keys by {at(votesFrom)}. Missing one session's
        heartbeat gets this account kicked.
      </p>
    </>
  )
}

/**
 * The keys a node votes with. The node makes them along with a proof bound to
 * this account, and the dialog only carries both to the chain.
 */
function Keys({ account, signers, tabs, onClose }: ValidatorModalProps & { tabs: ReactNode }) {
  const [draft, patch, drop] = useDraft(`sessionKeys:${account.address}`, { keys: '', proof: '' })
  const { data: facts } = useFacts()
  const { data: set } = useValidators()
  const { data: record } = useValidatorOf(account.address)
  const head = useHead()
  const call = useCall(onClose)
  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)

  const keys = draft.keys.trim()
  const proof = draft.proof.trim()
  const { data: pasted, isError: unreadable } = useReadKeys(keys)
  const proven = isHex(proof) && proof.length > 2
  const operation: Operation | null = pasted && proven ? { kind: 'setKeys', keys, proof } : null

  const height = head?.number ?? 0
  const handover =
    facts && set && record ? nextHandover({ facts, set, record, height }, account.address) : null
  const command = `curl -H "Content-Type: application/json" -d '{"id":1,"jsonrpc":"2.0","method":"author_rotateKeysWithOwner","params":["${publicKeyOf(account.address)}"]}' http://localhost:9944`

  const form = () => {
    if (!pasted) return call.refuse('Paste the keys the node answered with')
    if (!proven) return call.refuse('Paste the proof the node answered with')

    return call.run(submit({ kind: 'setKeys', keys, proof }, call.password).then(drop))
  }

  return (
    <CallPage
      title="Session keys"
      submitLabel="Sign and send"
      busy={call.busy}
      aside={tabs}
      from={signer.address}
      needsPassword={needsPassword}
      operation={operation && wrap(operation)}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      <Card variant="muted" size="sm">
        <CardDescription>Registered now</CardDescription>
        <Facts
          rows={
            !record
              ? [{ name: 'keys', value: 'reading the chain…' }]
              : record.keys
                ? [
                    { name: 'grandpa', value: record.keys.grandpa },
                    { name: 'im_online', value: record.keys.imOnline },
                  ]
                : [{ name: 'keys', value: 'none' }]
          }
        />
      </Card>

      <Card variant="muted" size="sm" className="mt-2.5">
        <CardDescription>Run on the validator node</CardDescription>
        <div className="flex items-start gap-1.5">
          <code className="min-w-0 flex-1 font-mono text-[12px] break-all text-muted-foreground">
            {command}
          </code>
          <CopyButton text={command} label="Copy the command" />
        </div>
      </Card>

      <Field label="Keys" className="mt-3.5">
        <Input
          className="font-mono"
          value={draft.keys}
          placeholder="0x…"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => patch({ keys: event.target.value })}
        />
      </Field>
      <FieldError>{unreadable && 'Not the session keys this chain takes'}</FieldError>

      <Field label="Proof">
        <Input
          className="font-mono"
          value={draft.proof}
          placeholder="0x…"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => patch({ proof: event.target.value })}
        />
      </Field>
      <FieldError>{proof !== '' && !proven && 'Not a 0x hex string'}</FieldError>

      {pasted && (
        <Card variant="muted" size="sm" className="mt-2.5">
          <CardDescription>Pasted</CardDescription>
          <Facts
            rows={[
              { name: 'grandpa', value: pasted.grandpa },
              { name: 'im_online', value: pasted.imOnline },
            ]}
          />
        </Card>
      )}

      {handover !== null && (
        <p className={WARNING}>
          The keys in use keep voting until {blockAt(handover, height, facts?.blockSeconds)}. Keep
          the node holding them running until then.
        </p>
      )}

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />
    </CallPage>
  )
}
