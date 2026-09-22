import { hexToU8a, u8aToHex } from '@polkadot/util'
import { createContract, ERC20 } from 'micro-eth-signer/abi.js'
import type { Token } from '@/chain/types'

/**
 * Each decoder throws on an answer the standard would not give, which is how an
 * address with no token behind it gets turned away.
 */

const erc20 = createContract(ERC20)

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
): Token {
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
