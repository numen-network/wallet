import { hexToU8a, u8aToHex } from '@polkadot/util'
import { createContract, decodeError, ERC20 } from 'micro-eth-signer/abi.js'
import type { Token } from '@/chain/types'

/**
 * Each decoder throws on an answer the standard would not give, which is how an
 * address with no token behind it gets turned away.
 */

const erc20 = createContract(ERC20)

/** The errors OpenZeppelin's ERC20 reverts a transfer with. */
const TRANSFER_ERRORS = [
  {
    type: 'error',
    name: 'ERC20InsufficientBalance',
    inputs: [
      { name: 'sender', type: 'address' },
      { name: 'balance', type: 'uint256' },
      { name: 'needed', type: 'uint256' },
    ],
  },
  { type: 'error', name: 'ERC20InvalidSender', inputs: [{ name: 'sender', type: 'address' }] },
  { type: 'error', name: 'ERC20InvalidReceiver', inputs: [{ name: 'receiver', type: 'address' }] },
] as const

export const NAME_CALL = u8aToHex(erc20.name.encodeInput())
export const SYMBOL_CALL = u8aToHex(erc20.symbol.encodeInput())
export const DECIMALS_CALL = u8aToHex(erc20.decimals.encodeInput())

export function balanceOfCall(holder: string): string {
  return u8aToHex(erc20.balanceOf.encodeInput(holder))
}

export function transferCall(to: string, amount: bigint): string {
  return u8aToHex(erc20.transfer.encodeInput({ to, value: amount }))
}

export function readToken(
  address: string,
  answers: { name: string; symbol: string; decimals: string },
): Omit<Token, 'icon'> {
  return {
    address,
    name: erc20.name.decodeOutput(hexToU8a(answers.name)),
    symbol: erc20.symbol.decodeOutput(hexToU8a(answers.symbol)),
    decimals: Number(erc20.decimals.decodeOutput(hexToU8a(answers.decimals))),
  }
}

export function readBalance(answer: string): bigint {
  return erc20.balanceOf.decodeOutput(hexToU8a(answer))
}

/** Some tokens return nothing from a transfer. For them only a revert means failure. */
export function readTransferred(answer: Uint8Array): boolean {
  return answer.length === 0 || erc20.transfer.decodeOutput(answer)
}

export function revertReason(data: Uint8Array): string {
  return decodeError(data, TRANSFER_ERRORS)?.message ?? 'The token contract refused the transfer'
}
