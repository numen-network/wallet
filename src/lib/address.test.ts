import { beforeAll, describe, expect, it } from 'vitest'
import { hexToU8a, stringToU8a, u8aConcat, u8aToHex } from '@polkadot/util'
import { blake2AsU8a, cryptoWaitReady, decodeAddress } from '@polkadot/util-crypto'
import { SS58_PREFIX } from '@/chain/config'
import {
  evmToSubstrate,
  isEvmAddress,
  isSubstrateAddress,
  shorten,
  shortenEvm,
  toNumenAddress,
} from './address'

const ALICE_PUBLIC_KEY = '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d'
const ALICE_GENERIC = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'
const ALICE_NUMEN = 'nu7SVAyQhPoGBJfFg7di66oYTV2KVBBeCw3Gt9qTRE2zpSUyb'

const H160 = '0x1234567890abcdef1234567890abcdef12345678'
const H160_MIRROR = 'nu2uaQWzSyDzXHrgd78sQL2871qL2LpPU6kHeeb4ETtXfnASg'

beforeAll(async () => {
  // Without this the hashing falls back to the JS path and the two
  // implementations below would be the same code twice
  await cryptoWaitReady()
})

describe('evmToSubstrate', () => {
  it('is the mapping the runtime uses, blake2_256 over "evm:" and the H160', () => {
    const expected = blake2AsU8a(u8aConcat(stringToU8a('evm:'), hexToU8a(H160)), 256)
    expect(u8aToHex(decodeAddress(evmToSubstrate(H160)))).toBe(u8aToHex(expected))
  })

  it('agrees between the wasm and the pure JS hasher', () => {
    const payload = u8aConcat(stringToU8a('evm:'), hexToU8a(H160))
    expect(u8aToHex(blake2AsU8a(payload, 256, null, true))).toBe(
      u8aToHex(blake2AsU8a(payload, 256)),
    )
  })

  it('holds its value, a change here sends funds to a different account', () => {
    expect(evmToSubstrate(H160)).toBe(H160_MIRROR)
  })

  it('encodes into Numen, not the generic prefix', () => {
    expect(decodeAddress(evmToSubstrate(H160)).length).toBe(32)
    expect(evmToSubstrate(H160)).toBe(toNumenAddress(evmToSubstrate(H160)))
  })

  it('ignores the case an address is written in', () => {
    expect(evmToSubstrate(H160.toLowerCase())).toBe(evmToSubstrate(H160.toUpperCase().replace('0X', '0x')))
  })

  it('gives every H160 its own account', () => {
    const other = '0x1234567890abcdef1234567890abcdef12345679'
    expect(evmToSubstrate(other)).not.toBe(evmToSubstrate(H160))
  })
})

describe('toNumenAddress', () => {
  it('re-encodes another network prefix without touching the key', () => {
    expect(toNumenAddress(ALICE_GENERIC)).toBe(ALICE_NUMEN)
    expect(u8aToHex(decodeAddress(ALICE_NUMEN))).toBe(ALICE_PUBLIC_KEY)
  })

  it('leaves an address that already carries the prefix alone', () => {
    expect(toNumenAddress(ALICE_NUMEN)).toBe(ALICE_NUMEN)
  })
})

describe('address kinds', () => {
  it('keeps the two formats apart', () => {
    expect(isSubstrateAddress(ALICE_NUMEN)).toBe(true)
    expect(isSubstrateAddress(H160)).toBe(false)
    expect(isEvmAddress(H160)).toBe(true)
    expect(isEvmAddress(ALICE_NUMEN)).toBe(false)
  })

  it('rejects raw hex that decodes but names no account', () => {
    expect(isSubstrateAddress(ALICE_PUBLIC_KEY)).toBe(false)
  })

  it('rejects junk rather than guessing', () => {
    for (const input of ['', 'nu7', '0x', '0xzzzz', ALICE_NUMEN.slice(0, -1)]) {
      expect(isSubstrateAddress(input)).toBe(false)
      expect(isEvmAddress(input)).toBe(false)
    }
  })
})

describe('shortening', () => {
  it('keeps both ends readable', () => {
    expect(shorten(ALICE_NUMEN)).toBe('nu7SVAy…pSUyb')
    expect(shortenEvm(H160)).toBe('0x1234…5678')
  })

  it('leaves anything already short alone', () => {
    expect(shorten('nu7abc')).toBe('nu7abc')
  })
})
