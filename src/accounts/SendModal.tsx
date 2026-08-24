import { useState, type ReactNode } from 'react'
import { DECIMALS } from '@/chain/config'
import { useBalances, useFacts, useFeeEstimate, useSymbol } from '@/chain/queries'
import { totalOf, type AccountBalance, type Operation } from '@/chain/types'
import { resolveAddress, shorten } from '@/lib/address'
import { amountInput, AmountError, formatAmount, parseAmount } from '@/lib/balance'
import { VaultError } from '@/signing/vault'
import { Field, FieldError, Input, Modal } from '@/ui/Modal'
import { Identicon } from '@/ui/Identicon'
import { toast } from '@/ui/Toast'
import { useDraft } from '@/ui/draft'
import { Tabs, type TabOption } from '@/ui/Tabs'
import { AddressField } from './AddressField'
import { AccountPassword, FeeLine, through, useSubmit } from './Authorize'
import { BLANK, type Row } from './payments'
import { SendMany } from './SendManyModal'
import { needsPassword, type Account } from './types'

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
  { id: 'one', label: 'One account' },
  { id: 'many', label: 'Several accounts' },
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
  const tabs = (
    <Tabs value={draft.mode} options={MODES} onChange={(mode) => patch({ mode })} className="w-fit" />
  )

  return draft.mode === 'one' ? (
    <SendOne {...props} tabs={tabs} />
  ) : (
    <SendMany {...props} tabs={tabs} draft={draft} patch={patch} sent={sent} />
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
  const [signing, setSigning] = useState(signers[0]?.address ?? account.address)
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [everything, setEverything] = useState(false)
  const [password, setPassword] = useState('')
  const [toError, setToError] = useState('')
  const [amountError, setAmountError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [busy, setBusy] = useState(false)

  // A multisig signs through one of its signatories and a proxied account
  // through whoever it named. Everything else signs for itself, and either way
  // the fee comes off whoever puts their name to it
  const held = account.multisig || account.proxied ? signers : []
  const signer = held.find((entry) => entry.address === signing) ?? held[0] ?? account
  const submit = useSubmit(signer)
  const local = needsPassword(signer)

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
  const { data: fee } = useFeeEstimate(signer.address, through(account, signer, probe))
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

    const missing = local && !password
    setPasswordError(missing ? 'Enter the password for this account' : '')
    if (!operation || missing) return false

    void send(operation)
    return false
  }

  const send = async (operation: Operation) => {
    setBusy(true)
    try {
      await submit(through(account, signer, operation), password)
      toast('Transfer sent')
      onClose()
    } catch (error) {
      if (error instanceof VaultError) setPasswordError(error.message)
      else setAmountError(error instanceof Error ? error.message : 'Transfer failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Send ${symbol}`}
      width={580}
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      aside={tabs}
      footNote={
        account.multisig
          ? `Needs any ${account.multisig.threshold} of ${account.multisig.signatories.length} signatures`
          : account.proxied
            ? 'Signed by the proxy, spent from this account'
            : local
              ? 'This account locks itself again once this is signed'
              : 'Your extension confirms before anything is broadcast'
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
        <>
          <AddressField
          label="Signing as"
          value={signer.address}
          onChange={setSigning}
          accounts={held}
          readOnly
        />
          <p className="mt-1.5 text-[12.5px] text-dim">
            {account.multisig
              ? `One of ${account.multisig.threshold} signatures. Nothing moves until the rest are in, and starting it holds a small deposit from this account until it does.`
              : 'This account registered the one above as a proxy, so the chain runs the call as this account.'}
          </p>
        </>
      )}

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
        <span className="relative block">
          <Input
            className="pr-[106px] font-mono"
            value={everything ? formatAmount(transferable, { precision: DECIMALS, grouped: false, pad: false }) : amount}
            inputMode="decimal"
            placeholder="0.0"
            autoComplete="off"
            disabled={everything}
            onChange={(event) => setAmount(amountInput(event.target.value))}
          />
          <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-[7px]">
            <button
              type="button"
              className="rounded-[4px] bg-accent-soft px-2 py-[3px] text-[11px] font-bold text-accent"
              onClick={() => setAmount(formatAmount(spendable, { precision: DECIMALS, grouped: false, pad: false }))}
            >
              MAX
            </button>
            <span className="text-[11.5px] font-bold tracking-wide text-dim">{symbol}</span>
          </span>
        </span>
      </Field>
      <FieldError>{amountError}</FieldError>

      <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={everything}
          className="accent-accent"
          onChange={(event) => setEverything(event.target.checked)}
        />
        Send the full balance, closing this account
      </label>

      {local && (
        <>
          <AccountPassword
            value={password}
            note="Unlocks this account for one transfer"
            onChange={setPassword}
          />
          <FieldError>{passwordError}</FieldError>
        </>
      )}

      <FeeLine from={account.address} operation={probe} />
    </Modal>
  )
}
