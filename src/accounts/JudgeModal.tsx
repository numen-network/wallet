import { useState } from 'react'
import { useRegistrars, useStanding, useSymbol } from '@/chain/queries'
import {
  feePaidTo,
  IDENTITY_FIELDS,
  LABELS,
  VERDICTS,
  type Ruling,
} from '@/chain/identity'
import type { Operation } from '@/chain/types'
import { resolveAddress } from '@/lib/address'
import { amountInput, AmountError, formatAmount, parseAmount } from '@/lib/balance'
import { VaultError } from '@/signing/vault'
import { Facts } from '@/ui/Facts'
import { BOX, Field, FieldError, INSIDE, Input, Modal } from '@/ui/Modal'
import { CROSS, MarkDisc, TICK } from '@/ui/JudgementBadge'
import { Select } from '@/ui/Select'
import { toast } from '@/ui/Toast'
import { AddressField } from './AddressField'
import { AccountPassword, FeeLine, SignerField, useSigning } from './Authorize'
import type { Account } from './types'

const OPTIONS = VERDICTS.map((verdict) => ({ value: verdict.value, label: verdict.value }))

/**
 * The registrar's half of an identity. A verdict is signed over the hash of the
 * identity it is for, so the chain refuses one given for anything but the exact
 * fields below, and nobody ends up vouching for something they never read.
 *
 * The handles themselves are proved elsewhere. This only records what the
 * registrar made of them.
 */
export function JudgeModal({
  account,
  accounts,
  signers,
  onClose,
}: {
  account: Account
  /** Everywhere the wallet knows, since a registrar mostly judges strangers. */
  accounts: Account[]
  signers: Account[]
  onClose: () => void
}) {
  const symbol = useSymbol()
  const { data: registrars } = useRegistrars()
  const [to, setTo] = useState('')
  const [verdict, setVerdict] = useState<Ruling>('Reasonable')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const seat = registrars?.find((entry) => entry.account === account.address)
  const target = resolveAddress(to)
  const { data: standing } = useStanding(target ?? '')
  const registration = target ? (standing?.own ?? null) : null
  const claimed = IDENTITY_FIELDS.filter((field) => registration?.info[field])
  const owed = seat ? feePaidTo(registration, seat.index) : null

  const operation: Operation | null =
    seat && target && registration
      ? {
          kind: 'provideJudgement',
          registrar: seat.index,
          target,
          judgement: verdict,
          info: registration.info,
        }
      : null

  const fail = (message: string) => {
    setError(message)
    return false
  }

  const form = () => {
    if (!seat) return fail('This account is not a registrar on this chain')
    if (!target) return fail('Enter a Numen or EVM address')
    if (!registration) return fail('That account has no identity to judge')
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
      title="Judge an identity"
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      footNote={
        seat ? `Signing as registrar ${seat.index}` : 'This account is not a registrar'
      }
      onClose={onClose}
      onSubmit={form}
    >
      <AddressField label="Account" value={to} onChange={setTo} accounts={accounts} />

      {/* Exactly what is being vouched for. The chain hashes these fields and
          turns the call down if they have moved since this was read */}
      {target && (
        <div className="mt-2.5 rounded-[4px] border border-line bg-recess px-2.5 py-2">
          {registration === null ? (
            <p className="text-[12.5px] text-dim">
              Nothing on chain for this account, so there is nothing to judge.
            </p>
          ) : claimed.length === 0 ? (
            <p className="text-[12.5px] text-dim">
              An identity with every field empty. There is nothing here to check.
            </p>
          ) : (
            <Facts
              rows={claimed.map((field) => ({
                name: LABELS[field],
                value: registration.info[field],
              }))}
            />
          )}
        </div>
      )}

      {/* What the judgement is worth. An identity that never asked can still be
          judged, and that work goes unpaid */}
      {seat && registration && (
        <div className={`mt-2.5 px-3 py-2 ${BOX}`}>
          <span className="text-[11.5px] text-dim">Your fee</span>
          <p className="flex items-center gap-2 text-[15px] text-lead">
            <MarkDisc
              className="size-4"
              fill={owed === null ? 'var(--color-bad)' : 'var(--color-good)'}
              mark={owed === null ? CROSS : TICK}
            />
            {owed === null ? 'Not paid' : 'Paid'}
            {owed !== null && (
              <span className="ml-auto font-mono">
                {formatAmount(owed, { precision: 4 })} {symbol}
              </span>
            )}
          </p>
        </div>
      )}

      <Field label="Judgement">
        <Select
          value={verdict}
          onValueChange={(value) => setVerdict(value as Ruling)}
          options={OPTIONS}
          label="Judgement"
          className={INSIDE}
        />
      </Field>
      <p className="mt-1.5 text-[12.5px] text-dim">
        {VERDICTS.find((entry) => entry.value === verdict)?.says}
      </p>

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

/**
 * The registrar's price, which the chain quotes to whoever asks for a judgement
 * and reserves with the request. Only the seat's own account may move it, so
 * the modal takes no target.
 */
export function SetFeeModal({
  account,
  signers,
  onClose,
}: {
  account: Account
  signers: Account[]
  onClose: () => void
}) {
  const symbol = useSymbol()
  const { data: registrars } = useRegistrars()
  const [fee, setFee] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const seat = registrars?.find((entry) => entry.account === account.address)

  // What the estimate is quoted against. The call costs the same whatever
  // amount it carries, so the current fee stands in while the box is typed in
  const probe: Operation | null = seat
    ? { kind: 'setFee', registrar: seat.index, fee: seat.fee }
    : null

  const fail = (message: string) => {
    setError(message)
    return false
  }

  const form = () => {
    if (!seat) return fail('This account is not a registrar on this chain')

    let planck: bigint
    try {
      planck = parseAmount(fee)
    } catch (problem) {
      return fail(problem instanceof AmountError ? problem.message : 'Enter an amount')
    }
    if (needsPassword && !password) return fail('Enter the password for this account')

    setError('')
    void send({ kind: 'setFee', registrar: seat.index, fee: planck })
    return false
  }

  const send = async (operation: Operation) => {
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
      title="Set the judgement fee"
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      footNote={seat ? `Signing as registrar ${seat.index}` : 'This account is not a registrar'}
      onClose={onClose}
      onSubmit={form}
    >
      <Field
        label="Fee"
        aside={
          seat && `charges ${formatAmount(seat.fee, { precision: 4 })} ${symbol} today`
        }
      >
        <span className="relative block">
          <Input
            className="pr-16 font-mono"
            value={fee}
            inputMode="decimal"
            placeholder="0.0"
            autoComplete="off"
            onChange={(event) => setFee(amountInput(event.target.value))}
          />
          <span className="absolute top-1/2 right-2 -translate-y-1/2 text-[11.5px] font-bold tracking-wide text-dim">
            {symbol}
          </span>
        </span>
      </Field>
      <p className="mt-1.5 text-[12.5px] text-dim">
        Whoever asks this registrar reserves the fee with the request, and it is handed over when
        the judgement lands. Zero makes the work free.
      </p>

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />

      {needsPassword && (
        <AccountPassword
          value={password}
          note="Unlocks this account for one signature"
          onChange={setPassword}
        />
      )}
      <FieldError>{error}</FieldError>

      {probe && <FeeLine from={signer.address} operation={wrap(probe)} />}
    </Modal>
  )
}
