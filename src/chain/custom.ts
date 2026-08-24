import { NETWORKS, type Network } from './config'

/**
 * Nodes the user added. The wallet ships with three, and anybody running their
 * own has nowhere to point it otherwise.
 *
 * A custom endpoint is another node for the same chain, so it carries Numen's
 * parameters and only the address changes. Point it at a different chain and the
 * numbers on screen will be that chain's, read with Numen's decimals.
 */

const STORAGE_KEY = 'numen-wallet-endpoints-v1'

export class EndpointError extends Error {}

/** Plain websockets travel in the clear, which is only defensible on this machine. */
const LOOPBACK = ['localhost', '127.0.0.1', '[::1]', '::1']

export function checkEndpoint(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    throw new EndpointError('Enter a websocket address, such as wss://rpc.example.com')
  }

  if (parsed.protocol === 'ws:' && !LOOPBACK.includes(parsed.hostname)) {
    throw new EndpointError('Plain ws is only allowed to this machine. Use wss for anything else')
  }
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new EndpointError('An RPC endpoint is a websocket, so ws or wss')
  }

  return parsed.toString().replace(/\/$/, '')
}

function read(): Network[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as Network[]).filter(isEndpoint) : []
  } catch {
    return []
  }
}

function isEndpoint(value: unknown): value is Network {
  if (typeof value !== 'object' || value === null) return false
  const network = value as Partial<Network>
  return typeof network.id === 'string' && typeof network.rpc === 'string'
}

function write(networks: Network[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(networks))
}

export function customNetworks(): Network[] {
  return read()
}

/** Everything the wallet ships with, then everything the user added. */
export function allNetworks(): Network[] {
  return [...Object.values(NETWORKS), ...read()]
}

export function addEndpoint(name: string, url: string): Network {
  const rpc = checkEndpoint(url)
  const held = read()

  if (allNetworks().some((network) => network.rpc === rpc)) {
    throw new EndpointError('That endpoint is already in the list')
  }

  const network: Network = {
    ...NETWORKS.mainnet,
    id: `custom-${rpc}`,
    name: name.trim() || parsedName(rpc),
    rpc,
  }

  write([...held, network])
  return network
}

const parsedName = (rpc: string) => new URL(rpc).host

export function removeEndpoint(id: string): void {
  write(read().filter((network) => network.id !== id))
}
