import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useChain } from './provider'
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

const proxiesKey = (network: string, address: string) => ['proxies', network, address]

/** Who can already act for this account. Read once a dialog needs it, not polled. */
export function useProxies(address: string) {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: proxiesKey(network.id, address),
    queryFn: () => repository.proxies(address),
    staleTime: 10_000,
  })
}

/** Run once a proxy call lands, or the next dialog reads the list as it was. */
export function useRefreshProxies() {
  const client = useQueryClient()
  const { network } = useChain()

  return () => void client.invalidateQueries({ queryKey: ['proxies', network.id] })
}

const identityKey = (network: string, address: string) => ['identity', network, address]

/** Who the chain says this address is, its own record and the parent it hangs off. */
export function useStanding(address: string) {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: identityKey(network.id, address),
    queryFn: () => repository.standingOf(address),
    // A box being typed into has no address yet, and the chain has no answer
    // for one that is not an address
    enabled: address !== '',
    staleTime: 10_000,
  })
}

const subsKey = (network: string, address: string) => ['subs', network, address]

/** The accounts hanging off this one, which only it may change. */
export function useSubs(address: string) {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: subsKey(network.id, address),
    queryFn: () => repository.subsOf(address),
    staleTime: 10_000,
  })
}

/** Every list on the network, since a sub quitting shortens one it does not own. */
export function useRefreshSubs() {
  const client = useQueryClient()
  const { network } = useChain()

  return () => void client.invalidateQueries({ queryKey: ['subs', network.id] })
}

const vestingKey = (network: string, address: string) => ['vesting', network, address]

/** What this account has vesting, which nothing thaws without being asked. */
export function useVesting(address: string) {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: vestingKey(network.id, address),
    queryFn: () => repository.vesting(address),
    staleTime: 10_000,
  })
}

export function useRefreshVesting() {
  const client = useQueryClient()
  const { network } = useChain()

  return () => void client.invalidateQueries({ queryKey: ['vesting', network.id] })
}

/**
 * Every address on the network. A call to Identity writes somebody else's
 * record about as often as its own. A parent naming a sub and a registrar
 * handing down a verdict both leave the signer's own record alone.
 */
export function useRefreshIdentity() {
  const client = useQueryClient()
  const { network } = useChain()

  return () => void client.invalidateQueries({ queryKey: ['identity', network.id] })
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

export function useRefreshRegistrars() {
  const client = useQueryClient()
  const { network } = useChain()

  return () => void client.invalidateQueries({ queryKey: ['registrars', network.id] })
}

/** A runtime constant, so it is read once and held until the endpoint changes. */
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

const referendaKey = (network: string) => ['referenda', network]

export function useReferenda() {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: referendaKey(network.id),
    queryFn: () => repository.referenda(),
    staleTime: 10_000,
  })
}

const spendsKey = (network: string) => ['spends', network]

/** What passed referenda booked and nobody has claimed yet. */
export function useSpends() {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: spendsKey(network.id),
    queryFn: () => repository.spends(),
    staleTime: 10_000,
  })
}

export function useRefreshSpends() {
  const client = useQueryClient()
  const { network } = useChain()

  return () => void client.invalidateQueries({ queryKey: spendsKey(network.id) })
}

const settledKey = (network: string) => ['settled', network]

/** Finished referenda still holding a deposit somebody could free. */
export function useSettled() {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: settledKey(network.id),
    queryFn: () => repository.settled(),
    staleTime: 10_000,
  })
}

export function useRefreshSettled() {
  const client = useQueryClient()
  const { network } = useChain()

  return () => void client.invalidateQueries({ queryKey: settledKey(network.id) })
}

const preimagesKey = (network: string, owners: string[]) => ['preimages', network, ...owners]

/** Bytes these accounts are paying to keep on chain and could stop paying for. */
export function usePreimages(owners: string[]) {
  const { repository, network } = useChain()
  const sorted = [...owners].sort()

  return useQuery({
    queryKey: preimagesKey(network.id, sorted),
    queryFn: () => repository.preimages(sorted),
    enabled: sorted.length > 0,
    staleTime: 10_000,
  })
}

export function useRefreshPreimages() {
  const client = useQueryClient()
  const { network } = useChain()

  return () => void client.invalidateQueries({ queryKey: ['preimages', network.id] })
}

const pendingKey = (network: string, multisigs: string[]) => ['pending', network, ...multisigs]

/** Calls these multisigs have started and not gathered enough signatures for. */
export function usePending(multisigs: string[]) {
  const { repository, network } = useChain()
  const sorted = [...multisigs].sort()

  return useQuery({
    queryKey: pendingKey(network.id, sorted),
    queryFn: () => repository.pending(sorted),
    enabled: sorted.length > 0,
    staleTime: 10_000,
  })
}

export function useRefreshPending() {
  const client = useQueryClient()
  const { network } = useChain()

  return () => void client.invalidateQueries({ queryKey: ['pending', network.id] })
}

const bountiesKey = (network: string) => ['bounties', network]

/** Every bounty the treasury is still carrying. */
export function useBounties() {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: bountiesKey(network.id),
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

export function useRefreshBounties() {
  const client = useQueryClient()
  const { network } = useChain()

  return () => {
    void client.invalidateQueries({ queryKey: bountiesKey(network.id) })
    void client.invalidateQueries({ queryKey: ['childBounties', network.id] })
  }
}

export function useRefreshReferenda() {
  const client = useQueryClient()
  const { network } = useChain()

  return () => void client.invalidateQueries({ queryKey: referendaKey(network.id) })
}

const locksKey = (network: string, address: string) => ['locks', network, address]

/** What voting has tied up, which only this account can release. */
export function useLocks(address: string) {
  const { repository, network } = useChain()

  return useQuery({
    queryKey: locksKey(network.id, address),
    queryFn: () => repository.locks(address),
    staleTime: 10_000,
  })
}

export function useRefreshLocks() {
  const client = useQueryClient()
  const { network } = useChain()

  return () => void client.invalidateQueries({ queryKey: ['locks', network.id] })
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
