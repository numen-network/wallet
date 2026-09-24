import { afterEach, describe, expect, it, vi } from 'vitest'
import { isEvmAddress } from '@/lib/address'
import { defaultNetwork, explorerAccount, explorerToken, NETWORKS, TOKENS } from './config'

const ALICE = 'nu7SVAyQhPoGBJfFg7di66oYTV2KVBBeCw3Gt9qTRE2zpSUyb'

describe('the explorer link', () => {
  it('points at the account page of the network in use', () => {
    expect(explorerAccount(NETWORKS.mainnet, ALICE)).toBe(
      `https://explorer.numen-network.org/account/${ALICE}`,
    )
    expect(explorerAccount(NETWORKS.testnet, ALICE)).toBe(
      `https://testnet.explorer.numen-network.org/account/${ALICE}`,
    )
  })

  it('points at the token page of the network in use', () => {
    const token = '0xa1795b3c6f74866c7def1df390f9e2e403dca2e9'
    expect(explorerToken(NETWORKS.mainnet, token)).toBe(
      `https://explorer.numen-network.org/token/${token}`,
    )
  })

  it('leaves no network without one', () => {
    for (const network of Object.values(NETWORKS)) {
      expect(network.explorer).toMatch(/^https?:\/\//)
      expect(network.explorer.endsWith('/')).toBe(false)
    }
  })
})

describe('the network a deployment opens on', () => {
  const servedFrom = (hostname: string) => vi.stubGlobal('location', { hostname })

  afterEach(() => vi.unstubAllGlobals())

  it('follows the host the wallet was served from', () => {
    servedFrom('wallet.numen-network.org')
    expect(defaultNetwork()).toBe('mainnet')

    servedFrom('testnet.wallet.numen-network.org')
    expect(defaultNetwork()).toBe('testnet')
  })

  it('falls to the local node anywhere else', () => {
    servedFrom('localhost')
    expect(defaultNetwork()).toBe('local')

    servedFrom('wallet-preview.pages.dev')
    expect(defaultNetwork()).toBe('local')
  })
})

describe('the tokens the wallet shows', () => {
  const tokens = Object.values(TOKENS).flat()

  it('names each contract in lowercase, since every lookup compares lowercase', () => {
    for (const { address } of tokens) {
      expect(isEvmAddress(address)).toBe(true)
      expect(address).toBe(address.toLowerCase())
    }
  })
})
