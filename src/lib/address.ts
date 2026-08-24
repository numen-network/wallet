import { hexToU8a, stringToU8a, u8aConcat, u8aToHex } from '@polkadot/util'
import { blake2AsU8a, decodeAddress, encodeAddress, isEthereumAddress } from '@polkadot/util-crypto'
import { SS58_PREFIX } from '@/chain/config'

/** Re-encodes any valid SS58 into Numen's prefix, so one account has one id. */
export function toNumenAddress(address: string): string {
  return encodeAddress(decodeAddress(address), SS58_PREFIX)
}

export function isSubstrateAddress(address: string): boolean {
  // decodeAddress happily eats raw hex, which would let an EVM address through
  if (address.startsWith('0x')) return false
  try {
    return decodeAddress(address).length === 32
  } catch {
    return false
  }
}

export function isEvmAddress(address: string): boolean {
  return isEthereumAddress(address)
}

/**
 * pallet-evm maps H160 onto AccountId32 with blake2_256("evm:" ++ h160), and
 * both names then point at one balance. The mapping is a hash, so it only
 * walks this way. An sr25519 account has no H160 and must never be shown one.
 * Money sent to a made up address is money nobody holds the key to.
 */
export function evmToSubstrate(evmAddress: string): string {
  const payload = u8aConcat(stringToU8a('evm:'), hexToU8a(evmAddress))
  return encodeAddress(blake2AsU8a(payload, 256), SS58_PREFIX)
}

/** Numen addresses are long. Show enough on each end to be checkable by eye. */
export function shorten(address: string, head = 7, tail = 5): string {
  if (address.length <= head + tail + 1) return address
  return `${address.slice(0, head)}…${address.slice(-tail)}`
}

export function shortenEvm(address: string): string {
  return shorten(address, 6, 4)
}

/**
 * Whatever was pasted in, as the address the chain takes. An EVM address maps
 * one way onto its Numen account, so either form is an answer here.
 */
/** The 32 bytes an address encodes, which is what the EVM side asks for. */
export function publicKeyOf(address: string): string {
  return u8aToHex(decodeAddress(address))
}

export function resolveAddress(input: string): string | null {
  const trimmed = input.trim()
  if (isEvmAddress(trimmed)) return evmToSubstrate(trimmed)
  if (isSubstrateAddress(trimmed)) return toNumenAddress(trimmed)
  return null
}
