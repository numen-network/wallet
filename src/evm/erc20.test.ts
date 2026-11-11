import { describe, expect, it } from 'vitest'
import {
  balanceOfCall,
  DECIMALS_CALL,
  NAME_CALL,
  readBalance,
  readToken,
  readTransferred,
  revertReason,
  SYMBOL_CALL,
  transferCall,
} from './erc20'
import { hexToU8a } from '@polkadot/util'

const HOLDER = '0x1234567890abcdef1234567890abcdef12345678'

const TOKEN = '0xa1795b3c6f74866c7def1df390f9e2e403dca2e9'

const word = (hex: string) => hex.replace(/^0x/, '').padStart(64, '0')

/** A string as the ABI returns it, offset, length, then the padded bytes. */
const text = (hex: string) =>
  `0x${word('20')}${word((hex.length / 2).toString(16))}${hex.padEnd(64, '0')}`

/** What the Wrapped WTMR contract on mainnet answers, down to its one decimal. */
const WTMR = {
  name: text('577261707065642057544d52'),
  symbol: text('7757544d52'),
  decimals: `0x${word('01')}`,
}

describe('the calls the wallet makes', () => {
  it('asks for the metadata under the standard selectors', () => {
    expect(NAME_CALL).toBe('0x06fdde03')
    expect(SYMBOL_CALL).toBe('0x95d89b41')
    expect(DECIMALS_CALL).toBe('0x313ce567')
  })

  it('asks balanceOf about the holder', () => {
    expect(balanceOfCall(HOLDER)).toBe(`0x70a08231${word(HOLDER)}`)
  })

  it('writes transfer as the recipient and the amount in planck', () => {
    expect(transferCall(HOLDER, 62n)).toBe(`0xa9059cbb${word(HOLDER)}${word('3e')}`)
  })

  it('refuses a recipient that is not a whole address', () => {
    expect(() => transferCall('0x1234', 1n)).toThrow()
  })
})

describe('reading the answers', () => {
  it('reads a token the way its contract describes itself', () => {
    expect(readToken(TOKEN, WTMR)).toEqual({
      address: TOKEN,
      name: 'Wrapped WTMR',
      symbol: 'wWTMR',
      decimals: 1,
    })
  })

  it('turns away an address with no contract behind it', () => {
    expect(() => readToken(TOKEN, { ...WTMR, symbol: '0x' })).toThrow()
  })

  it('turns away decimals no uint8 could hold', () => {
    expect(() => readToken(TOKEN, { ...WTMR, decimals: `0x${word('0100')}` })).toThrow()
  })

  it('reads a balance as planck', () => {
    expect(readBalance(`0x${word('3e')}`)).toBe(62n)
  })
})

describe('what a transfer answers', () => {
  it('reads a true, a false and the silence some tokens give', () => {
    expect(readTransferred(hexToU8a(`0x${word('01')}`))).toBe(true)
    expect(readTransferred(hexToU8a(`0x${word('00')}`))).toBe(false)
    expect(readTransferred(new Uint8Array())).toBe(true)
  })

  it("names OpenZeppelin's error for a balance too small", () => {
    // ERC20InsufficientBalance(sender, 5, 7)
    const data = `0xe450d38c${word(HOLDER)}${word('05')}${word('07')}`
    expect(revertReason(hexToU8a(data))).toContain('ERC20InsufficientBalance')
  })

  it('passes on the reason a plain require gives', () => {
    const reason = '6e6f7065' // "nope"
    expect(revertReason(hexToU8a(`0x08c379a0${text(reason).slice(2)}`))).toContain('nope')
  })

  it('falls back to saying the contract refused when it says nothing it can read', () => {
    expect(revertReason(hexToU8a('0xdeadbeef'))).toBe('The token contract refused the transfer')
  })
})
