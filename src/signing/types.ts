import type { PolkadotSigner } from 'polkadot-api'

export type SignerSource = 'extension' | 'keystore'

export interface WalletAccount {
  address: string
  label: string
  source: SignerSource
  signer: PolkadotSigner
}

/**
 * Each source is independent so any one of them can be dropped from a build.
 * A compromised keystore path must not be reachable from an extension only
 * deployment.
 */
export interface SignerBackend {
  source: SignerSource
  label: string
  isAvailable(): Promise<boolean>
  connect(): Promise<WalletAccount[]>
}
