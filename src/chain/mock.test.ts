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

describe('delegations on the mock chain', () => {
  const send = async (chain: ReturnType<typeof createMockRepository>, operation: Operation) => {
    const sent = chain.submit(granter, operation)
    await vi.advanceTimersByTimeAsync(750)
    return sent
  }
  const delegation = { track: 0, to: B, conviction: 'Locked1x' as const, amount: UNIT }

  it('reports a delegation and refuses a second on the same track', async () => {
    const chain = createMockRepository()
    await send(chain, { kind: 'delegate', delegation })

    expect(await chain.votingFor(A)).toEqual([{ track: 0, kind: 'delegating', delegation }])
    // Watched before the clock runs, since the refusal lands while it does
    const second = expect(chain.submit(granter, { kind: 'delegate', delegation })).rejects.toThrow(
      'AlreadyDelegating',
    )
    await vi.advanceTimersByTimeAsync(750)
    await second
  })

  it('forgets a delegation once it is taken back', async () => {
    const chain = createMockRepository()
    await send(chain, { kind: 'delegate', delegation })
    await send(chain, { kind: 'undelegate', track: 0 })

    expect(await chain.votingFor(A)).toEqual([])
  })
})

describe('votes in the way of a delegation on the mock chain', () => {
  const BOB = 'nu5sKtuEZG5GH9emAghk9MTdVPBJbieEsSD8Z6UKkA45afKcv'
  const bob = { address: BOB } as WalletAccount

  it('clears votes on referenda that are over and then delegates', async () => {
    const chain = createMockRepository()
    // Bob's seeded votes on track 31 are on referenda 9 and 10, both over
    expect(await chain.votingFor(BOB)).toContainEqual({ track: 31, kind: 'voting', ongoing: [], ended: [9, 10] })

    const delegation = { track: 31, to: A, conviction: 'Locked1x' as const, amount: UNIT }
    const sent = chain.submit(bob, {
      kind: 'batch',
      calls: [
        { kind: 'removeVote', track: 31, poll: 9 },
        { kind: 'removeVote', track: 31, poll: 10 },
        { kind: 'delegate', delegation },
      ],
    })
    await vi.advanceTimersByTimeAsync(750)
    await sent

    expect(await chain.votingFor(BOB)).toContainEqual({ track: 31, kind: 'delegating', delegation })
  })
})
