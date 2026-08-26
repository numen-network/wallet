import { describe, expect, it } from 'vitest'
import { ChainError, refusalMessage, ShownError } from './refusal'

const invalid = (reason: string) => ({ type: 'Invalid', value: { type: reason } })
const unknown = (reason: string) => ({ type: 'Unknown', value: { type: reason } })

describe('refusalMessage', () => {
  it('names every reason a node may turn a transaction down for', () => {
    const reasons = [
      'Call',
      'Payment',
      'Future',
      'Stale',
      'BadProof',
      'AncientBirthBlock',
      'ExhaustsResources',
      'BadMandatory',
      'MandatoryValidation',
      'BadSigner',
      'IndeterminateImplicit',
      'UnknownOrigin',
    ]

    for (const reason of reasons) {
      const said = refusalMessage(invalid(reason))
      expect(said).not.toContain(reason)
      expect(said.length).toBeGreaterThan(0)
    }
  })

  it('reads an unpayable fee as the account being short', () => {
    expect(refusalMessage(invalid('Payment'))).toBe('This account cannot pay the fee')
  })

  it('tells the two tables apart, since one name sits in neither', () => {
    expect(refusalMessage(unknown('CannotLookup'))).toBe(
      'The chain could not resolve the address',
    )
    expect(refusalMessage(unknown('NoUnsignedValidator'))).toBe(
      'Nothing on this chain checks an unsigned call like this',
    )
  })

  it('carries the code of a reason only the runtime knows', () => {
    expect(refusalMessage({ type: 'Invalid', value: { type: 'Custom', value: 7 } })).toBe(
      'The chain turned this down with code 7',
    )
  })

  it('falls back on a name this wallet was built too early to know', () => {
    expect(refusalMessage(invalid('SomethingNewer'))).toBe(
      'The chain turned this down for SomethingNewer',
    )
  })

  it('says something even where the reason is missing', () => {
    expect(refusalMessage({ type: 'Invalid' })).toBe('The chain turned this down')
  })
})

describe('ChainError', () => {
  it('keeps what the chain said beside the words put to it', () => {
    const raw = '{\n  "type": "Invalid",\n  "value": {\n    "type": "Payment"\n  }\n}'
    const error = new ChainError('This account cannot pay the fee', raw)

    expect(error.message).toBe('This account cannot pay the fee')
    expect(error.detail).toBe(raw)
    expect(error).toBeInstanceOf(Error)
  })
})

describe('ShownError', () => {
  it('carries no message, so a form under the dialog prints nothing', () => {
    const error = new ShownError()

    expect(error.message).toBe('')
    expect(error).toBeInstanceOf(Error)
  })
})
