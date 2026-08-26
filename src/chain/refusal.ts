/**
 * Why a node turned a transaction down before it ever reached a block. The
 * reasons come from sp_runtime's TransactionValidityError, which papi passes
 * on as its own JSON, and not one of them means anything to somebody holding
 * a wallet.
 */

export interface Validity {
  type: string
  value?: { type?: string; value?: number }
}

const INVALID: Record<string, string> = {
  Call: 'This chain does not take that call',
  Payment: 'This account cannot pay the fee',
  Future: 'Something this account signed earlier has not landed yet',
  Stale: 'This was already sent',
  BadProof: 'The signature does not match what was signed',
  AncientBirthBlock: 'This was signed too long ago and has expired',
  ExhaustsResources: 'The block is full, try again',
  BadMandatory: 'A call the block author owes this block failed',
  MandatoryValidation: 'Only the block author may send that call',
  BadSigner: 'This account may not sign on this chain',
  IndeterminateImplicit: 'The wallet and the chain disagree on what gets signed',
  UnknownOrigin: 'Nothing authorised this call',
}

const UNKNOWN: Record<string, string> = {
  CannotLookup: 'The chain could not resolve the address',
  NoUnsignedValidator: 'Nothing on this chain checks an unsigned call like this',
}

export function refusalMessage(validity: Validity): string {
  const reason = validity.value?.type
  if (!reason) return 'The chain turned this down'
  if (reason === 'Custom') return `The chain turned this down with code ${validity.value?.value}`

  const reasons = validity.type === 'Unknown' ? UNKNOWN : INVALID
  return reasons[reason] ?? `The chain turned this down for ${reason}`
}

/** A refusal that carries the raw reason as well as the reading of it. */
export class ChainError extends Error {
  readonly detail: string

  constructor(message: string, detail: string) {
    super(message)
    this.name = 'ChainError'
    this.detail = detail
  }
}

/**
 * A problem the wallet has already put on screen. The message is empty so that
 * the form under the dialog does not print the same thing a second time.
 */
export class ShownError extends Error {
  constructor() {
    super('')
    this.name = 'ShownError'
  }
}
