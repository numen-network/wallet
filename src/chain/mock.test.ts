import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WalletAccount } from '@/signing/types'
import { frontierAccount, reviveAccount, reviveAddress } from '@/lib/address'
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

describe('tokens on the mock chain', () => {
  const GOLD = '0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0'

  it('finds every contract, the listed ones and the rest', async () => {
    const chain = createMockRepository()
    const listed = (await chain.tokens()).map((token) => token.address)
    const all = (await chain.allTokens()).map((token) => token.address)

    expect(listed).not.toContain(GOLD)
    expect(all).toEqual(expect.arrayContaining([...listed, GOLD]))
  })

  it('describes a contract by its address and refuses one that is no token', async () => {
    const chain = createMockRepository()

    await expect(chain.token(GOLD)).resolves.toMatchObject({ symbol: 'mGLD', icon: null })
    await expect(chain.token(`0x${'ab'.repeat(20)}`)).rejects.toThrow()
  })
})

describe('token transfers from a Numen account on the mock chain', () => {
  const MUSD = '0x5fbdb2315678afecb367f032d93f642f64180aa3'
  /** Holds neither of the mock's tokens. */
  const BARE = '0x5a1e7f3c9b2d4e6f8a0b1c2d3e4f5a6b7c8d0009'
  const token = { address: MUSD, symbol: 'mUSD', decimals: 6 }

  const held = (chain: ReturnType<typeof createMockRepository>, holder: string) =>
    new Promise<bigint>((resolve) => chain.subscribeTokenBalance(MUSD, holder, resolve)())

  it('moves the token and charges a deposit for the balance it starts', async () => {
    const chain = createMockRepository('revive')
    const source = reviveAddress(A)
    const before = await held(chain, source)
    const quote = await chain.quoteTokenTransfer(A, MUSD, BARE, 1n)
    expect(quote.deposit).toBeGreaterThan(0n)

    const operation: Operation = { kind: 'sendToken', token, to: BARE, amount: 1n, limits: quote.limits }
    const sent = chain.submit(granter, operation)
    await vi.advanceTimersByTimeAsync(750)
    await sent

    expect(await held(chain, source)).toBe(before - 1n)
    expect(await held(chain, BARE)).toBe(1n)
    expect((await chain.quoteTokenTransfer(A, MUSD, BARE, 1n)).deposit).toBe(0n)
  })

  it('refuses more than the H160 holds, and refuses it all under Frontier', async () => {
    const chain = createMockRepository('revive')
    const all = await held(chain, reviveAddress(A))
    await expect(chain.quoteTokenTransfer(A, MUSD, BARE, all + 1n)).rejects.toThrow()
    await expect(createMockRepository().quoteTokenTransfer(A, MUSD, BARE, 1n)).rejects.toThrow()
  })
})

describe('the EVM layer on the mock chain', () => {
  const H160 = '0x1234567890abcdef1234567890abcdef12345678'

  it('spends an H160 from the account Frontier hashed it to, and maps no account back', async () => {
    const chain = createMockRepository()
    expect(await chain.evmAccount(H160)).toBe(frontierAccount(H160))
    expect(await chain.evmAddressOf(A)).toBeNull()
    expect(await chain.claimable(H160)).toBe(0n)
  })

  it('maps both ways under pallet-revive', async () => {
    const chain = createMockRepository('revive')
    expect(await chain.evmAccount(H160)).toBe(reviveAccount(H160))
    const h160 = await chain.evmAddressOf(B)
    expect(h160).toBe(reviveAddress(B))
    expect(await chain.evmAccount(h160!)).toBe(B)
  })

  it('moves what Frontier left with one claim and refuses a second', async () => {
    const chain = createMockRepository('revive')
    expect(await chain.claimable(H160)).toBeGreaterThan(0n)

    const sent = chain.claim(H160)
    await vi.advanceTimersByTimeAsync(750)
    await sent

    expect(await chain.claimable(H160)).toBe(0n)
    await expect(chain.claim(H160)).rejects.toThrow()
  })

  it('tells whoever listens once the runtime moves to pallet-revive', async () => {
    const chain = createMockRepository()
    const seen: string[] = []
    const stop = chain.subscribeRuntime((evm) => seen.push(evm))
    await Promise.resolve()
    globalThis.dispatchEvent(new Event('numen-mock-upgrade'))

    expect(seen).toEqual(['frontier', 'revive'])
    expect(await chain.evmAccount(H160)).toBe(reviveAccount(H160))
    stop()
    chain.disconnect()
  })
})
