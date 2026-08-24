import type { WalletAccount } from '@/signing/types'

export type AccountSource = 'extension' | 'keystore' | 'multisig' | 'proxied' | 'watch'

/**
 * One card in the wallet. `address` is always Numen SS58 and doubles as the id
 * the layout keys on, so an account keeps its group no matter which prefix the
 * extension handed it over in.
 *
 * `evmAddress` is set only for accounts that arrived as an H160. See
 * `evmToSubstrate` for why the pair cannot be built the other way round.
 */
export interface Account {
  address: string
  evmAddress: string | null
  name: string
  source: AccountSource
  /**
   * Ready to sign right now. A local key is null until its password unlocks it
   * for one transfer, which is not the same thing as having no key at all.
   */
  signing: WalletAccount | null
  /**
   * Set for a multisig, since every call it makes has to name the whole set.
   * `mine` is the part of that set this wallet could put a signature from.
   */
  multisig: { threshold: number; signatories: string[]; mine: string[] } | null
  /** Set for a proxied account, naming the account here that may act for it. */
  proxied: { proxy: string } | null
}

/** Only an account whose key this wallet holds has a password to ask for. */
export function needsPassword(account: Account): boolean {
  return account.source === 'keystore'
}

/**
 * Money leaves a multisig once enough signatories sign and a proxied account
 * through whoever it named, so both need somebody here able to put the call
 * together. Neither signs for itself.
 */
export function canSend(account: Account): boolean {
  if (account.source === 'multisig') return (account.multisig?.mine.length ?? 0) > 0
  if (account.source === 'proxied') return account.proxied !== null
  return signsAlone(account)
}

/**
 * Puts its own name to a call, rather than gathering signatures or acting
 * through somebody else. Most dialogs ask for one, since wrapping a call for a
 * multisig is work each of them has to do for itself.
 */
export function signsAlone(account: Account): boolean {
  return account.source === 'extension' || account.source === 'keystore'
}

/**
 * Who here can put a call together for this account. A multisig wants one of
 * its signatories and a proxied account the proxy it named. An account that
 * signs for itself wants nobody, so it gets nobody.
 */
export function signersFor(account: Account, accounts: Account[]): Account[] {
  return accounts.filter((entry) =>
    account.proxied
      ? entry.address === account.proxied.proxy
      : (account.multisig?.mine ?? []).includes(entry.address),
  )
}
