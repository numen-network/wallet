import { u8aToHex } from '@polkadot/util'
import { keccakAsU8a } from '@polkadot/util-crypto'
import type { Network } from '@/chain/config'
import type { ChainFacts } from '@/chain/types'

/**
 * Numen runs an EVM alongside the substrate side, and MetaMask is where people
 * already keep their EVM habits. Rather than growing a second signing stack the
 * wallet just hands MetaMask the network, and the two split the work.
 */

export interface EvmChainParams {
  chainId: string
  chainName: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpcUrls: string[]
}

// MetaMask speaks HTTP, which a substrate node serves on the socket's own port
const httpRpc = (network: Network) => network.rpc.replace(/^ws/, 'http')

export function evmChainParams(network: Network, facts: ChainFacts): EvmChainParams {
  return {
    // MetaMask reads this as hex and silently mismatches a decimal one
    chainId: `0x${facts.evmChainId.toString(16)}`,
    chainName: network.name,
    nativeCurrency: { name: network.name, symbol: facts.symbol, decimals: facts.decimals },
    rpcUrls: [httpRpc(network)],
  }
}

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}

export function metaMask(): EthereumProvider | null {
  return (globalThis as { ethereum?: EthereumProvider }).ethereum ?? null
}

/** MetaMask's code for a user who clicked away the prompt. Not a failure. */
export const USER_REJECTED = 4001

export function wasRejected(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === USER_REJECTED
}

/**
 * MetaMask checks the endpoint with `eth_chainId` before it will add anything,
 * so the usual failure is a node that is not answering. Its own wording says
 * which, and a generic message here would throw that away.
 */
export function refusalMessage(error: unknown, network: Network): string {
  const detail =
    typeof error === 'object' && error !== null && typeof (error as Error).message === 'string'
      ? (error as Error).message
      : ''

  return detail
    ? `MetaMask refused ${network.name}. ${detail}`
    : `MetaMask could not reach ${httpRpc(network)}`
}

const WITHDRAW = u8aToHex(keccakAsU8a('withdraw(bytes32,uint256)').subarray(0, 4))

const word = (hex: string) => hex.replace(/^0x/, '').padStart(64, '0')

/** A call that moves `amount` from whoever sends it to a substrate account. */
export function withdrawCall(publicKey: string, amount: bigint): string {
  return `${WITHDRAW}${word(publicKey)}${word(amount.toString(16))}`
}

/** Whichever accounts MetaMask has been let into, once the user allows the ask. */
export async function evmAccounts(): Promise<string[]> {
  const provider = metaMask()
  if (!provider) return []

  return (await provider.request({ method: 'eth_requestAccounts' })) as string[]
}

/**
 * What the withdrawal will cost to run, asked of the same node MetaMask is on.
 * The fee comes out of the balance being moved, so the most that can be sent is
 * never the whole of it.
 */
export async function withdrawFee(facts: ChainFacts, from: string, publicKey: string): Promise<bigint> {
  const provider = metaMask()
  if (!provider) throw new Error('No MetaMask found')

  const call = { from, to: facts.balancesErc20, data: withdrawCall(publicKey, 1n) }
  const [gas, price] = (await Promise.all([
    provider.request({ method: 'eth_estimateGas', params: [call] }),
    provider.request({ method: 'eth_gasPrice' }),
  ])) as [string, string]

  return BigInt(gas) * BigInt(price)
}

/**
 * Hands MetaMask a withdrawal to sign. The network goes first because MetaMask
 * signs against whichever chain it is pointed at, and one it has never heard of
 * is one it adds rather than refuses.
 */
export async function withdrawToSubstrate(
  network: Network,
  facts: ChainFacts,
  from: string,
  publicKey: string,
  amount: bigint,
): Promise<void> {
  const provider = metaMask()
  if (!provider) throw new Error('No MetaMask found')

  await addToMetaMask(network, facts)
  await provider.request({
    method: 'eth_sendTransaction',
    params: [{ from, to: facts.balancesErc20, data: withdrawCall(publicKey, amount) }],
  })
}

export async function addToMetaMask(network: Network, facts: ChainFacts): Promise<void> {
  const provider = metaMask()
  if (!provider) throw new Error('No MetaMask found')

  // Adding a chain MetaMask already knows just offers to switch to it
  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [evmChainParams(network, facts)],
  })
}
