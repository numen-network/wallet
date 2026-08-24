import { useEffect, useState } from 'react'
import { DECIMALS } from '@/chain/config'
import { useChain } from '@/chain/provider'
import { useBalances, useFacts } from '@/chain/queries'
import { totalOf } from '@/chain/types'
import { evmAccounts, metaMask, wasRejected, withdrawFee, withdrawToSubstrate } from '@/evm/metamask'
import { evmToSubstrate, publicKeyOf, shorten, shortenEvm } from '@/lib/address'
import { amountInput, AmountError, formatAmount, parseAmount } from '@/lib/balance'
import { Field, FieldError, Input, Modal } from '@/ui/Modal'
import { toast, toastProblem } from '@/ui/Toast'
import { AddressField } from './AddressField'
import type { Account } from './types'


/**
 * An EVM address spends from a substrate account derived by hashing it, and
 * nobody holds a key to that account. So the way back is a call the EVM side
 * signs, and MetaMask is what signs it. The wallet only writes the call down.
 */
export function BringInModal({
  account,
  accounts,
  onClose,
}: {
  account: Account
  accounts: Account[]
  onClose: () => void
}) {
  const { network } = useChain()
  const { data: facts } = useFacts()
  const [held, setHeld] = useState<string[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState(account.address)
  const [amount, setAmount] = useState('')
  const [fee, setFee] = useState<bigint | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    evmAccounts().then(
      (list) => {
        setHeld(list)
        setFrom(list[0] ?? '')
      },
      () => setError('MetaMask would not say which accounts it holds'),
    )
  }, [])

  // The EVM address and the account it spends from are one balance, so the
  // wallet can read what is there without asking MetaMask
  const mirror = from ? evmToSubstrate(from) : ''
  const balances = useBalances(mirror ? [mirror] : [])
  const there = balances[mirror] ? totalOf(balances[mirror]) : 0n
  // An H160 added to the wallet is stored as the account it spends from, so the
  // two ends can name the same place. Sending there costs gas and moves nothing
  const itself = mirror !== '' && mirror === to
  // Gas is taken from the balance being moved, so the most that can go is what
  // is left after it. A MAX that spends the lot is a transfer that always fails
  const sendable = fee !== null && there > fee ? there - fee : 0n

  useEffect(() => {
    // Nothing to price when the call is never going out
    if (!from || itself || !facts) return
    withdrawFee(facts, from, publicKeyOf(to)).then(setFee, () => setFee(null))
  }, [from, itself, to, facts])

  const send = () => {
    setError('')

    let planck: bigint
    try {
      planck = parseAmount(amount)
    } catch (problem) {
      setError(problem instanceof AmountError ? problem.message : 'Enter an amount')
      return false
    }

    if (planck <= 0n) {
      setError('Enter an amount')
      return false
    }
    if (planck > there) {
      setError('More than that address holds')
      return false
    }
    if (!from) {
      setError('MetaMask has no account to send from')
      return false
    }
    if (!facts) return false

    setBusy(true)
    withdrawToSubstrate(network, facts, from, publicKeyOf(to), planck).then(
      () => {
        toast('MetaMask is sending it')
        onClose()
      },
      (problem: unknown) => {
        setBusy(false)
        if (wasRejected(problem)) return
        toastProblem(problem instanceof Error ? problem.message : 'MetaMask turned it down')
      },
    )
    return false
  }

  if (metaMask() === null) {
    return (
      <Modal title="Bring in from MetaMask" submitLabel="Done" cancelLabel={null} onClose={onClose}>
        <p className="text-[13.5px] text-lead">
          No MetaMask on this browser. It holds the key to the EVM address, so nothing here can
          move those funds without it.
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      title="Bring in from MetaMask"
      submitLabel={busy ? 'Waiting…' : 'Ask MetaMask'}
      disabled={busy || !from || itself || !facts}
      footNote="MetaMask signs this, the wallet never sees the key"
      onClose={onClose}
      onSubmit={send}
    >
      {/* MetaMask holds these, so they are not accounts the wallet knows and the
          picker is its own rather than the shared one */}
      <AddressField
        label="From"
        value={from}
        onChange={setFrom}
        accounts={held.map((address) => ({ address, name: shortenEvm(address) }))}
        aside={`holds ${formatAmount(there, { precision: 4 })} ${facts?.symbol ?? ''}`}
        readOnly
      />

      <AddressField label="Into" value={to} onChange={setTo} accounts={accounts} readOnly />
      {itself && (
        <p className="mt-1.5 text-[12.5px] text-bad">
          This account is that EVM address, so its balance is already here
        </p>
      )}

      <Field label="Amount">
        <span className="relative block">
          <Input
            className="pr-[106px] font-mono"
            value={amount}
            inputMode="decimal"
            placeholder="0.0"
            autoComplete="off"
            onChange={(event) => setAmount(amountInput(event.target.value))}
          />
          <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-[7px]">
            <button
              type="button"
              className="rounded-[4px] bg-accent-soft px-2 py-[3px] text-[11px] font-bold text-accent"
              disabled={sendable === 0n}
              onClick={() =>
                setAmount(formatAmount(sendable, { precision: DECIMALS, grouped: false, pad: false }))
              }
            >
              MAX
            </button>
            <span className="text-[11.5px] font-bold tracking-wide text-dim">{facts?.symbol ?? ''}</span>
          </span>
        </span>
      </Field>
      <FieldError>{error}</FieldError>

      <p className="mt-2.5 text-[12.5px] text-dim">
        Only the accounts MetaMask has been let into show up above.
        {fee !== null && ` MAX keeps ${formatAmount(fee, { precision: 6 })} ${facts?.symbol ?? ''} back for gas.`}
      </p>
    </Modal>
  )
}
