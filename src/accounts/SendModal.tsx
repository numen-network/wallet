import { useId, useState, type ReactNode } from 'react'
import { DECIMALS } from '@/chain/config'
import { useBalances, useFacts, useFeeEstimate, useSymbol } from '@/chain/queries'
import { totalOf, type AccountBalance, type Operation } from '@/chain/types'
import { resolveAddress } from '@/lib/address'
import { amountInput, AmountError, formatAmount, parseAmount } from '@/lib/balance'
import { Checkbox } from '@/components/ui/checkbox'
import { ModalFrame } from '@/ui/Modal'
import { Field } from '@/ui/Field'
import { Field as Choice, FieldError, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group'
import { useDraft } from '@/ui/draft'
import { TabBar, TabPanel, Tabs, type TabOption } from '@/ui/Tabs'
import { AddressField } from './AddressField'
import { CallPage, SignerField, useCall, useSigning } from './Authorize'
import { BLANK, type Row } from './payments'
import { SendMany } from './SendManyModal'
import type { Account } from './types'

interface SendModalProps {
  account: Account
  balance: AccountBalance | undefined
  /** Accounts here that could sign for it, which only a multisig has more than one of. */
  signers: Account[]
  /** Everything the wallet holds, since anywhere it knows can be sent to. */
  accounts: Account[]
  onClose: () => void
}

type Mode = 'one' | 'many'

const MODES: TabOption<Mode>[] = [
  { id: 'one', label: 'Single' },
  { id: 'many', label: 'Batch' },
]

/** Which rows the second tab has, and which tab the dialog was left on. */
export interface SendDraft {
  mode: Mode
  rows: Row[]
}

export interface SendManyProps extends SendModalProps {
  tabs: ReactNode
  draft: SendDraft
  patch: (fields: Partial<SendDraft>) => void
  /** Drops the draft, once there is nothing left to come back to. */
  sent: () => void
}

/**
 * Paying one account and paying several are the same errand, so they are one
 * dialog with a switch rather than two ways in. The rows of the second tab are
 * a draft, since closing this by accident is not the wallet's to lose them over.
 */
export function SendModal(props: SendModalProps) {
  const [draft, patch, sent] = useDraft(`send:${props.account.address}`, {
    mode: 'one' as Mode,
    rows: [BLANK],
  })
  const tabs = <TabBar options={MODES} className="w-fit" />

  return (
    <Tabs value={draft.mode} onChange={(mode) => patch({ mode })}>
      <ModalFrame width={draft.mode === 'many' ? 650 : 580} onClose={props.onClose}>
        <TabPanel value="one">
          <SendOne {...props} tabs={tabs} />
        </TabPanel>
        <TabPanel value="many">
          <SendMany {...props} tabs={tabs} draft={draft} patch={patch} sent={sent} />
        </TabPanel>
      </ModalFrame>
    </Tabs>
  )
}

/** An EVM destination is the same pot as its mapped SS58, so it is accepted. */
function SendOne({
  account,
  balance,
  signers,
  accounts,
  tabs,
  onClose,
}: SendModalProps & { tabs: ReactNode }) {
  const symbol = useSymbol()
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [everything, setEverything] = useState(false)
  const everythingId = useId()
  const call = useCall(onClose)
  const [toError, setToError] = useState('')
  const [amountError, setAmountError] = useState('')

  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)

  const transferable = balance?.transferable ?? 0n
  // What the chain will make of the far end. An account it has never seen has
  // to be handed enough to exist, and one that is already there has no floor
  const destination = resolveAddress(to)
  const landing = useBalances(destination ? [destination] : [])[destination ?? '']
  const fresh = destination !== null && (!landing || totalOf(landing) === 0n)
  // Anywhere else the wallet knows, since sending to this account is a no op
  const others = accounts.filter((entry) => entry.address !== account.address)
  // A transfer costs the same whatever it carries and wherever it goes, so one
  // estimate against the account itself covers the whole form
  const probe: Operation = everything
    ? { kind: 'transferAll', to: account.address }
    : { kind: 'transfer', to: account.address, amount: transferable }
  const { data: fee } = useFeeEstimate(signer.address, wrap(probe))
  const { data: facts } = useFacts()
  // A multisig or a proxied account pays out of its own balance while whoever
  // signs covers the fee, so the deposit that keeps it alive is the only thing
  // held back. MAX offers what is left either way, and the form takes it
  const another = Boolean(account.multisig || account.proxied)
  const back = another ? facts?.existentialDeposit : fee
  const spendable = back !== undefined && transferable > back ? transferable - back : 0n

  const form = () => {
    const destination = resolveAddress(to)
    setToError(destination ? '' : 'Enter a Numen or EVM address')

    let operation: Operation | null = null
    if (everything) {
      operation = destination ? { kind: 'transferAll', to: destination } : null
      setAmountError('')
    } else {
      let planck = 0n
      try {
        planck = parseAmount(amount)
      } catch (error) {
        setAmountError(error instanceof AmountError ? error.message : 'Enter an amount')
        return false
      }

      if (planck <= 0n || planck > spendable) {
        setAmountError('Enter an amount within the transferable balance, fee included')
        return false
      }
      if (facts && fresh && planck < facts.existentialDeposit) {
        setAmountError(
          `A new account needs ${formatAmount(facts.existentialDeposit, { precision: 6 })} ${symbol} to exist`,
        )
        return false
      }
      // transfer_keep_alive is what goes out, so the chain would turn this down
      // after it had been signed rather than before
      if (facts && transferable - planck < facts.existentialDeposit) {
        setAmountError(
          `Leave ${formatAmount(facts.existentialDeposit, { precision: 6 })} ${symbol} behind, or send the full balance`,
        )
        return false
      }
      setAmountError('')
      operation = destination ? { kind: 'transfer', to: destination, amount: planck } : null
    }

    const missing = needsPassword && !call.password
    call.setError(missing ? 'Enter the password for this account' : '')
    if (!operation || missing) return false

    return call.run(submit(operation, call.password), 'Transfer sent')
  }

  return (
    <CallPage
      title={`Send ${symbol}`}
      submitLabel="Sign and send"
      busy={call.busy}
      aside={tabs}
      footNote={
        account.multisig &&
        `Needs any ${account.multisig.threshold} of ${account.multisig.signatories.length} signatures`
      }
      from={account.address}
      needsPassword={needsPassword}
      operation={probe}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      note="Unlocks this account for one transfer"
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

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />

      <AddressField
        label="Address"
        value={to}
        onChange={setTo}
        accounts={others}
        aside={
          fresh && facts && `needs ${formatAmount(facts.existentialDeposit, { precision: 6 })} to start`
        }
      />
      <FieldError>{toError}</FieldError>

      <Field label="Amount">
        <InputGroup>
          <InputGroupInput
            className="font-mono"
            value={everything ? formatAmount(transferable, { precision: DECIMALS, grouped: false, pad: false }) : amount}
            inputMode="decimal"
            placeholder="0.0"
            autoComplete="off"
            disabled={everything}
            onChange={(event) => setAmount(amountInput(event.target.value))}
          />
          <InputGroupAddon>
            <InputGroupButton
              onClick={() => setAmount(formatAmount(spendable, { precision: DECIMALS, grouped: false, pad: false }))}
            >
              MAX
            </InputGroupButton>
            <InputGroupText>{symbol}</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <FieldError>{amountError}</FieldError>

      <Choice orientation="horizontal" className="mt-2.5">
        <Checkbox
          id={everythingId}
          checked={everything}
          onCheckedChange={(checked) => setEverything(checked === true)}
        />
        <FieldLabel htmlFor={everythingId}>Send the full balance, closing this account</FieldLabel>
      </Choice>
    </CallPage>
  )
}
