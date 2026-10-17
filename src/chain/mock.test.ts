import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WalletAccount } from '@/signing/types'
import { UNIT } from './config'
import { createMockRepository } from './mock'
import type { ChainHead, Operation } from './types'

const A = 'nu7SVAyQhPoGBJfFg7di66oYTV2KVBBeCw3Gt9qTRE2zpSUyb'
const B = 'nu32czLMgUWfEXJgQPyWH3AMdjXbaBoqghDwtJbhaJf9UJJ5U'

/** The mock only reads who signed, so an account is its address. */
const granter = { address: A } as WalletAccount

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('vesting on the mock chain', () => {
  it('leaves free where the grant put it when vest runs', async () => {
    const chain = createMockRepository()
    let head!: ChainHead
    const stopHead = chain.subscribeHead((next) => (head = next))
    const freeOf = (address: string) => {
      let free = 0n
      const stop = chain.subscribeBalance(address, (balance) => (free = balance.free))
      stop()
      return free
    }
    const send = async (operation: Operation) => {
      const sent = chain.submit(granter, operation)
      await vi.advanceTimersByTimeAsync(750)
      await sent
    }

    // The first account looked at carries the seeded schedule, so that is the granter
    freeOf(A)
    const before = freeOf(B)
    const schedule = { locked: 10n * UNIT, perBlock: UNIT, startingBlock: head.number }
    await send({ kind: 'vestedTransfer', to: B, schedule })
    // Three blocks at nine seconds each
    await vi.advanceTimersByTimeAsync(27_000)
    await send({ kind: 'vestOther', target: B })

    expect(freeOf(B)).toBe(before + 10n * UNIT)
    expect(await chain.vesting(B)).toEqual({ schedules: [schedule], lock: 7n * UNIT })
    stopHead()
  })
})
