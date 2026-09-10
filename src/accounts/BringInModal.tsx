import { useEffect, useState } from 'react'
import { useChain } from '@/chain/provider'
import { useBalances, useFacts } from '@/chain/queries'
import { totalOf } from '@/chain/types'
import { evmAccounts, metaMask, wasRejected, withdrawFee, withdrawToSubstrate } from '@/evm/metamask'
import { cn } from '@/lib/cn'
import { evmToSubstrate, publicKeyOf, shorten } from '@/lib/address'
import { amountProblem, formatAmount, parseAmount } from '@/lib/balance'
import { LEDE, Modal } from '@/ui/Modal'
import { FieldError, NOTE } from '@/components/ui/field'
import { toast, toastProblem } from '@/ui/Toast'
import { AddressField } from './AddressField'
import { AmountField } from './AmountField'
import type { Account } from './types'


/**
 * An EVM address spends from a substrate account derived by hashing it, and
 * nobody holds a key to that account. So the way back is a call the EVM side
 * signs, and MetaMask is what signs it. The wallet only writes the call down.
 */
export function BringInModal({
  source,
  accounts,
  onClose,
}: {
  /** The EVM address the money leaves. */
  source: string
  accounts: Account[]
  onClose: () => void
}) {
  const { network } = useChain()
  const { data: facts } = useFacts()
  const [held, setHeld] = useState<string[]>([])
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [fee, setFee] = useState<bigint | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    evmAccounts().then(setHeld, () => setError('MetaMask would not say which accounts it holds'))
  }, [])

  // The EVM address and the account it spends from are one balance, so the
  // wallet can read what is there without asking MetaMask
  const mirror = evmToSubstrate(source)
  const balances = useBalances([mirror])
  const there = balances[mirror] ? totalOf(balances[mirror]) : 0n
  // A reserve cannot leave the account, so only the transferable part can go
  const movable = balances[mirror]?.transferable ?? 0n
  // An H160 added to the wallet is stored as the account it spends from, so the
  // two ends can name the same place. Sending there costs gas and moves nothing
  const itself = mirror === to
  // The signature comes from MetaMask, so an address it has not been let into
  // is one nothing here can spend from
  const signable = held.some((entry) => entry.toLowerCase() === source.toLowerCase())
  // Gas is taken from the balance being moved, so the most that can go is what
  // is left after it. A MAX that spends the lot is a transfer that always fails
  const sendable = fee !== null && movable > fee ? movable - fee : 0n

  useEffect(() => {
    // Nothing to price when the call is never going out
    if (!to || itself || !facts) return
    withdrawFee(network, facts, source, publicKeyOf(to)).then(setFee, () => setFee(null))
  }, [network, source, itself, to, facts])

  const send = () => {
    setError('')

    const problem = amountProblem(amount)
    if (problem) {
      setError(problem)
      return false
    }
    const planck = parseAmount(amount)
    if (planck > movable) {
      setError('More than that address can send')
      return false
    }
    if (!facts) return false

    setBusy(true)
    withdrawToSubstrate(network, facts, source, publicKeyOf(to), planck).then(
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
        <p className={LEDE}>
          No MetaMask on this browser. It holds the key to the EVM address, so nothing here can
          move those funds without it.
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      title="Bring in from MetaMask"
      submitLabel="Ask MetaMask"
      busy={busy}
      disabled={!signable || !to || itself || !facts}
      onClose={onClose}
      onSubmit={send}
    >
      {/* MetaMask holds this address, so it is not one of the wallet's accounts
          and the box takes a list of its own */}
      <AddressField
        label="From"
        value={source}
        onChange={() => {}}
        accounts={[{ address: source, name: shorten(source, { evm: true }) }]}
        aside={`holds ${formatAmount(there, { precision: 4 })} ${facts?.symbol ?? ''}`}
        readOnly
      />
      {held.length > 0 && !signable && (
        <p className="mt-1.5 text-[12.5px] text-destructive">
          MetaMask has not been let into this address, so nothing here can move what sits there
        </p>
      )}

      <AddressField label="Into" value={to} onChange={setTo} accounts={accounts} readOnly />
      {itself && (
        <p className="mt-1.5 text-[12.5px] text-destructive">
          This account is that EVM address, so its balance is already here
        </p>
      )}

      <AmountField label="Amount" value={amount} onChange={setAmount} max={sendable} />
      <FieldError>{error}</FieldError>

      {fee !== null && (
        <p className={cn('mt-2.5', NOTE)}>
          MAX keeps {formatAmount(fee, { precision: 6 })} {facts?.symbol ?? ''} back for gas.
        </p>
      )}
    </Modal>
  )
}
