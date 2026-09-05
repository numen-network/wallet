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

/**
 * The account a pallet owns, which frame derives by writing the type tag, the
 * pallet id and trailing zeros into the 32 bytes an address takes. Nobody holds
 * a key to one, so the runtime is the only thing that spends what lands there.
 */
export function palletAccount(palletId: Uint8Array): string {
  const raw = new Uint8Array(32)
  raw.set(stringToU8a('modl'))
  raw.set(palletId, 4)
  return encodeAddress(raw, SS58_PREFIX)
}

/** Numen addresses are long. Show enough on each end to be checkable by eye. */
export function shorten(
  address: string,
  options: { full?: boolean | undefined; evm?: boolean | undefined } = {},
): string {
  if (options.full) return address
  const [head, tail] = options.evm ? [6, 4] : [7, 4]
  if (address.length <= head + tail + 1) return address
  return `${address.slice(0, head)}…${address.slice(-tail)}`
}

/** The 32 bytes an address encodes, which is what the EVM side asks for. */
export function publicKeyOf(address: string): string {
  return u8aToHex(decodeAddress(address))
}

/**
 * Whatever was pasted in, as the address the chain takes. An EVM address maps
 * one way onto its Numen account, so either form is an answer here.
 */
export function resolveAddress(input: string): string | null {
  const trimmed = input.trim()
  if (isEvmAddress(trimmed)) return evmToSubstrate(trimmed)
  if (isSubstrateAddress(trimmed)) return toNumenAddress(trimmed)
  return null
}
