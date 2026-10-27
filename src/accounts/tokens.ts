import { useMemo } from 'react'
import { create } from 'zustand'
import { useChain } from '@/chain/provider'
import { useImportedTokens, useListedTokens, useTokenBalances } from '@/chain/queries'
import type { Holding, Token } from '@/chain/types'
import { isEvmAddress } from '@/lib/address'
import { formatAmount } from '@/lib/balance'

export const STORAGE_KEY = 'numen-wallet-tokens-v1'

const NO_ADDRESSES: string[] = []

/** A holding to its last digit, since an account's own balance is never shortened. */
export function tokenAmount({ token, balance }: Holding): string {
  return formatAmount(balance, { decimals: token.decimals, precision: token.decimals, pad: false })
}

/** Contracts the user imported, by network id, since a contract lives on one chain. */
export function loadImported(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const stored = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(stored).map(([network, addresses]) => [
        network,
        Array.isArray(addresses)
          ? addresses.filter(
              (address): address is string =>
                typeof address === 'string' &&
                isEvmAddress(address) &&
                address === address.toLowerCase(),
            )
          : [],
      ]),
    )
  } catch {
    return {}
  }
}

function saveImported(imported: Record<string, string[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(imported))
  } catch {
    // A full storage costs an import, which the next visit can redo
  }
}

interface ImportedState {
  imported: Record<string, string[]>
  /** Takes the contract lowercase, which is how the wallet keys a token. */
  add: (network: string, address: string) => void
  remove: (network: string, address: string) => void
}

export const useImportedStore = create<ImportedState>((set) => {
  const update = (network: string, change: (current: string[]) => string[]) =>
    set((state) => {
      const current = state.imported[network] ?? []
      const next = change(current)
      if (next.length === current.length) return state
      const imported = { ...state.imported, [network]: next }
      saveImported(imported)
      return { imported }
    })

  return {
    imported: loadImported(),
    add: (network, address) =>
      update(network, (current) => (current.includes(address) ? current : [...current, address])),
    remove: (network, address) =>
      update(network, (current) => current.filter((entry) => entry !== address)),
  }
})

/**
 * What the user imported on the network the wallet is on, less anything the
 * wallet has listed since. Storage still holds those, so one comes back if the
 * wallet delists it.
 */
export function useImported(): string[] {
  const { network } = useChain()
  const stored = useImportedStore((state) => state.imported[network.id]) ?? NO_ADDRESSES
  const { data: listed } = useListedTokens()

  return useMemo(() => {
    const known = new Set(listed?.map((token) => token.address))
    return stored.filter((address) => !known.has(address))
  }, [stored, listed])
}

/** The listed tokens, then the imported ones. Undefined until both are read. */
export function useTokenList(): Token[] | undefined {
  const { data: listed } = useListedTokens()
  const { data: imported } = useImportedTokens(useImported())
  return useMemo(() => listed && imported && [...listed, ...imported], [listed, imported])
}

/**
 * What an EVM address holds of the tokens the wallet shows. A listed token with
 * a zero balance drops out. An imported one stays, since the user asked for it.
 * Undefined until the list and every balance on it have been read.
 */
export function useHoldings(holder: string | null): Holding[] | undefined {
  const imported = useImported()
  const tokens = useTokenList()
  const balances = useTokenBalances(holder, tokens?.map((token) => token.address) ?? NO_ADDRESSES)

  if (!tokens || tokens.some((token) => balances[token.address] === undefined)) return undefined
  return tokens.flatMap((token) => {
    const balance = balances[token.address] ?? 0n
    return balance > 0n || imported.includes(token.address) ? [{ token, balance }] : []
  })
}
