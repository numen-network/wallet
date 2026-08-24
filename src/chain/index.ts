import { createMockRepository } from './mock'
import { createPapiRepository } from './papi'
import type { Network } from './config'
import type { ChainRepository } from './types'

export * from './config'
export * from './types'

/**
 * Balances are invented rather than read from a chain. The UI says so, because
 * a wallet showing numbers nobody can spend has to admit it.
 */
export const usingMock = import.meta.env.VITE_CHAIN === 'mock'

/**
 * The single place that knows which chain client is in use. Swapping PAPI for
 * another library is a change to this function plus one sibling file.
 */
export function createRepository(network: Network): ChainRepository {
  if (usingMock) return createMockRepository()
  return createPapiRepository(network)
}
