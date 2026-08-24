import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createRepository } from './index'
import { DEFAULT_NETWORK, NETWORKS, type Network } from './config'
import { addEndpoint, allNetworks, removeEndpoint } from './custom'
import type { ChainRepository } from './types'

const NETWORK_KEY = 'numen-wallet-network'

/** The endpoint the user picked last time. Anything unknown falls to the default. */
function storedNetwork(networks: Network[]): string {
  try {
    const id = localStorage.getItem(NETWORK_KEY)
    return networks.some((network) => network.id === id) ? id! : DEFAULT_NETWORK
  } catch {
    return DEFAULT_NETWORK
  }
}

interface ChainContextValue {
  network: Network
  networks: Network[]
  repository: ChainRepository
  setNetwork: (id: string) => void
  /** Adds it and switches to it, since nobody adds one to leave it alone. */
  addNetwork: (name: string, url: string) => void
  forgetNetwork: (id: string) => void
}

const ChainContext = createContext<ChainContextValue | null>(null)

export function ChainProvider({ children }: { children: ReactNode }) {
  const [networks, setNetworks] = useState(allNetworks)
  const [networkId, setNetworkId] = useState(() => storedNetwork(allNetworks()))
  const network = networks.find((entry) => entry.id === networkId) ?? NETWORKS[DEFAULT_NETWORK]

  const repository = useMemo(() => createRepository(network), [network])

  /**
   * Only a network the user has left behind gets disconnected. Hanging this on
   * the cleanup instead kills the live client, since React replays effects on
   * mount and a memo is not rebuilt in between. The client survives it and then
   * answers nothing, which reads as a chain where every balance is zero.
   */
  const live = useRef(repository)
  useEffect(() => {
    const left = live.current
    live.current = repository
    if (left !== repository) left.disconnect()
  }, [repository])

  const value = useMemo(() => {
    const select = (id: string) => {
      try {
        localStorage.setItem(NETWORK_KEY, id)
      } catch {
        // Losing the preference costs a click, not a key
      }
      setNetworkId(id)
    }

    return {
      network,
      networks,
      repository,
      setNetwork: select,

      addNetwork: (name: string, url: string) => {
        const added = addEndpoint(name, url)
        setNetworks(allNetworks())
        select(added.id)
      },

      forgetNetwork: (id: string) => {
        removeEndpoint(id)
        setNetworks(allNetworks())
        if (id === networkId) select(DEFAULT_NETWORK)
      },
    }
  }, [network, networks, networkId, repository])

  return <ChainContext value={value}>{children}</ChainContext>
}

export function useChain(): ChainContextValue {
  const value = useContext(ChainContext)
  if (!value) throw new Error('useChain outside ChainProvider')
  return value
}
