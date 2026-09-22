import { useEffect, useState } from 'react'
import { useChain } from '@/chain/provider'
import { useBalances, useFacts } from '@/chain/queries'
import { totalOf } from '@/chain/types'
import {
  evmAccounts,
  metaMask,
  sendToken,
  wasRejected,
  withdrawFee,
  withdrawToSubstrate,
} from '@/evm/metamask'
import { cn } from '@/lib/cn'
import { evmToSubstrate, isEvmAddress, publicKeyOf, shorten } from '@/lib/address'
import { amountProblem, formatAmount, parseAmount } from '@/lib/balance'
import { Field, INSIDE } from '@/ui/Field'
import { LEDE, Modal } from '@/ui/Modal'
import { Select } from '@/ui/Select'
import { Avatar, AvatarImage } from '@/components/ui/avatar'
import { FieldError, NOTE } from '@/components/ui/field'
import { toast, toastProblem } from '@/ui/Toast'
import { AddressField } from './AddressField'
import { AmountField } from './AmountField'
import { tokenAmount, useHoldings, type Holding } from './tokens'
import type { Account } from './types'

/** The Token box's value for the coin, which no contract address can clash with. */
const COIN = 'coin'

const COIN_ICON = '/logo.svg'

/** Sized to the tick's column, so every row reads from the same left edge. */
const mark = (icon: string) => (
  <Avatar className="size-3.5">
    <AvatarImage src={icon} alt="" />
  </Avatar>
)

const NONE: Holding[] = []

/**
 * An EVM address spends from a substrate account derived by hashing it, and
 * nobody holds a key to that account. So whatever leaves it is a call the EVM
 * side signs, and MetaMask is what signs it. The wallet only writes the call
 * down. The coin goes back to a Numen account and a token to another H160.
 */
export function MetaMaskSendModal({
  source,
  accounts,
  initial,
  onClose,
}: {
  /** The EVM address the money leaves. */
  source: string
  accounts: Account[]
  /** The holding the dialog opens with. Without one it opens on the coin. */
  initial?: Holding | undefined
  onClose: () => void
}) {
  const { network } = useChain()
  const { data: facts } = useFacts()
  // Until the chain answers, the holding the dialog opened with stands in for it
  const holdings = useHoldings(source) ?? (initial ? [initial] : NONE)
  const [held, setHeld] = useState<string[]>([])
  const [picked, setPicked] = useState(initial?.token.address ?? COIN)
  const [to, setTo] = useState('')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [fee, setFee] = useState<bigint | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    evmAccounts().then(setHeld, () => setError('MetaMask would not say which accounts it holds'))
  }, [])

  const token = holdings.find((entry) => entry.token.address === picked)
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
  const target = recipient.trim()
  const same = (address: string | null) => address?.toLowerCase() === source.toLowerCase()
  // A token sent to its own contract lands in a balance no key can move
  const lost = token !== undefined && target.toLowerCase() === token.token.address
  // Only an H160 can hold a token, so no Numen address is offered
  const others = accounts.flatMap((account) =>
    account.evmAddress && !same(account.evmAddress)
      ? [{ address: account.evmAddress, name: account.name }]
      : [],
  )
  const ready = token ? isEvmAddress(target) && !same(target) && !lost : to !== '' && !itself
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

    const decimals = token?.token.decimals
    const problem = amountProblem(amount, 1n, decimals)
    if (problem) {
      setError(problem)
      return false
    }
    const planck = parseAmount(amount, decimals)
    if (planck > (token?.balance ?? movable)) {
      setError('More than that address can send')
      return false
    }
    if (!facts) return false

    setBusy(true)
    const sending = token
      ? sendToken(network, facts, source, token.token.address, target, planck)
      : withdrawToSubstrate(network, facts, source, publicKeyOf(to), planck)
    sending.then(
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
      <Modal title="Send from MetaMask" submitLabel="Done" cancelLabel={null} onClose={onClose}>
        <p className={LEDE}>
          No MetaMask on this browser. It holds the key to the EVM address, so nothing here can
          move those funds without it.
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      title="Send from MetaMask"
      submitLabel="Ask MetaMask"
      busy={busy}
      disabled={!signable || !ready || !facts}
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

      <Field label="Token" aside={token && `holds ${tokenAmount(token)} ${token.token.symbol}`}>
        <Select
          value={token ? picked : COIN}
          onValueChange={setPicked}
          options={[
            {
              value: COIN,
              label: facts?.symbol ?? '',
              icon: mark(COIN_ICON),
              detail: formatAmount(there, { precision: 4 }),
            },
            ...holdings.map((holding) => ({
              value: holding.token.address,
              label: `${holding.token.symbol}, ${holding.token.name}`,
              icon: mark(holding.token.icon),
              detail: tokenAmount(holding),
            })),
          ]}
          label="Token"
          className={INSIDE}
        >
          {mark(token?.token.icon ?? COIN_ICON)}
        </Select>
      </Field>

      {token ? (
        <>
          <AddressField
            label="To"
            value={recipient}
            onChange={setRecipient}
            accounts={others}
            evm
          />
          {same(target) && (
            <p className="mt-1.5 text-[12.5px] text-destructive">That is the address sending it</p>
          )}
          {lost && (
            <p className="mt-1.5 text-[12.5px] text-destructive">
              That is the token's own contract. Anything sent there is gone for good
            </p>
          )}
        </>
      ) : (
        <>
          <AddressField label="Into" value={to} onChange={setTo} accounts={accounts} readOnly />
          {itself && (
            <p className="mt-1.5 text-[12.5px] text-destructive">
              This account is that EVM address, so its balance is already here
            </p>
          )}
        </>
      )}

      <AmountField
        label="Amount"
        value={amount}
        onChange={setAmount}
        max={token?.balance ?? sendable}
        unit={token?.token}
      />
      <FieldError>{error}</FieldError>

      {!token && fee !== null && (
        <p className={cn('mt-2.5', NOTE)}>
          MAX keeps {formatAmount(fee, { precision: 6 })} {facts?.symbol ?? ''} back for gas.
        </p>
      )}
    </Modal>
  )
}
