import { beforeEach, describe, expect, it } from 'vitest'
import { emptyLayout, STORAGE_KEY, type Layout } from './layout'
import { useAccountsStore } from './store'

const store = () => useAccountsStore.getState()
const stored = (): Layout => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')

beforeEach(() => {
  localStorage.clear()
  useAccountsStore.setState({ layout: emptyLayout(), keys: [], beforeDrag: null })
})

describe('persistence', () => {
  it('writes every change straight through to storage', () => {
    store().addGroup('Mining')
    expect(stored().groups.map((g) => g.name)).toEqual(['Ungrouped', 'Mining'])
  })

  it('leaves storage alone when an action changes nothing', () => {
    store().renameGroup('gone', 'Nope')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('forgetting an account', () => {
  it('hides it and lets go of the watch entry behind it', () => {
    store().addWatch({ address: 'a', evmAddress: null, name: 'Watched' })
    store().forgetAccount('a')

    expect(store().layout.hidden).toEqual(['a'])
    expect(store().layout.watch).toEqual([])
  })

  it('takes the account back when the same address is watched again', () => {
    store().forgetAccount('a')
    store().addWatch({ address: 'a', evmAddress: null, name: 'Watched' })

    expect(store().layout.hidden).toEqual([])
    expect(store().layout.watch).toHaveLength(1)
  })

  it('does not list an address twice', () => {
    store().forgetAccount('a')
    store().forgetAccount('a')
    expect(store().layout.hidden).toEqual(['a'])
  })
})

describe('renaming', () => {
  it('keeps the chosen name against the address', () => {
    store().renameAccount('a', 'Vault')
    expect(store().layout.names).toEqual({ a: 'Vault' })
  })
})

describe('cancelling a drag', () => {
  it('puts every card back where Escape found it', () => {
    store().addGroup('Cold')
    store().addWatch({ address: 'a', evmAddress: null, name: 'Watched' })
    store().reconcile(['a'])
    const before = store().layout

    store().beginDrag()
    const cold = store().layout.groups[0]!.id
    store().moveAccount('a', cold, 0)
    expect(store().layout.groups[0]!.accounts).toEqual(['a'])

    store().cancelDrag()
    expect(store().layout).toBe(before)
    expect(stored().groups).toEqual(before.groups)
  })

  it('leaves a finished drag alone', () => {
    store().addWatch({ address: 'a', evmAddress: null, name: 'Watched' })
    store().reconcile(['a'])
    store().beginDrag()
    store().endDrag()

    const settled = store().layout
    store().cancelDrag()
    expect(store().layout).toBe(settled)
  })
})
