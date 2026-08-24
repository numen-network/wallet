import { describe, expect, it } from 'vitest'
import { UNIT } from '@/chain/config'
import { publicKeyOf } from '@/lib/address'
import { withdrawCall } from './metamask'

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
