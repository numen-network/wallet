import { useState } from 'react'
import { useChain } from '@/chain/provider'
import { useSymbol, useTokenQuote } from '@/chain/queries'
import type { Holding, Operation } from '@/chain/types'
import { amountProblem, formatAmount, parseAmount } from '@/lib/balance'
import { FieldError } from '@/components/ui/field'
import { useField } from '@/ui/reopen'
import { AddressField } from './AddressField'
import { AmountField } from './AmountField'
import { CallModal, SignerField, useCall, useSigning } from './Authorize'
import { TokenField, tokenReaches, TokenRecipientField } from './TokenFields'
import { useHoldings } from './tokens'
import type { Account } from './types'

/**
 * A Numen account moves a token its H160 holds by calling the contract itself,
 * signed like any other call. The chain caps a contract call at the weight and
 * deposit it was given, so the transfer is dry run first and goes out capped at
 * what that took.
 */
export function TokenSendModal({
  account,
  source,
  accounts,
  signers,
  initial,
  onClose,
}: {
  account: Account
  /** The H160 the chain maps to the account, which is what holds the token. */
  source: string
  accounts: Account[]
  signers: Account[]
  initial: Holding
  onClose: () => void
}) {
  const { repository } = useChain()
  const symbol = useSymbol()
  // Until the chain answers, the holding the dialog opened with stands in for it
  const holdings = useHoldings(source) ?? [initial]
  const [picked, setPicked] = useField('token', initial.token.address)
  const [to, setTo] = useField('to', '')
  const [amount, setAmount] = useField('amount', '')
  const [toError, setToError] = useState('')
  const [amountError, setAmountError] = useState('')
  const call = useCall(onClose)
  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)

  const holding = holdings.find((entry) => entry.token.address === picked)
  const target = to.trim()
  const reaches = holding !== undefined && tokenReaches(source, holding.token.address, target)
  // Priced on the smallest amount to the real recipient, so a balance it has yet
  // to start shows up. Until there is a recipient, the sender's H160 stands in
  const probe = holding && {
    from: account.address,
    token: holding.token.address,
    to: reaches ? target : source,
    amount: 1n,
  }
  const { data: quote } = useTokenQuote(probe ?? null)
  const token = holding && {
    address: holding.token.address,
    symbol: holding.token.symbol,
    decimals: holding.token.decimals,
  }
  const priced: Operation | null =
    probe && token && quote
      ? wrap({ kind: 'sendToken', token, to: probe.to, amount: 1n, limits: quote.limits })
      : null

  const form = () => {
    if (!holding || !token) return false
    setToError(reaches ? '' : 'Enter an EVM address other than the sender and the token')

    const problem = amountProblem(amount, 1n, token.decimals)
    if (problem) {
      setAmountError(problem)
      return false
    }
    const planck = parseAmount(amount, token.decimals)
    if (planck > holding.balance) {
      setAmountError('More than this account holds')
      return false
    }
    setAmountError('')
    if (!reaches) return false

    // Measured again on the real amount, since sending the last of a balance
    // frees a slot and the cap has to fit what this transfer does
    return call.run(
      repository
        .quoteTokenTransfer(account.address, token.address, target, planck)
        .then(({ limits }) =>
          submit({ kind: 'sendToken', token, to: target, amount: planck, limits }, call.password),
        ),
    )
  }

  const notes = [
    quote && quote.deposit > 0n && `${formatAmount(quote.deposit, { precision: 6 })} ${symbol} storage deposit`,
    account.multisig &&
      `Needs any ${account.multisig.threshold} of ${account.multisig.signatories.length} signatures`,
  ].filter(Boolean)

  return (
    <CallModal
      title={`Send ${holding?.token.symbol ?? initial.token.symbol}`}
      submitLabel="Sign and send"
      busy={call.busy}
      footNote={notes.length > 0 && notes.join('. ')}
      from={signer.address}
      needsPassword={needsPassword}
      operation={priced}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      note="Unlocks this account for one transfer"
      onClose={onClose}
      onSubmit={form}
    >
      <AddressField
        label="From"
        value={source}
        onChange={() => {}}
        accounts={[{ address: source, name: account.name }]}
        evm
        readOnly
      />

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />

      <TokenField holdings={holdings} picked={picked} onPick={setPicked} />

      <TokenRecipientField
        source={source}
        token={picked}
        accounts={accounts}
        value={to}
        onChange={setTo}
      />
      <FieldError>{toError}</FieldError>

      <AmountField
        label="Amount"
        value={amount}
        onChange={setAmount}
        max={holding?.balance ?? 0n}
        unit={holding?.token}
      />
      <FieldError>{amountError}</FieldError>
    </CallModal>
  )
}
