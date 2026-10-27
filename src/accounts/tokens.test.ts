import { beforeEach, describe, expect, it } from 'vitest'
import { loadImported, STORAGE_KEY, useImportedStore } from './tokens'

const store = () => useImportedStore.getState()
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')

const GOLD = '0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0'
const DOLLAR = '0x5fbdb2315678afecb367f032d93f642f64180aa3'

beforeEach(() => {
  localStorage.clear()
  useImportedStore.setState({ imported: {} })
})

describe('imported tokens', () => {
  it('keeps each network to its own contracts', () => {
    store().add('mainnet', GOLD)
    store().add('testnet', DOLLAR)

    expect(stored()).toEqual({ mainnet: [GOLD], testnet: [DOLLAR] })
  })

  it('holds a contract once however often it is imported', () => {
    store().add('mainnet', GOLD)
    store().add('mainnet', GOLD)

    expect(store().imported.mainnet).toEqual([GOLD])
  })

  it('drops a removed contract from storage', () => {
    store().add('mainnet', GOLD)
    store().add('mainnet', DOLLAR)
    store().remove('mainnet', GOLD)

    expect(stored()).toEqual({ mainnet: [DOLLAR] })
  })

  it('leaves storage alone when a removal changes nothing', () => {
    store().remove('mainnet', GOLD)

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('reads back only lowercase contract addresses', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ mainnet: [GOLD, GOLD.toUpperCase().replace('0X', '0x'), 'nope', 7], local: 'x' }),
    )

    expect(loadImported()).toEqual({ mainnet: [GOLD], local: [] })
  })

  it('starts empty from storage it cannot read', () => {
    localStorage.setItem(STORAGE_KEY, '{')

    expect(loadImported()).toEqual({})
  })
})
