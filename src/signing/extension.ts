import { connectInjectedExtension, getInjectedExtensions } from 'polkadot-api/pjs-signer'
import type { SignerBackend, WalletAccount } from './types'

/** The only backend enabled in v1. It adds no dependency beyond PAPI itself. */
export const extensionBackend: SignerBackend = {
  source: 'extension',
  label: 'Browser extension',

  async isAvailable() {
    return getInjectedExtensions().length > 0
  },

  async connect(): Promise<WalletAccount[]> {
    const names = getInjectedExtensions()
    const connections = await Promise.all(names.map((name) => connectInjectedExtension(name)))

    return connections.flatMap((extension) =>
      extension.getAccounts().map((account) => ({
        address: account.address,
        label: account.name ?? account.address,
        source: 'extension' as const,
        signer: account.polkadotSigner,
      })),
    )
  },
}
