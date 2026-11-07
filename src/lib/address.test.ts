import { beforeAll, describe, expect, it } from 'vitest'
import { hexToU8a, stringToU8a, u8aConcat, u8aToHex } from '@polkadot/util'
import { blake2AsU8a, cryptoWaitReady, decodeAddress, keccakAsU8a } from '@polkadot/util-crypto'
import {
  frontierAccount,
  isEvmAddress,
  isSubstrateAddress,
  palletAccount,
  resolveAddress,
  reviveAccount,
  reviveAddress,
  shorten,
  toNumenAddress,
} from './address'

const ALICE_PUBLIC_KEY = '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d'
const ALICE_GENERIC = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'
const ALICE_NUMEN = 'nu7SVAyQhPoGBJfFg7di66oYTV2KVBBeCw3Gt9qTRE2zpSUyb'

/** What ReviveApi.address answers for Alice on a 10200 dev chain. */
const ALICE_H160 = '0x9621dde636de098b43efb0fa9b61facfe328f99d'

const H160 = '0x1234567890abcdef1234567890abcdef12345678'
const H160_FRONTIER = 'nu2uaQWzSyDzXHrgd78sQL2871qL2LpPU6kHeeb4ETtXfnASg'
const H160_REVIVE = 'nu347WpTCXVBp91rqygK1XLhSGitvqc2xfSwTD8YAPqyaNtuu'

const TREASURY_PALLET_ID = stringToU8a('py/trsry')
const TREASURY = 'nu57jR3GB3XHGGDYiG5Hx7f8NBK5yMvgPNedmiFFoBA6fbxKX'

beforeAll(async () => {
  // Without this the hashing falls back to the JS path and the two
  // implementations below would be the same code twice
  await cryptoWaitReady()
})

const upper = (h160: string) => h160.toUpperCase().replace('0X', '0x')

describe('frontierAccount', () => {
  it('is the mapping Frontier used, blake2_256 over "evm:" and the H160', () => {
    const expected = blake2AsU8a(u8aConcat(stringToU8a('evm:'), hexToU8a(H160)), 256)
    expect(u8aToHex(decodeAddress(frontierAccount(H160)))).toBe(u8aToHex(expected))
  })

  it('agrees between the wasm and the pure JS hasher', () => {
    const payload = u8aConcat(stringToU8a('evm:'), hexToU8a(H160))
    expect(u8aToHex(blake2AsU8a(payload, 256, null, true))).toBe(
      u8aToHex(blake2AsU8a(payload, 256)),
    )
  })

  it('holds its value, a change here claims from an account that holds nothing', () => {
    expect(frontierAccount(H160)).toBe(H160_FRONTIER)
  })

  it('encodes into Numen, not the generic prefix', () => {
    expect(decodeAddress(frontierAccount(H160)).length).toBe(32)
    expect(frontierAccount(H160)).toBe(toNumenAddress(frontierAccount(H160)))
  })

  it('ignores the case an address is written in', () => {
    expect(frontierAccount(H160.toLowerCase())).toBe(frontierAccount(upper(H160)))
  })

  it('gives every H160 its own account', () => {
    const other = '0x1234567890abcdef1234567890abcdef12345679'
    expect(frontierAccount(other)).not.toBe(frontierAccount(H160))
  })
})

describe('reviveAccount', () => {
  it('pads the H160 out with twelve 0xEE bytes', () => {
    expect(u8aToHex(decodeAddress(reviveAccount(H160)))).toBe(`${H160}${'ee'.repeat(12)}`)
  })

  it('holds its value, a change here sends funds to a different account', () => {
    expect(reviveAccount(H160)).toBe(H160_REVIVE)
  })

  it('ignores the case an address is written in', () => {
    expect(reviveAccount(upper(H160))).toBe(reviveAccount(H160))
  })
})

describe('reviveAddress', () => {
  it('takes the last 20 bytes of keccak256 over the account', () => {
    const hashed = keccakAsU8a(hexToU8a(ALICE_PUBLIC_KEY))
    expect(reviveAddress(ALICE_NUMEN)).toBe(u8aToHex(hashed.subarray(12)))
  })

  it('holds its value, the H160 the chain gives Alice', () => {
    expect(reviveAddress(ALICE_NUMEN)).toBe(ALICE_H160)
  })

  it('hands a padded account its own H160 back', () => {
    expect(reviveAddress(reviveAccount(H160))).toBe(H160)
  })
})

describe('resolveAddress', () => {
  it('takes a Numen address in whatever prefix it came in', () => {
    expect(resolveAddress(` ${ALICE_GENERIC} `)).toBe(ALICE_NUMEN)
  })

  it('leaves an H160 to the chain, which knows the account it spends from', () => {
    expect(resolveAddress(H160)).toBeNull()
  })

  it('refuses anything else', () => {
    expect(resolveAddress('nu7')).toBeNull()
  })
})

describe('palletAccount', () => {
  it('holds its value, a change here sends the check fee somewhere else', () => {
    expect(palletAccount(TREASURY_PALLET_ID)).toBe(TREASURY)
  })

  it('writes the type tag, the pallet id and zeros into the 32 bytes', () => {
    const raw = decodeAddress(palletAccount(TREASURY_PALLET_ID))
    expect(raw.length).toBe(32)
    expect(u8aToHex(raw.slice(0, 4))).toBe(u8aToHex(stringToU8a('modl')))
    expect(u8aToHex(raw.slice(4, 12))).toBe(u8aToHex(TREASURY_PALLET_ID))
    expect(raw.slice(12).every((byte) => byte === 0)).toBe(true)
  })

  it('gives every pallet its own account', () => {
    expect(palletAccount(stringToU8a('py/bount'))).not.toBe(palletAccount(TREASURY_PALLET_ID))
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
    expect(shorten(ALICE_NUMEN)).toBe('nu7SVAy…SUyb')
  })

  it('cuts anything in 0x to four digits on each side', () => {
    expect(shorten(H160)).toBe('0x1234…5678')
    expect(shorten(ALICE_PUBLIC_KEY)).toBe('0xd435…a27d')
  })

  it('hands back the whole address when asked', () => {
    expect(shorten(ALICE_NUMEN, { full: true })).toBe(ALICE_NUMEN)
  })

  it('leaves anything already short alone', () => {
    expect(shorten('nu7abc')).toBe('nu7abc')
  })
})
