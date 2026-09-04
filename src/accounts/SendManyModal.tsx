import { useState } from 'react'
import { useFeeEstimate, useSymbol } from '@/chain/queries'
import { batched, type Operation } from '@/chain/types'
import { amountInput, formatAmount } from '@/lib/balance'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'
import { Field } from '@/ui/Field'
import { CAPTION, FieldError } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { AddressField } from './AddressField'
import { toast } from '@/ui/Toast'
import { CallPage, useSigning } from './Authorize'
import { BLANK, owed, payments, rowProblem, type Row } from './payments'
import type { SendManyProps } from './SendModal'

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
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)

  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)

  const setRow = (at: number, next: Partial<Row>) =>
    patch({ rows: rows.map((row, index) => (index === at ? { ...row, ...next } : row)) })

  const transferable = balance?.transferable ?? 0n
  // The weight follows the number of transfers, not what any of them carries,
  // so a list of the same length against the account itself prices the form
  const probe: Operation = {
    kind: 'batch',
    calls: rows.map(() => ({ kind: 'transfer', to: account.address, amount: 0n })),
  }
  const { data: fee } = useFeeEstimate(signer.address, wrap(probe))
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

    if (needsPassword && !password) {
      setError('Enter the password for this account')
      return false
    }

    void send(batched(calls))
    return false
  }

  const send = async (operation: Operation) => {
    setBusy(true)
    try {
      await submit(operation, password)
      toast(`${rows.length === 1 ? 'Transfer' : 'Transfers'} sent`)
      sent()
      onClose()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'The chain refused it')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CallPage
      title="Batch send"
      submitLabel="Sign and send"
      busy={busy}
      aside={tabs}
      footNote={
        account.multisig &&
        `Needs any ${account.multisig.threshold} of ${account.multisig.signatories.length} signatures`
      }
      from={signer.address}
      needsPassword={needsPassword}
      operation={wrap(probe)}
      password={password}
      onPassword={setPassword}
      error={error}
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
          onChange={choose}
          accounts={bench}
          readOnly
        />
      )}

      <div className="mt-4 grid grid-cols-[1fr_200px_28px] gap-x-2">
        <span className={CAPTION}>Address</span>
        <span className={CAPTION}>Amount</span>
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

            <Field>
              <InputGroup>
                <InputGroupInput
                  className="font-mono"
                  value={row.amount}
                  inputMode="decimal"
                  placeholder="0.0"
                  autoComplete="off"
                  aria-label={`Amount ${index + 1}`}
                  onChange={(event) => setRow(index, { amount: amountInput(event.target.value) })}
                />
                <InputGroupAddon>
                  <InputGroupText>{symbol}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </Field>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove row ${index + 1}`}
              onClick={() => {
                // Removing the only row leaves a blank one, so the form never
                // goes empty and a filled row can always be cleared
                const rest = rows.filter((_, at) => at !== index)
                patch({ rows: rest.length > 0 ? rest : [BLANK] })
              }}
            >
              <Trash2 />
            </Button>
          </div>
        )
      })}

      <div className="mt-3 flex items-center gap-3">
        <Button type="button" variant="outline" onClick={() => patch({ rows: [...rows, BLANK] })}>
          <Plus />
          Add
        </Button>
        <span className="ml-auto text-[12.5px] text-dim">
          {rows.length === 1 ? '1 payment' : `${rows.length} payments`}, adding up to{' '}
          <b className="font-mono font-semibold text-foreground">
            {formatAmount(total)} {symbol}
          </b>
        </span>
      </div>
    </CallPage>
  )
}
