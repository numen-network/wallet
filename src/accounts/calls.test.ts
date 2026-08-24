import { beforeEach, describe, expect, it } from 'vitest'
import { UNIT } from '@/chain/config'
import { createMockRepository } from '@/chain/mock'
import type { Operation } from '@/chain/types'
import { loadCalls, readAgainst, useCallsStore } from './calls'

const A = 'nu7SVAyQhPoGBJfFg7di66oYTV2KVBBeCw3Gt9qTRE2zpSUyb'
const B = 'nu32czLMgUWfEXJgQPyWH3AMdjXbaBoqghDwtJbhaJf9UJJ5U'

const chain = createMockRepository()
const read = (hex: string) => chain.readCall(hex)

const pay: Operation = { kind: 'transfer', to: A, amount: 12n * UNIT }
const other: Operation = { kind: 'transfer', to: B, amount: 12n * UNIT }

describe('reading call data against the hash it claims', () => {
  it('reads back the call that was written', async () => {
    const { hex, hash } = await chain.callData(pay)
    const seen = await readAgainst(read, hex, hash)

    expect(seen.operation).toEqual(pay)
    expect(seen.hash).toBe(hash)
  })

  it('refuses bytes for some other call, however well they decode', async () => {
    const { hash } = await chain.callData(pay)
    const { hex } = await chain.callData(other)

    await expect(readAgainst(read, hex, hash)).rejects.toThrow(/some other call/)
  })

  it('refuses anything that is not call data at all', async () => {
    const { hash } = await chain.callData(pay)

    await expect(readAgainst(read, '0xdeadbeef', hash)).rejects.toThrow()
    await expect(readAgainst(read, 'hello', hash)).rejects.toThrow(/hex/)
  })

  /** An amount that comes back a string rather than a bigint is a wrong amount. */
  it('carries amounts across as bigints', async () => {
    const { hex, hash } = await chain.callData(pay)
    const seen = await readAgainst(read, hex, hash)

    expect(typeof (seen.operation as { amount: bigint }).amount).toBe('bigint')
  })
})

describe('what the wallet keeps', () => {
  beforeEach(() => {
    localStorage.clear()
    useCallsStore.setState({ calls: {} })
  })

  it('keeps the bytes where a reload finds them again', async () => {
    const { hex, hash } = await chain.callData(pay)
    useCallsStore.getState().remember(hash, hex)

    expect(useCallsStore.getState().calls[hash]).toBe(hex)
    expect(loadCalls()[hash]).toBe(hex)
  })

  it('drops anything stored that is not call data', () => {
    localStorage.setItem(
      'numen-wallet-calls-v1',
      JSON.stringify({ '0xabc': '0x1234', '0xdef': 'not hex', '0xghi': 42 }),
    )

    expect(loadCalls()).toEqual({ '0xabc': '0x1234' })
  })
})
