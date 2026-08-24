import { hexToU8a, isHex, u8aToHex, u8aWrapBytes } from '@polkadot/util'
import { signatureVerify } from '@polkadot/util-crypto'
import type { WalletAccount } from './types'

/**
 * Signing a message rather than a transaction.
 *
 * The bytes go in wrapped in the <Bytes> tags every other wallet uses, which is
 * what keeps a message somebody was talked into signing from also being a valid
 * transaction. Reading one back accepts either form, since a signature made
 * elsewhere may have been wrapped by the extension rather than by the caller.
 */
export async function signMessage(account: WalletAccount, message: string): Promise<string> {
  const signed = await account.signer.signBytes(u8aWrapBytes(new TextEncoder().encode(message)))
  return u8aToHex(signed)
}

export interface Verdict {
  /** Whether that address made that signature over that message. */
  valid: boolean
  /** Which scheme it turned out to be, since an address alone does not say. */
  crypto: string
}

export function verifyMessage(address: string, message: string, signature: string): Verdict {
  if (!isHex(signature)) throw new Error('A signature is a 0x hex string')

  const bytes = hexToU8a(signature)
  if (![64, 65, 66].includes(bytes.length)) {
    throw new Error(`A signature is 64 bytes, this one is ${bytes.length}`)
  }

  let verdict
  try {
    verdict = signatureVerify(new TextEncoder().encode(message), bytes, address)
  } catch {
    throw new Error('That is not an address this chain can read')
  }

  return { valid: verdict.isValid, crypto: verdict.crypto }
}
