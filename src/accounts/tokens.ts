import { useTokenBalances, useTokenList } from '@/chain/queries'
import type { Token } from '@/chain/types'
import { formatAmount } from '@/lib/balance'

const NO_ADDRESSES: string[] = []

export interface Holding {
  token: Token
  balance: bigint
}

/** A holding to its last digit, since an account's own balance is never shortened. */
export function tokenAmount({ token, balance }: Holding): string {
  return formatAmount(balance, { decimals: token.decimals, precision: token.decimals, pad: false })
}

/**
 * What an EVM address holds of the tokens the wallet shows, zero balances left
 * out. Undefined until the list and every balance on it have been read.
 */
export function useHoldings(holder: string | null): Holding[] | undefined {
  const { data: tokens } = useTokenList()
  const balances = useTokenBalances(holder, tokens?.map((token) => token.address) ?? NO_ADDRESSES)

  if (!tokens || tokens.some((token) => balances[token.address] === undefined)) return undefined
  return tokens.flatMap((token) => {
    const balance = balances[token.address] ?? 0n
    return balance > 0n ? [{ token, balance }] : []
  })
}
