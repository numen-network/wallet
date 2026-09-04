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
import { Facts } from '@/ui/Facts'
import { Field, INSIDE } from '@/ui/Field'
import { Card } from '@/components/ui/card'
import { FieldTitle } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { CROSS, MarkDisc, TICK } from '@/ui/JudgementBadge'
import { Select } from '@/ui/Select'
import { AddressField } from './AddressField'
import { CallModal, SignerField, useCall, useSigning } from './Authorize'
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
  const call = useCall(onClose)

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
    call.setError(message)
    return false
  }

  const form = () => {
    if (!seat) return fail('This account is not a registrar on this chain')
    if (!target) return fail('Enter a Numen or EVM address')
    if (!registration) return fail('That account has no identity to judge')
    if (needsPassword && !call.password) return fail('Enter the password for this account')
    if (!operation) return false

    return call.run(submit(operation, call.password))
  }

  return (
    <CallModal
      title="Judge an identity"
      submitLabel="Sign and send"
      busy={call.busy}
      footNote={
        seat ? `Signing as registrar ${seat.index}` : 'This account is not a registrar'
      }
      from={signer.address}
      needsPassword={needsPassword}
      operation={operation ? wrap(operation) : null}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      <AddressField label="Account" value={to} onChange={setTo} accounts={accounts} />

      {/* Exactly what is being vouched for. The chain hashes these fields and
          turns the call down if they have moved since this was read */}
      {target && (
        <Card variant="muted" size="sm" className="mt-2.5">
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
        </Card>
      )}

      {/* What the judgement is worth. An identity that never asked can still be
          judged, and that work goes unpaid */}
      {seat && registration && (
        <Field className="mt-2.5">
          <FieldTitle>Your fee</FieldTitle>
          <p className="flex items-center gap-2 text-[15px] text-muted-foreground">
            <MarkDisc
              className="size-4"
              fill={owed === null ? 'var(--color-destructive)' : 'var(--color-good)'}
              mark={owed === null ? CROSS : TICK}
            />
            {owed === null ? 'Not paid' : 'Paid'}
            {owed !== null && (
              <span className="ml-auto font-mono">
                {formatAmount(owed, { precision: 4 })} {symbol}
              </span>
            )}
          </p>
        </Field>
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
    </CallModal>
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
  const call = useCall(onClose)

  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const seat = registrars?.find((entry) => entry.account === account.address)

  // What the estimate is quoted against. The call costs the same whatever
  // amount it carries, so the current fee stands in while the box is typed in
  const probe: Operation | null = seat
    ? { kind: 'setFee', registrar: seat.index, fee: seat.fee }
    : null

  const fail = (message: string) => {
    call.setError(message)
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
    if (needsPassword && !call.password) return fail('Enter the password for this account')

    return call.run(submit({ kind: 'setFee', registrar: seat.index, fee: planck }, call.password))
  }

  return (
    <CallModal
      title="Set the judgement fee"
      submitLabel="Sign and send"
      busy={call.busy}
      footNote={seat ? `Signing as registrar ${seat.index}` : 'This account is not a registrar'}
      from={signer.address}
      needsPassword={needsPassword}
      operation={probe ? wrap(probe) : null}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      <Field
        label="Fee"
        aside={
          seat && `charges ${formatAmount(seat.fee, { precision: 4 })} ${symbol} today`
        }
      >
        <InputGroup>
          <InputGroupInput
            className="font-mono"
            value={fee}
            inputMode="decimal"
            placeholder="0.0"
            autoComplete="off"
            onChange={(event) => setFee(amountInput(event.target.value))}
          />
          <InputGroupAddon>
            <InputGroupText>{symbol}</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <p className="mt-1.5 text-[12.5px] text-dim">
        Whoever asks this registrar reserves the fee with the request, and it is handed over when
        the judgement lands. Zero makes the work free.
      </p>

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />
    </CallModal>
  )
}
