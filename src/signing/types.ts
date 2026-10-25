import type { InjectedPolkadotAccount } from 'polkadot-api/pjs-signer'

export type SignerSource = 'extension' | 'keystore'

export interface WalletAccount {
  address: string
  label: string
  source: SignerSource
  signer: InjectedPolkadotAccount['txCreator']
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
