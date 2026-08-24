import { extensionBackend } from './extension'
import type { SignerBackend } from './types'

export * from './types'

/**
 * Backends that hand over a ready signer. Keys the wallet holds itself do not
 * fit that shape, they need a password per signature, so they live in `vault`.
 */
export const BACKENDS: SignerBackend[] = [extensionBackend]

export async function availableBackends(): Promise<SignerBackend[]> {
  const flags = await Promise.all(BACKENDS.map((b) => b.isAvailable()))
  return BACKENDS.filter((_, i) => flags[i])
}
