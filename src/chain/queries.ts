import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useChain } from './provider'
import type { Registrar } from './identity'
import type { AccountBalance, ChainHead, Operation, Reach } from './types'

/**
 * Chain state is server state. Balances arrive as live subscriptions, so they
 * hold their own state rather than being polled through the query cache.
 */

export function useBalances(addresses: string[]): Record<string, AccountBalance> {
  const { repository } = useChain()
  const [balances, setBalances] = useState<Record<string, AccountBalance>>({})
  // Sorted, because dragging a card reorders the board on every pointer move and
  // resubscribing every account that often is most of what makes a drag stutter
  const key = [...addresses].sort().join(',')

  useEffect(() => {
    const unsubscribes = (key ? key.split(',') : []).map((address) =>
      repository.subscribeBalance(address, (balance) =>
        setBalances((current) => ({ ...current, [address]: balance })),
      ),
    )
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe()
    }
  }, [repository, key])

  return balances
}

/**
 * How the link is holding up, sampled rather than watched. Nothing on chain
 * changes it, so a poll on a slow clock says as much as a subscription would.
 */
export function useReach() {
  const { repository, network } = useChain()

  return useQuery<Reach>({
    queryKey: ['reach', network.id],
    queryFn: () => repository.reach(),
    refetchInterval: 10_000,
    staleTime: 10_000,
  })
}

export function useHead(): ChainHead | null {
  const { repository } = useChain()
  const [head, setHead] = useState<ChainHead | null>(null)

  useEffect(() => repository.subscribeHead(setHead), [repository])

  return head
}

/**
 * The query families a settled call can leave stale. A key starts with its
 * family name, so the name on its own reaches every address held under it. The
 * width is deliberate. A parent naming a sub and a registrar handing down a
 * verdict both write a record the signer does not own.
 */
export const CACHES = [
  'proxies',
  'identity',
  'subs',
  'vesting',
  'bounties',
  'referenda',
  'spends',
  'settled',
  'preimages',
  'pending',
  'locks',
  'registrars',
] as const

export type Cache = (typeof CACHES)[number]

/** A family whose name does not cover every key the chain writes under it. */
const ALSO: Partial<Record<Cache, readonly string[]>> = {
  bounties: ['childBounties'],
}

/** Drops what a settled call left stale, or the next screen reads the chain as it was. */
export function useRefresh() {
  const client = useQueryClient()
  const { network } = useChain()

  return (caches: readonly Cache[]) => {
    for (const cache of caches) {
      for (const family of [cache, ...(ALSO[cache] ?? [])]) {
        void client.invalidateQueries({ queryKey: [family, network.id] })
      }
    }
  }
}

/** Who can already act for this account. Read once a dialog needs it, not polled. */
export function useProxies(address: string) {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: ['proxies', network.id, address],
    queryFn: () => repository.proxies(address),
    staleTime: 10_000,
  })
}

/** Who the chain says this address is, its own record and the parent it hangs off. */
export function useStanding(address: string) {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: ['identity', network.id, address],
    queryFn: () => repository.standingOf(address),
    // A box being typed into has no address yet, and the chain has no answer
    // for one that is not an address
    enabled: address !== '',
    staleTime: 10_000,
  })
}

/** The accounts hanging off this one, which only it may change. */
export function useSubs(address: string) {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: ['subs', network.id, address],
    queryFn: () => repository.subsOf(address),
    staleTime: 10_000,
  })
}

/** What this account has vesting, which nothing thaws without being asked. */
export function useVesting(address: string) {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: ['vesting', network.id, address],
    queryFn: () => repository.vesting(address),
    staleTime: 10_000,
  })
}

/** Who may check an identity. A chain with none has nobody to ask yet. */
export function useRegistrars() {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: ['registrars', network.id],
    queryFn: () => repository.registrars(),
    staleTime: 60_000,
  })
}

/**
 * Registrars a request made by hand may go to. The automated one only judges a
 * record that paid it through the identity dialog, so a request sent to it any
 * other way would sit unjudged forever, and the list leaves it out.
 */
export function useAskableRegistrars(): Registrar[] | undefined {
  const { network } = useChain()
  const { data: registrars } = useRegistrars()
  return registrars?.filter((entry) => entry.account !== network.registrar)
}

/**
 * The runtime's own constants. Nothing but a runtime upgrade moves them, so one
 * read serves the session and the cache never goes stale on its own.
 */
export function useFacts() {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: ['facts', network.id],
    queryFn: () => repository.facts(),
    staleTime: Infinity,
  })
}

/** Ticker of the connected chain, or empty while facts are still on their way. */
export function useSymbol(): string {
  return useFacts().data?.symbol ?? ''
}

export function useTracks() {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: ['tracks', network.id],
    queryFn: () => repository.tracks(),
    staleTime: Infinity,
  })
}

export function useReferenda() {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: ['referenda', network.id],
    queryFn: () => repository.referenda(),
    staleTime: 10_000,
  })
}

/** What passed referenda booked and nobody has claimed yet. */
export function useSpends() {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: ['spends', network.id],
    queryFn: () => repository.spends(),
    staleTime: 10_000,
  })
}

/** Finished referenda still holding a deposit somebody could free. */
export function useSettled() {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: ['settled', network.id],
    queryFn: () => repository.settled(),
    staleTime: 10_000,
  })
}

/** Bytes these accounts are paying to keep on chain and could stop paying for. */
export function usePreimages(owners: string[]) {
  const { repository, network } = useChain()
  const sorted = [...owners].sort()

  return useQuery({
    queryKey: ['preimages', network.id, ...sorted],
    queryFn: () => repository.preimages(sorted),
    enabled: sorted.length > 0,
    staleTime: 10_000,
  })
}

/** Calls these multisigs have started and not gathered enough signatures for. */
export function usePending(multisigs: string[]) {
  const { repository, network } = useChain()
  const sorted = [...multisigs].sort()

  return useQuery({
    queryKey: ['pending', network.id, ...sorted],
    queryFn: () => repository.pending(sorted),
    enabled: sorted.length > 0,
    staleTime: 10_000,
  })
}

/** Every bounty the treasury is still carrying. */
export function useBounties() {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: ['bounties', network.id],
    queryFn: () => repository.bounties(),
    staleTime: 10_000,
  })
}

/** The pieces a curator has split their bounties into. */
export function useChildBounties() {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: ['childBounties', network.id],
    queryFn: () => repository.childBounties(),
    staleTime: 10_000,
  })
}

/** What voting has tied up, which only this account can release. */
export function useLocks(address: string) {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: ['locks', network.id, address],
    queryFn: () => repository.locks(address),
    staleTime: 10_000,
  })
}

/** The denominator support is measured against, which excludes the treasury. */
export function useActiveIssuance() {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: ['activeIssuance', network.id],
    queryFn: () => repository.activeIssuance(),
    staleTime: 60_000,
  })
}

/** What the chain would charge this account for that call, as filled in so far. */
export function useFeeEstimate(from: string | undefined, operation: Operation | null) {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: ['fee', network.id, from, JSON.stringify(operation, replaceBigInt)],
    queryFn: () => repository.estimateFee(from!, operation!),
    enabled: Boolean(from) && operation !== null,
    staleTime: 30_000,
  })
}

const replaceBigInt = (_key: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value
