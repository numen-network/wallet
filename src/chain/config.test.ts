import { describe, expect, it } from 'vitest'
import { explorerAccount, NETWORKS } from './config'

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

  it('leaves no network without one', () => {
    for (const network of Object.values(NETWORKS)) {
      expect(network.explorer).toMatch(/^https?:\/\//)
      expect(network.explorer.endsWith('/')).toBe(false)
    }
  })
})
