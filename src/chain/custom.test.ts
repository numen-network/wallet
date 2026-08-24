import { beforeEach, describe, expect, it } from 'vitest'
import { addEndpoint, allNetworks, checkEndpoint, customNetworks, EndpointError, removeEndpoint } from './custom'
import { NETWORKS } from './config'

beforeEach(() => localStorage.clear())

describe('checking an address', () => {
  it('takes a websocket and drops the trailing slash', () => {
    expect(checkEndpoint('  wss://rpc.example.com/  ')).toBe('wss://rpc.example.com')
    expect(checkEndpoint('wss://rpc.example.com:9944')).toBe('wss://rpc.example.com:9944')
  })

  it('allows plain ws only to this machine', () => {
    expect(checkEndpoint('ws://127.0.0.1:9944')).toBe('ws://127.0.0.1:9944')
    expect(() => checkEndpoint('ws://rpc.example.com')).toThrow(/only allowed to this machine/)
  })

  it('refuses anything that is not a websocket', () => {
    expect(() => checkEndpoint('https://rpc.example.com')).toThrow(EndpointError)
    expect(() => checkEndpoint('rpc.example.com')).toThrow(EndpointError)
    expect(() => checkEndpoint('')).toThrow(EndpointError)
  })
})

describe('the endpoints a user adds', () => {
  it('lands after the ones that ship, carrying this chain', () => {
    const added = addEndpoint('Home', 'wss://node.example.com')

    expect(allNetworks().at(-1)).toEqual(added)
    expect(allNetworks()).toHaveLength(Object.keys(NETWORKS).length + 1)
  })

  it('names itself after the host when nobody names it', () => {
    expect(addEndpoint('  ', 'wss://node.example.com:9944').name).toBe('node.example.com:9944')
  })

  it('refuses one it already has, however it ships', () => {
    addEndpoint('Home', 'wss://node.example.com')
    expect(() => addEndpoint('Again', 'wss://node.example.com/')).toThrow(/already in the list/)
    expect(() => addEndpoint('Mainnet', NETWORKS.mainnet.rpc)).toThrow(/already in the list/)
  })

  it('survives a reload, and goes when forgotten', () => {
    const added = addEndpoint('Home', 'wss://node.example.com')
    expect(customNetworks()).toHaveLength(1)

    removeEndpoint(added.id)
    expect(customNetworks()).toEqual([])
    expect(allNetworks()).toHaveLength(Object.keys(NETWORKS).length)
  })
})
