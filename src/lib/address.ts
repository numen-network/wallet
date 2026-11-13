import { hexToU8a, stringToU8a, u8aConcat, u8aEq, u8aToHex } from '@polkadot/util'
import {
  blake2AsU8a,
  decodeAddress,
  encodeAddress,
  isEthereumAddress,
  keccakAsU8a,
} from '@polkadot/util-crypto'
import { SS58_PREFIX } from '@/chain/config'
import type { EvmLayer } from '@/chain/types'

/** What pallet-revive pads an H160 out to 32 bytes with. */
const REVIVE_PAD = new Uint8Array(12).fill(0xee)

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
 * Where Frontier kept an H160's balance, blake2_256("evm:" ++ h160). The hash
 * only walks this way and nobody holds a key to the account it lands on, so
 * whatever is still there leaves through EvmClaims.
 */
export function frontierAccount(h160: string): string {
  const payload = u8aConcat(stringToU8a('evm:'), hexToU8a(h160))
  return encodeAddress(blake2AsU8a(payload, 256), SS58_PREFIX)
}

/**
 * The account pallet-revive gives an H160 that no account maps back to, the
 * H160 padded with 0xEE. The H160's own key or code moves its funds. So does the
 * account hashed to that H160, through dispatch_as_fallback_account.
 */
export function reviveAccount(h160: string): string {
  return encodeAddress(u8aConcat(hexToU8a(h160), REVIVE_PAD), SS58_PREFIX)
}

/**
 * Where pallet-revive put what reached this account's H160 before the chain
 * mapped the H160 back to the account. An account padded with 0xEE is its own.
 */
export function fallbackAccount(address: string): string {
  return reviveAccount(reviveAddress(address))
}

/**
 * The account an H160 spends from, as far as the H160 alone tells, which is
 * all a stored EVM account has to go on. pallet-revive first looks for an
 * account mapped to the H160, and only the chain can say whether there is one.
 */
export function mirrorOf(h160: string, evm: EvmLayer): string {
  return evm === 'revive' ? reviveAccount(h160) : frontierAccount(h160)
}

/**
 * The H160 pallet-revive gives an account. A padded account is its H160 and
 * any other takes the last 20 bytes of keccak256 over its 32. Funds sent there
 * only reach the account once OriginalAccount maps the H160 back to it.
 */
export function reviveAddress(address: string): string {
  const raw = decodeAddress(address)
  if (u8aEq(raw.subarray(20), REVIVE_PAD)) return u8aToHex(raw.subarray(0, 20))
  return u8aToHex(keccakAsU8a(raw).subarray(12))
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

/** Addresses, hashes and keys are long. Show enough on each end to be checkable by eye. */
export function shorten(
  value: string,
  options: { full?: boolean | undefined } = {},
): string {
  if (options.full) return value
  const [head, tail] = value.startsWith('0x') ? [6, 4] : [7, 4]
  if (value.length <= head + tail + 1) return value
  return `${value.slice(0, head)}…${value.slice(-tail)}`
}

/** The 32 bytes an address encodes, which is what the EVM side asks for. */
export function publicKeyOf(address: string): string {
  return u8aToHex(decodeAddress(address))
}

/**
 * Whatever was pasted in, as the address the chain takes. Which account an
 * H160 spends from depends on chain state, so `ChainRepository.evmAccount`
 * answers for one and this takes Numen addresses alone.
 */
export function resolveAddress(input: string): string | null {
  const trimmed = input.trim()
  return isSubstrateAddress(trimmed) ? toNumenAddress(trimmed) : null
}
