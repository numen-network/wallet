import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cryptoWaitReady } from '@polkadot/util-crypto'
import type { PolkadotSigner } from 'polkadot-api'
import type { SignerBackend, WalletAccount } from '@/signing/types'
import { newMnemonic } from '@/signing/vault'
import { emptyLayout, UNGROUPED_ID } from './layout'
import { useAccountsStore } from './store'
import { useAccounts } from './useAccounts'

const ALICE_GENERIC = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'
const DEV_PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk'
const ALICE_NUMEN = 'nu7SVAyQhPoGBJfFg7di66oYTV2KVBBeCw3Gt9qTRE2zpSUyb'

const signer = {} as PolkadotSigner
let injected: WalletAccount[] = []
let backends: SignerBackend[] = []

vi.mock('@/signing', () => ({
  availableBackends: async () => backends,
}))

const backend = {
  source: 'extension',
  label: 'Test extension',
  isAvailable: async () => true,
  connect: async () => injected,
} satisfies SignerBackend

const store = () => useAccountsStore.getState()

beforeAll(async () => {
  await cryptoWaitReady()
})

beforeEach(() => {
  localStorage.clear()
  useAccountsStore.setState({ layout: emptyLayout(), keys: [], beforeDrag: null })
  injected = [{ address: ALICE_GENERIC, label: 'Alice', source: 'extension', signer }]
  backends = [backend]
})

describe('useAccounts', () => {
  it('re-encodes extension accounts into Numen and files them under Ungrouped', async () => {
    const { result } = renderHook(() => useAccounts())
    await act(() => result.current.connectExtension())

    await waitFor(() => expect(result.current.accounts).toHaveLength(1))
    expect(result.current.accounts[0]?.address).toBe(ALICE_NUMEN)
    expect(store().layout.groups[0]?.accounts).toEqual([ALICE_NUMEN])
    expect(store().layout.groups[0]?.id).toBe(UNGROUPED_ID)
  })

  it('gives an extension account no EVM address, because it has none', async () => {
    const { result } = renderHook(() => useAccounts())
    await act(() => result.current.connectExtension())

    await waitFor(() => expect(result.current.accounts).toHaveLength(1))
    expect(result.current.accounts[0]?.evmAddress).toBeNull()
    expect(result.current.accounts[0]?.signing).not.toBeNull()
  })

  it('prefers the extension over a watch entry for the same address', async () => {
    store().addWatch({ address: ALICE_NUMEN, evmAddress: null, name: 'Watched Alice' })

    const { result } = renderHook(() => useAccounts())
    await act(() => result.current.connectExtension())

    await waitFor(() => expect(result.current.accounts).toHaveLength(1))
    expect(result.current.accounts[0]?.name).toBe('Alice')
    expect(result.current.accounts[0]?.signing).not.toBeNull()
  })

  it('lets a watch only account keep its EVM address and refuse a signer', async () => {
    injected = []
    store().addWatch({
      address: ALICE_NUMEN,
      evmAddress: '0x1234567890abcdef1234567890abcdef12345678',
      name: 'Mirror',
    })

    const { result } = renderHook(() => useAccounts())
    await waitFor(() => expect(result.current.accounts).toHaveLength(1))

    expect(result.current.accounts[0]?.evmAddress).toBe(
      '0x1234567890abcdef1234567890abcdef12345678',
    )
    expect(result.current.accounts[0]?.signing).toBeNull()
  })

  it('shows the user chosen name over the one the extension supplies', async () => {
    store().renameAccount(ALICE_NUMEN, 'Vault')

    const { result } = renderHook(() => useAccounts())
    await act(() => result.current.connectExtension())

    await waitFor(() => expect(result.current.accounts[0]?.name).toBe('Vault'))
  })

  it('keeps a forgotten account out of the list', async () => {
    store().forgetAccount(ALICE_NUMEN)

    const { result } = renderHook(() => useAccounts())
    await act(() => result.current.connectExtension())

    await waitFor(() => expect(result.current.accounts).toHaveLength(0))
  })

  it('lists a local key as its own source, locked until a password arrives', async () => {
    injected = []
    const created = store().importSuri('Vault', newMnemonic(), 'correct horse battery')

    const { result } = renderHook(() => useAccounts())
    await waitFor(() => expect(result.current.accounts).toHaveLength(1))

    expect(result.current.accounts[0]?.source).toBe('keystore')
    expect(result.current.accounts[0]?.address).toBe(created)
    expect(result.current.accounts[0]?.signing).toBeNull()
  })

  it('lets the extension win over a local key for the same address', async () => {
    store().importSuri('Alice', `${DEV_PHRASE}//Alice`, 'password')

    const { result } = renderHook(() => useAccounts())
    await act(() => result.current.connectExtension())

    await waitFor(() => expect(result.current.accounts).toHaveLength(1))
    expect(result.current.accounts[0]?.source).toBe('extension')
  })

  it('reports a missing extension rather than pretending it connected', async () => {
    backends = []
    const { result } = renderHook(() => useAccounts())

    await expect(result.current.connectExtension()).rejects.toThrow(/No signing extension/)
    expect(store().layout.extensionConnected).toBe(false)
  })
})
