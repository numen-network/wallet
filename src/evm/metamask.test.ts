import { afterEach, describe, expect, it } from 'vitest'
import { NETWORKS, UNIT } from '@/chain/config'
import { createMockRepository } from '@/chain/mock'
import { publicKeyOf } from '@/lib/address'
import { withdrawCall, withdrawFee } from './metamask'

const ALICE = 'nu7SVAyQhPoGBJfFg7di66oYTV2KVBBeCw3Gt9qTRE2zpSUyb'
const KEY = 'd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d'

describe('the call that brings funds back from the EVM', () => {
  it('is withdraw(bytes32,uint256) over the account and the amount', () => {
    expect(withdrawCall(publicKeyOf(ALICE), UNIT)).toBe(
      `0x040cf020${KEY}${'0de0b6b3a7640000'.padStart(64, '0')}`,
    )
  })

  it('pads both arguments to a full word, whatever they are', () => {
    const call = withdrawCall(`0x${KEY}`, 1n)

    expect(call).toHaveLength(2 + 8 + 64 + 64)
    expect(call.endsWith(`${'0'.repeat(63)}1`)).toBe(true)
  })

  it('takes the key with or without its prefix, since both name the same account', () => {
    expect(withdrawCall(KEY, UNIT)).toBe(withdrawCall(`0x${KEY}`, UNIT))
  })
})

describe('the chain the fee is priced on', () => {
  const FROM = '0xf24FF3a9CF04c71Dbc94D0b566f7A27B94566cac'

  afterEach(() => {
    delete (globalThis as { ethereum?: unknown }).ethereum
  })

  const answering = (chainId: string, asked: { method: string; params?: unknown[] }[]) => {
    ;(globalThis as { ethereum?: unknown }).ethereum = {
      request(args: { method: string; params?: unknown[] }) {
        asked.push(args)
        if (args.method === 'eth_chainId') return Promise.resolve(chainId)
        return Promise.resolve(args.method === 'eth_estimateGas' ? '0x6086' : '0x3b9aca00')
      },
    }
  }

  it('leaves MetaMask alone when it already sits on Numen', async () => {
    const facts = await createMockRepository().facts()
    const asked: { method: string; params?: unknown[] }[] = []
    answering(`0x${facts.evmChainId.toString(16)}`, asked)

    await withdrawFee(NETWORKS.local, facts, FROM, `0x${KEY}`)

    expect(asked.some((args) => args.method === 'wallet_addEthereumChain')).toBe(false)
  })

  it('points MetaMask at Numen before pricing anything', async () => {
    const facts = await createMockRepository().facts()
    const asked: { method: string; params?: unknown[] }[] = []
    answering('0x1', asked)

    await withdrawFee(NETWORKS.local, facts, FROM, `0x${KEY}`)

    const order = asked.map((args) => args.method)
    expect(order.indexOf('wallet_addEthereumChain')).toBeLessThan(order.indexOf('eth_estimateGas'))
  })
})
