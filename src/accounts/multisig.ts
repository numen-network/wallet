import { encodeMultiAddress } from '@polkadot/util-crypto'
import { SS58_PREFIX } from '@/chain/config'
import { isSubstrateAddress, toNumenAddress } from '@/lib/address'

export interface Multisig {
  address: string
  signatories: string[]
}

/**
 * A multisig address is derived from its signatories and threshold, so it
 * exists the moment those are known and the chain hears nothing until someone
 * spends from it. Order does not matter, the derivation sorts.
 *
 * Returns null rather than a half answer, because the address it would produce
 * is one somebody funds.
 */
export function deriveMultisig(input: readonly string[], threshold: number): Multisig | null {
  // A row nobody filled in is a row that is not a signatory yet
  const signatories = input.map((entry) => entry.trim()).filter(Boolean)

  if (signatories.length < 2 || !signatories.every(isSubstrateAddress)) return null
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > signatories.length) return null

  const normalised = signatories.map(toNumenAddress)
  if (new Set(normalised).size !== normalised.length) return null

  return { address: encodeMultiAddress(normalised, threshold, SS58_PREFIX), signatories: normalised }
}

/**
 * Everybody but whoever is signing. pallet_multisig derives the address from
 * the whole set, so it has to be handed the rest of it to know which account it
 * is acting for, and it wants them sorted.
 */
export function otherSignatories(signatories: string[], signer: string): string[] {
  return signatories.filter((entry) => entry !== signer).sort()
}

/** Which accounts here could put a signature on this multisig's calls. */
export function signersFor(signatories: string[], mine: string[]): string[] {
  const held = new Set(mine)
  return signatories.filter((entry) => held.has(entry))
}
