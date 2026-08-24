import { useState } from 'react'
import { useFeeEstimate, useSymbol } from '@/chain/queries'
import { batched, type Operation } from '@/chain/types'
import { shorten } from '@/lib/address'
import { amountInput, formatAmount } from '@/lib/balance'
import { VaultError } from '@/signing/vault'
import { Button, IconButton } from '@/ui/Button'
import { Identicon } from '@/ui/Identicon'
import { PlusIcon, TrashIcon } from '@/ui/icons'
import { BOX, Field, FieldError, Input, Modal } from '@/ui/Modal'
import { AddressField } from './AddressField'
import { toast } from '@/ui/Toast'
import { AccountPassword, FeeLine, through, useSubmit } from './Authorize'
import { BLANK, owed, payments, rowProblem, type Row } from './payments'
import { needsPassword } from './types'
import type { SendManyProps } from './SendModal'

const HEADING = 'text-[11px] font-bold tracking-[0.07em] text-lead uppercase'

/**
 * One account paying several in one signature. The chain takes it as a single
 * call over a list of transfers, so it costs one fee and either all of it lands
 * or none of it does.
 */
export function SendMany({
  account,
  balance,
  signers,
  accounts,
  tabs,
  draft,
  patch,
  sent,
  onClose,
}: SendManyProps) {
  const symbol = useSymbol()
  const { rows } = draft
  // Anywhere else the wallet knows, since paying this account from itself is a no op
  const others = accounts.filter((entry) => entry.address !== account.address)
  const [signing, setSigning] = useState(signers[0]?.address ?? account.address)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)

  const held = account.multisig || account.proxied ? signers : []
  const signer = held.find((entry) => entry.address === signing) ?? held[0] ?? account
  const submit = useSubmit(signer)
  const local = needsPassword(signer)

  const setRow = (at: number, next: Partial<Row>) =>
    patch({ rows: rows.map((row, index) => (index === at ? { ...row, ...next } : row)) })

  const transferable = balance?.transferable ?? 0n
  // The weight follows the number of transfers, not what any of them carries,
  // so a list of the same length against the account itself prices the form
  const probe: Operation = {
    kind: 'batch',
    calls: rows.map(() => ({ kind: 'transfer', to: account.address, amount: 0n })),
  }
  const { data: fee } = useFeeEstimate(signer.address, through(account, signer, probe))
  // A multisig or a proxied account pays out of its own balance while whoever
  // signs covers the fee, so nothing has to be held back from what it sends
  const another = Boolean(account.multisig || account.proxied)
  const spendable = another ? transferable : fee && transferable > fee ? transferable - fee : 0n
  const total = owed(rows)

  const form = () => {
    setShown(true)
    setError('')

    const calls = payments(rows)
    if (!calls) return false

    if (total > spendable) {
      setError('The rows come to more than this account can send, fee included')
      return false
    }

    if (local && !password) {
      setError('Enter the password for this account')
      return false
    }

    void send(batched(calls))
    return false
  }

  const send = async (operation: Operation) => {
    setBusy(true)
    try {
      await submit(through(account, signer, operation), password)
      toast(`${rows.length === 1 ? 'Transfer' : 'Transfers'} sent`)
      sent()
      onClose()
    } catch (problem) {
      setError(
        problem instanceof VaultError
          ? problem.message
          : problem instanceof Error
            ? problem.message
            : 'The chain refused it',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Send to many"
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      width={650}
      aside={tabs}
      footNote={
        account.multisig
          ? `Needs any ${account.multisig.threshold} of ${account.multisig.signatories.length} signatures`
          : 'One signature over the lot, and the chain runs all of it or none of it'
      }
      onClose={onClose}
      onSubmit={form}
    >
      {/* The account being spent from is an address like any other, so it wears
          the same box rather than a card of its own */}
      <AddressField
        label="From"
        value={account.address}
        onChange={() => {}}
        accounts={[account]}
        aside={`transferable ${formatAmount(transferable, { precision: 4 })} ${symbol}`}
        readOnly
      />

      {another && (
        <AddressField
          label="Signing as"
          value={signer.address}
          onChange={setSigning}
          accounts={held}
          readOnly
        />
      )}

      <div className="mt-4 grid grid-cols-[1fr_200px_28px] gap-x-2">
        <span className={HEADING}>Address</span>
        <span className={HEADING}>Amount</span>
        <span />
      </div>

      {rows.map((row, index) => {
        const problem = shown ? rowProblem(row) : null

        return (
          <div key={index} className="mt-1.5 grid grid-cols-[1fr_200px_28px] items-start gap-x-2">
            <span>
              <AddressField
                label={`Address ${index + 1}`}
                value={row.to}
                onChange={(to) => setRow(index, { to })}
                accounts={others}
                className="w-full"
                labelled={false}
              />
              <FieldError>{problem}</FieldError>
            </span>

            <span className="relative block">
              <Input
                className={`px-3 py-2 pr-14 font-mono ${BOX}`}
                value={row.amount}
                inputMode="decimal"
                placeholder="0.0"
                autoComplete="off"
                aria-label={`Amount ${index + 1}`}
                onChange={(event) => setRow(index, { amount: amountInput(event.target.value) })}
              />
              <span className="absolute top-1/2 right-2.5 -translate-y-1/2 text-[11.5px] font-bold tracking-wide text-dim">
                {symbol}
              </span>
            </span>

            <IconButton
              type="button"
              aria-label={`Remove row ${index + 1}`}
              disabled={rows.length === 1}
              onClick={() => patch({ rows: rows.filter((_, at) => at !== index) })}
            >
              <TrashIcon />
            </IconButton>
          </div>
        )
      })}

      <div className="mt-3 flex items-center gap-3">
        <Button type="button" onClick={() => patch({ rows: [...rows, BLANK] })}>
          <PlusIcon />
          Add
        </Button>
        <span className="ml-auto text-[12.5px] text-dim">
          {rows.length === 1 ? '1 payment' : `${rows.length} payments`}, adding up to{' '}
          <b className="font-mono font-semibold text-ink">
            {formatAmount(total)} {symbol}
          </b>
        </span>
      </div>

      {local && (
        <AccountPassword
          value={password}
          note="Unlocks this account for one signature"
          onChange={setPassword}
        />
      )}

      <FieldError>{error}</FieldError>

      <FeeLine from={signer.address} operation={through(account, signer, probe)} />
    </Modal>
  )
}
