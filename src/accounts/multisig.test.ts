import { beforeAll, describe, expect, it } from 'vitest'
import { cryptoWaitReady } from '@polkadot/util-crypto'
import { deriveMultisig } from './multisig'

const A = 'nu7SVAyQhPoGBJfFg7di66oYTV2KVBBeCw3Gt9qTRE2zpSUyb'
const B = 'nu32czLMgUWfEXJgQPyWH3AMdjXbaBoqghDwtJbhaJf9UJJ5U'
const C = 'nu3oNksEGXV3Tsr4sBeRUpcfA5zYp4VvZ7t9uKVPMAe2UCo98'
const TWO_OF_THREE = 'nu2ojmYR9qXUFZgJkJSmfjzJRDakd1GaY6g96HX6QgeT5gWJQ'

beforeAll(async () => {
  await cryptoWaitReady()
})

describe('deriveMultisig', () => {
  it('holds its value, this is an address people fund', () => {
    expect(deriveMultisig([A, B, C], 2)?.address).toBe(TWO_OF_THREE)
  })

  it('ignores the order the signatories were typed in', () => {
    expect(deriveMultisig([C, A, B], 2)?.address).toBe(TWO_OF_THREE)
  })

  it('gives a different address for a different threshold', () => {
    expect(deriveMultisig([A, B, C], 1)?.address).not.toBe(TWO_OF_THREE)
  })

  it('gives a different address for a different set', () => {
    expect(deriveMultisig([A, B], 2)?.address).not.toBe(TWO_OF_THREE)
  })

  it('passes over the rows nobody filled in', () => {
    expect(deriveMultisig([A, '', B, '  '], 2)?.address).toBe(deriveMultisig([A, B], 2)?.address)
  })

  it('refuses a threshold outside the signatory count', () => {
    expect(deriveMultisig([A, B], 0)).toBeNull()
    expect(deriveMultisig([A, B], 3)).toBeNull()
    expect(deriveMultisig([A, B], Number.NaN)).toBeNull()
  })

  it('refuses fewer than two signatories', () => {
    expect(deriveMultisig([A], 1)).toBeNull()
    expect(deriveMultisig([], 1)).toBeNull()
  })

  it('refuses the same signatory twice, whatever prefix it wore', () => {
    expect(deriveMultisig([A, A], 2)).toBeNull()
    expect(deriveMultisig([A, '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'], 2)).toBeNull()
  })

  it('refuses anything that is not an address', () => {
    expect(deriveMultisig([A, 'hello'], 2)).toBeNull()
    expect(deriveMultisig([A, '0x1234567890abcdef1234567890abcdef12345678'], 2)).toBeNull()
  })

  it('reports the signatories in Numen form', () => {
    const derived = deriveMultisig(['5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', B], 2)
    expect(derived?.signatories).toContain(A)
  })
})
