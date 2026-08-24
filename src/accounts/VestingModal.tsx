import { useState, type ReactNode } from 'react'
import { useFacts, useHead, useSymbol, useVesting } from '@/chain/queries'
import type { AccountBalance, Operation } from '@/chain/types'
import {
  endsAt,
  lockedAt,
  perDay,
  releasable,
  scheduleOver,
  stillLocked,
  type VestingSchedule,
} from '@/chain/vesting'
import { resolveAddress } from '@/lib/address'
import { amountInput, formatAmount, parseAmount } from '@/lib/balance'
import { waitFor } from '@/lib/blocks'
import { VaultError } from '@/signing/vault'
import { Facts } from '@/ui/Facts'
import { Field, FieldError, Input, Modal } from '@/ui/Modal'
import { Tabs, type TabOption } from '@/ui/Tabs'
import { toast } from '@/ui/Toast'
import { useDraft } from '@/ui/draft'
import { AddressField } from './AddressField'
import { AccountPassword, FeeLine, SignerField, useSigning } from './Authorize'
import type { Account } from './types'

interface VestingModalProps {
  account: Account
  balance: AccountBalance | undefined
  /** Anywhere a grant could land, including this account, which may vest to itself. */
  accounts: Account[]
  signers: Account[]
  onClose: () => void
}

type Mode = 'release' | 'grant'

const MODES: TabOption<Mode>[] = [
  { id: 'release', label: 'Release' },
  { id: 'grant', label: 'Grant' },
]

/**
 * Collecting what a schedule has thawed and putting somebody on one are the two
 * halves of pallet_vesting, so they are one dialog with a switch.
 */
export function VestingModal(props: VestingModalProps) {
  const [draft, patch] = useDraft(`vesting:${props.account.address}`, { mode: 'release' as Mode })
  const tabs = (
    <Tabs value={draft.mode} options={MODES} onChange={(mode) => patch({ mode })} className="w-fit" />
  )

  return draft.mode === 'release' ? (
    <Release {...props} tabs={tabs} />
  ) : (
    <Grant {...props} tabs={tabs} />
  )
}

/**
 * What a vesting schedule has thawed stays frozen until somebody asks for it.
 * The chain works the freeze out again on demand rather than every block, so
 * the balance a card shows as locked is behind until this call lands.
 */
function Release({
  account,
  signers,
  tabs,
  onClose,
}: VestingModalProps & { tabs: ReactNode }) {
  const symbol = useSymbol()
  const { data: schedules } = useVesting(account.address)
  const { data: facts } = useFacts()
  const head = useHead()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const height = head?.number ?? 0
  const held = schedules ?? []
  const free = releasable(held, height)
  const operation = { kind: 'vest' } as const

  const form = () => {
    setError('')
    void send()
    return false
  }

  const send = async () => {
    setBusy(true)
    try {
      await submit(operation, password)
      toast('Sent')
      onClose()
    } catch (problem) {
      if (problem instanceof VaultError) setError(problem.message)
      else setError(problem instanceof Error ? problem.message : 'The chain refused it')
    } finally {
      setBusy(false)
    }
  }

  const amount = (planck: bigint) => `${formatAmount(planck, { precision: 4 })} ${symbol}`
  const block = (at: number) => `block ${at.toLocaleString('en-US')}`

  const ends = (schedule: VestingSchedule) => {
    const last = endsAt(schedule)
    if (last <= height) return `${block(last)}, all thawed`
    return facts ? `${block(last)}, ${waitFor(last - height, facts.blockSeconds)}` : block(last)
  }

  return (
    <Modal
      title="Vesting"
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy || free === 0n}
      aside={tabs}
      footNote={
        held.length === 0
          ? undefined
          : free === 0n
            ? 'Nothing has thawed since this was last asked for'
            : 'The freeze comes off what has thawed, nothing else'
      }
      onClose={onClose}
      onSubmit={form}
    >
      {held.length === 0 ? (
        <p className="text-[13.5px] text-lead">Nothing is vesting on this account.</p>
      ) : (
        <>
          {/* The two figures every schedule adds up to, since what is worth
              signing for is the first of them */}
          <div className="grid grid-cols-2 gap-2.5">
            <Figure label="Ready to release" value={amount(free)} lit={free > 0n} />
            <Figure label="Still frozen" value={amount(stillLocked(held, height))} />
          </div>

          <div className="mt-2.5 grid gap-1.5">
            {held.map((schedule, index) => (
              <div key={index} className="rounded-[4px] border border-line bg-recess px-2.5 py-2">
                <Facts
                  rows={[
                    {
                      name: 'left',
                      value: `${formatAmount(lockedAt(schedule, height))} of ${amount(schedule.locked)}`,
                    },
                    ...(facts
                      ? [
                          {
                            name: 'thaws',
                            value: `${amount(perDay(schedule, facts.blockSeconds))} a day`,
                          },
                        ]
                      : []),
                    { name: 'ends', value: ends(schedule) },
                  ]}
                />
              </div>
            ))}
          </div>
        </>
      )}

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />

      {needsPassword && free > 0n && (
        <AccountPassword
          value={password}
          note="Unlocks this account for one signature"
          onChange={setPassword}
        />
      )}
      <FieldError>{error}</FieldError>

      {free > 0n && <FeeLine from={signer.address} operation={wrap(operation)} />}
    </Modal>
  )
}

/** One number worth reading on its own, with the words that say what it is. */
function Figure({ label, value, lit = false }: { label: string; value: string; lit?: boolean }) {
  return (
    <div className="rounded-[4px] border border-line bg-recess px-2.5 py-2">
      <div className="text-[11.5px] text-dim">{label}</div>
      <div className={`mt-0.5 font-mono text-[15px] font-semibold ${lit ? 'text-accent' : ''}`}>
        {value}
      </div>
    </div>
  )
}

/**
 * A grant. The money leaves this account the moment it lands and thaws on the
 * far end at a fixed rate, and the pallet has nothing that takes one back.
 *
 * The chain holds a rate rather than a deadline, so the duration typed here is
 * only what the rate is worked out from. What the form quotes is the block the
 * schedule really ends on.
 */
function Grant({
  account,
  balance,
  accounts,
  signers,
  tabs,
  onClose,
}: VestingModalProps & { tabs: ReactNode }) {
  const symbol = useSymbol()
  const { data: facts } = useFacts()
  const head = useHead()
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [days, setDays] = useState('')
  const [start, setStart] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const height = head?.number ?? 0
  const transferable = balance?.transferable ?? 0n
  // An empty start means the grant begins where the chain is, which is what the
  // placeholder says, so nothing has to be prefilled and go stale
  const from = Number(start) || height
  const over = Number(days)

  let locked = 0n
  try {
    locked = parseAmount(amount)
  } catch {
    locked = 0n
  }
  const schedule =
    locked > 0n && over > 0 && facts ? scheduleOver(locked, over, from, facts.blockSeconds) : null
  const target = resolveAddress(to)
  const operation: Operation | null =
    schedule && target ? { kind: 'vestedTransfer', to: target, schedule } : null

  const shown = (planck: bigint) => `${formatAmount(planck, { precision: 4 })} ${symbol}`
  // How far off it is, where there is any distance to say. A start the chain
  // has already passed is now, and saying so twice adds nothing
  const at = (mark: number) =>
    `block ${mark.toLocaleString('en-US')}${
      mark > height && facts ? `, ${waitFor(mark - height, facts.blockSeconds)}` : ''
    }`

  const fail = (message: string) => {
    setError(message)
    return false
  }

  const form = () => {
    if (!target) return fail('Enter a Numen or EVM address')
    // An empty box parses as nothing, so this is the only amount error there is
    if (facts && locked < facts.minVestedTransfer) {
      return fail(`A grant has to be at least ${shown(facts.minVestedTransfer)}`)
    }
    if (locked > transferable) return fail('More than this account can send')
    if (!(over > 0)) return fail('Say how many days it unlocks over')
    if (needsPassword && !password) return fail('Enter the password for this account')

    setError('')
    void send()
    return false
  }

  const send = async () => {
    if (!operation) return
    setBusy(true)
    try {
      await submit(operation, password)
      toast('Sent')
      onClose()
    } catch (problem) {
      if (problem instanceof VaultError) setError(problem.message)
      else setError(problem instanceof Error ? problem.message : 'The chain refused it')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Grant a vesting schedule"
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      aside={tabs}
      footNote="Nothing takes a schedule back once it is on the chain"
      onClose={onClose}
      onSubmit={form}
    >
      <AddressField
        label="To"
        value={to}
        onChange={setTo}
        accounts={accounts}
        aside={target === account.address ? 'this account, locking its own balance' : undefined}
      />

      <Field label="Amount" aside={`${shown(transferable)} to send`}>
        <Input
          className="font-mono"
          value={amount}
          inputMode="decimal"
          placeholder="0.0"
          autoComplete="off"
          onChange={(event) => setAmount(amountInput(event.target.value))}
        />
      </Field>

      {/* Where the days land, since a schedule runs until the last planck is
          out rather than for a round number of blocks */}
      <Field
        label="Unlocks over"
        aside={schedule && `ends at block ${endsAt(schedule).toLocaleString('en-US')}`}
      >
        <Input
          value={days}
          inputMode="numeric"
          placeholder="days"
          autoComplete="off"
          onChange={(event) => setDays(event.target.value.replace(/\D/g, ''))}
        />
      </Field>

      <Field label="Starts at block" aside={`now is ${height.toLocaleString('en-US')}`}>
        <Input
          className="font-mono"
          value={start}
          inputMode="numeric"
          placeholder={String(height)}
          autoComplete="off"
          onChange={(event) => setStart(event.target.value.replace(/\D/g, ''))}
        />
      </Field>

      {/* The same three facts the Release tab lists for a schedule already on
          the chain, so what is signed for reads as what shows up */}
      {schedule && (
        <div className="mt-2.5 rounded-[4px] border border-line bg-recess px-2.5 py-2">
          <Facts
            rows={[
              { name: 'starts', value: at(from) },
              ...(facts
                ? [{ name: 'thaws', value: `${shown(perDay(schedule, facts.blockSeconds))} a day` }]
                : []),
              { name: 'ends', value: at(endsAt(schedule)) },
            ]}
          />
        </div>
      )}

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />

      {needsPassword && (
        <AccountPassword
          value={password}
          note="Unlocks this account for one signature"
          onChange={setPassword}
        />
      )}
      <FieldError>{error}</FieldError>

      {operation && <FeeLine from={signer.address} operation={wrap(operation)} />}
    </Modal>
  )
}
