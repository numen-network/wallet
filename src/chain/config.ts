/**
 * What the wallet has to know before it has asked the chain anything, plus the
 * endpoints it can ask. Every runtime constant is read through
 * `ChainRepository.facts()` instead, so nothing here restates one.
 */

export const SS58_PREFIX = 14240

/** Balances carry 18 decimals to stay EVM native, so every amount is a bigint. */
export const DECIMALS = 18

export const UNIT = 10n ** BigInt(DECIMALS)

/**
 * What the automated registrar charges for one checked sign in, mirrored from
 * the judge's REGISTRAR_FEE_NUMN in website-id. The judge refuses records that
 * paid less, so a price change lands there and here together.
 */
export const IDENTITY_CHECK_FEE = 10n * UNIT

export type NetworkId = 'mainnet' | 'testnet' | 'local'

export interface Network {
  /** One of NetworkId for the three that ship, or custom-<url> for the rest. */
  id: string
  name: string
  rpc: string
  /** Where an account's history lives. The wallet links, it does not index. */
  explorer: string
  /** Where a registrar proves the social channels an identity claims. */
  identitySite: string
}

export const NETWORKS: Record<NetworkId, Network> = {
  mainnet: {
    id: 'mainnet',
    name: 'Numen',
    rpc: 'wss://rpc.numen-network.org',
    explorer: 'https://explorer.numen-network.org',
    identitySite: 'https://id.numen-network.org',
  },
  testnet: {
    id: 'testnet',
    name: 'Numen Testnet',
    rpc: 'wss://testnet.rpc.numen-network.org',
    explorer: 'https://testnet.explorer.numen-network.org',
    identitySite: 'https://testnet.id.numen-network.org',
  },
  local: {
    id: 'local',
    name: 'Numen Local',
    rpc: 'ws://127.0.0.1:9944',
    explorer: 'http://127.0.0.1:3000',
    identitySite: 'https://testnet.id.numen-network.org',
  },
}

/**
 * Each deployment host serves one chain, so the address the wallet was loaded
 * from picks the network it opens on. Matching is exact. Anything else is
 * somebody running the wallet themselves, and their node is on their machine.
 */
const HOSTS: Record<string, NetworkId> = {
  'wallet.numen-network.org': 'mainnet',
  'testnet.wallet.numen-network.org': 'testnet',
}

export function defaultNetwork(): NetworkId {
  return HOSTS[location.hostname] ?? 'local'
}

/** The page the explorer serves for one account, history and all. */
export function explorerAccount(network: Network, address: string): string {
  return `${network.explorer}/account/${address}`
}

/** One submitted call, which is all the wallet has to point at after it lands. */
export function explorerExtrinsic(network: Network, hash: string): string {
  return `${network.explorer}/extrinsic/${hash}`
}

/** Where a referendum is kept once the wallet stops carrying it, and while it runs. */
export function explorerReferendum(network: Network, index: number): string {
  return `${network.explorer}/referendum/${index}`
}

/** Every referendum there has ever been, which the wallet does not hold. */
export function explorerGovernance(network: Network): string {
  return `${network.explorer}/governance`
}
