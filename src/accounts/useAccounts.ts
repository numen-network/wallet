import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isSubstrateAddress, toNumenAddress } from '@/lib/address'
import { availableBackends } from '@/signing'
import type { WalletAccount } from '@/signing/types'
import type { VaultKey } from '@/signing/vault'
import { useAccountsStore } from './store'
import type { Group, MultisigEntry, ProxiedEntry, WatchEntry } from './layout'
import { signsAlone, type Account } from './types'

export interface GroupView {
  group: Group
  accounts: Account[]
}

export class NoExtensionError extends Error {}

interface Declared {
  watch: WatchEntry[]
  multisig: MultisigEntry[]
  proxied: ProxiedEntry[]
}

function merge(
  injected: WalletAccount[],
  keys: VaultKey[],
  declared: Declared,
  names: Record<string, string>,
  hidden: string[],
): Account[] {
  const forgotten = new Set(hidden)
  const merged = new Map<string, Account>()

  for (const account of injected) {
    // The extension is untrusted input, a label or address can be anything
    if (!isSubstrateAddress(account.address)) continue
    const address = toNumenAddress(account.address)
    if (forgotten.has(address)) continue

    merged.set(address, {
      address,
      evmAddress: null,
      name: names[address] ?? account.label,
      source: 'extension',
      multisig: null,
      proxied: null,
      // Carry the Numen form through to signing, so the address a fee is quoted
      // for is the address the transfer leaves from
      signing: { ...account, address },
    })
  }

  // Locked until a password unlocks it for one transfer, hence no signing bundle
  for (const key of keys) {
    if (forgotten.has(key.address) || merged.has(key.address)) continue
    merged.set(key.address, {
      address: key.address,
      evmAddress: null,
      name: names[key.address] ?? key.name,
      source: 'keystore',
      signing: null,
      multisig: null,
      proxied: null,
    })
  }

  // Declared accounts hold no key of their own, so a signer already found wins
  const declare = (
    entry: { address: string; name: string },
    source: Account['source'],
    extra: Pick<Account, 'multisig' | 'proxied'> = { multisig: null, proxied: null },
  ) => {
    if (forgotten.has(entry.address) || merged.has(entry.address)) return
    merged.set(entry.address, {
      address: entry.address,
      evmAddress: null,
      name: names[entry.address] ?? entry.name,
      source,
      signing: null,
      ...extra,
    })
  }

  for (const entry of declared.multisig) {
    declare(entry, 'multisig', {
      multisig: { threshold: entry.threshold, signatories: entry.signatories, mine: [] },
      proxied: null,
    })
  }
  for (const entry of declared.proxied) {
    declare(entry, 'proxied', { multisig: null, proxied: { proxy: entry.proxy } })
  }

  for (const entry of declared.watch) {
    if (forgotten.has(entry.address) || merged.has(entry.address)) continue

    merged.set(entry.address, {
      address: entry.address,
      evmAddress: entry.evmAddress,
      name: names[entry.address] ?? entry.name,
      source: 'watch',
      signing: null,
      multisig: null,
      proxied: null,
    })
  }

  // Which signatories are in here is only knowable once everything is, so a
  // multisig learns what it can sign for after the rest have been collected
  const own = new Set(
    [...merged.values()].filter(signsAlone).map((account) => account.address),
  )
  for (const account of merged.values()) {
    if (account.multisig) {
      account.multisig.mine = account.multisig.signatories.filter((entry) => own.has(entry))
    }
    // A proxy the wallet has since forgotten leaves nothing able to act
    if (account.proxied && !own.has(account.proxied.proxy)) account.proxied = null
  }

  return [...merged.values()]
}

export function useAccounts() {
  const layout = useAccountsStore((s) => s.layout)
  const keys = useAccountsStore((s) => s.keys)
  const reconcile = useAccountsStore((s) => s.reconcile)
  const setExtensionConnected = useAccountsStore((s) => s.setExtensionConnected)
  const [injected, setInjected] = useState<WalletAccount[]>([])

  const connectExtension = useCallback(async () => {
    const backends = await availableBackends()
    if (!backends.length) throw new NoExtensionError('No signing extension found')

    const found = (await Promise.all(backends.map((backend) => backend.connect()))).flat()
    setInjected(found)
    setExtensionConnected(found.length > 0)
    return found.length
  }, [setExtensionConnected])

  // Authorisation survives a reload, so a returning user gets their accounts back
  const resumed = useRef(false)
  useEffect(() => {
    if (resumed.current || !layout.extensionConnected) return
    resumed.current = true
    void connectExtension().catch(() => setExtensionConnected(false))
  }, [layout.extensionConnected, connectExtension, setExtensionConnected])

  const declared = useMemo(
    () => ({ watch: layout.watch, multisig: layout.multisig, proxied: layout.proxied }),
    [layout.watch, layout.multisig, layout.proxied],
  )

  const accounts = useMemo(
    () => merge(injected, keys, declared, layout.names, layout.hidden),
    [injected, keys, declared, layout.names, layout.hidden],
  )

  useEffect(() => {
    reconcile(accounts.map((a) => a.address))
  }, [accounts, reconcile])

  const byAddress = useMemo(
    () => new Map(accounts.map((account) => [account.address, account])),
    [accounts],
  )

  const groups = useMemo<GroupView[]>(
    () =>
      layout.groups.map((group) => ({
        group,
        accounts: group.accounts
          .map((address) => byAddress.get(address))
          .filter((account): account is Account => account !== undefined),
      })),
    [layout.groups, byAddress],
  )

  return { accounts, byAddress, groups, connectExtension }
}
