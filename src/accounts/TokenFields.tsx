import logo from '@/assets/logo.svg'
import type { Holding, Token } from '@/chain/types'
import { isEvmAddress } from '@/lib/address'
import { Field, INSIDE } from '@/ui/Field'
import { Select } from '@/ui/Select'
import { AddressField } from './AddressField'
import { TokenMark } from './TokenMark'
import { tokenAmount } from './tokens'
import type { Account } from './types'
import { useEvmRecipients } from './useAccounts'

/** The Token box's value for the coin, which no contract address can clash with. */
export const COIN = 'coin'

/** Sized to the tick's column, so every row reads from the same left edge. */
const mark = (token: Pick<Token, 'icon'>) => <TokenMark token={token} className="size-3.5" />

const COIN_MARK = mark({ icon: logo })

/** Which token goes. The coin is on offer only where the dialog can move it too. */
export function TokenField({
  holdings,
  picked,
  onPick,
  coin,
}: {
  holdings: Holding[]
  picked: string
  onPick: (address: string) => void
  coin?: { symbol: string; held: string }
}) {
  const holding = holdings.find((entry) => entry.token.address === picked)

  return (
    <Field label="Token" aside={holding && `holds ${tokenAmount(holding)} ${holding.token.symbol}`}>
      <Select
        value={holding || !coin ? picked : COIN}
        onValueChange={onPick}
        options={[
          ...(coin ? [{ value: COIN, label: coin.symbol, icon: COIN_MARK, detail: coin.held }] : []),
          ...holdings.map((entry) => ({
            value: entry.token.address,
            label: `${entry.token.symbol}, ${entry.token.name}`,
            icon: mark(entry.token),
            detail: tokenAmount(entry),
          })),
        ]}
        label="Token"
        className={INSIDE}
      >
        {holding ? mark(holding.token) : coin && COIN_MARK}
      </Select>
    </Field>
  )
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** Whether a token can go to this address from that one and still be spendable. */
export function tokenReaches(source: string, token: string, target: string): boolean {
  return isEvmAddress(target) && !same(target, source) && !same(target, token)
}

/** Only an H160 can hold a token, so the box offers the wallet's accounts under theirs. */
export function TokenRecipientField({
  source,
  token,
  accounts,
  value,
  onChange,
}: {
  /** The H160 sending it. */
  source: string
  token: string
  accounts: Account[]
  value: string
  onChange: (value: string) => void
}) {
  const target = value.trim()
  const others = useEvmRecipients(accounts).filter((entry) => !same(entry.address, source))

  return (
    <>
      <AddressField label="To" value={value} onChange={onChange} accounts={others} evm />
      {same(target, source) && (
        <p className="mt-1.5 text-[12.5px] text-destructive">That is the address sending it</p>
      )}
      {same(target, token) && (
        <p className="mt-1.5 text-[12.5px] text-destructive">
          That is the token's own contract. Anything sent there is gone for good
        </p>
      )}
    </>
  )
}
