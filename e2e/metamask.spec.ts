import { expect, test, type Page } from '@playwright/test'
import { expectAddress } from './address'

/** MetaMask is stubbed, so what is proved here is what the wallet asks it for. */
async function withMetaMask(page: Page, outcome: 'accept' | 'reject' | 'fail' = 'accept') {
  await page.addInitScript((mode) => {
    const calls: unknown[] = []
    Object.assign(window, {
      __calls: calls,
      ethereum: {
        request: async (args: unknown) => {
          calls.push(args)
          if (mode === 'reject') throw Object.assign(new Error('User rejected'), { code: 4001 })
          if (mode === 'fail') {
            throw new Error('Could not fetch chain ID. Is your RPC URL correct?')
          }
          // What MetaMask answers with, which the wallet reads back
          const { method } = args as { method: string }
          if (method === 'eth_requestAccounts') {
            return ['0x1234567890abcdef1234567890abcdef12345678']
          }
          if (method === 'eth_estimateGas') return '0x6086'
          if (method === 'eth_gasPrice') return '0x3b9aca00'
          return null
        },
      },
    })
  }, outcome)
  await page.goto('/')
}

const calls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __calls: Array<Record<string, never>> }).__calls)

test('the button stays away when there is no MetaMask', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Add to MetaMask' })).toHaveCount(0)
})

test('hands MetaMask the network the wallet is pointed at', async ({ page }) => {
  await withMetaMask(page)
  await page.getByRole('button', { name: 'Add to MetaMask' }).click()
  await expect(page.getByText('added to MetaMask')).toBeVisible()

  const [call] = (await calls(page)) as unknown as Array<{
    method: string
    params: Array<{
      chainId: string
      chainName: string
      nativeCurrency: { symbol: string; decimals: number }
      rpcUrls: string[]
    }>
  }>

  expect(call?.method).toBe('wallet_addEthereumChain')
  expect(parseInt(call!.params[0]!.chainId, 16)).toBe(320262)
  expect(call!.params[0]!.chainName).toBe('Numen Local')
  expect(call!.params[0]!.nativeCurrency).toEqual({
    name: 'Numen Local',
    symbol: 'tNUMN',
    decimals: 18,
  })
  expect(call!.params[0]!.rpcUrls).toEqual(['http://127.0.0.1:9944'])
})

test('follows the endpoint picker', async ({ page }) => {
  await withMetaMask(page)
  await page.getByRole('combobox', { name: 'RPC endpoint' }).click()
  await page.getByRole('option', { name: 'Numen', exact: true }).click()
  await page.getByRole('button', { name: 'Add to MetaMask' }).click()

  const [call] = (await calls(page)) as unknown as Array<{
    params: Array<{ chainId: string; rpcUrls: string[] }>
  }>
  // The endpoint follows the picker, the chain id follows whatever chain
  // answers there, which for the mock is the same chain as before
  expect(parseInt(call!.params[0]!.chainId, 16)).toBe(320262)
  expect(call!.params[0]!.rpcUrls).toEqual(['https://rpc.numen-network.org'])
})

test('says nothing when the user clicks the prompt away', async ({ page }) => {
  await withMetaMask(page, 'reject')
  await page.getByRole('button', { name: 'Add to MetaMask' }).click()

  // Nothing is announced at all, since walking away is not a failure
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
})

test('repeats the reason MetaMask gives for turning the network down', async ({ page }) => {
  await withMetaMask(page, 'fail')
  await page.getByRole('button', { name: 'Add to MetaMask' }).click()

  await expect(page.getByText(/Could not fetch chain ID/)).toBeVisible()
})

const VAULT = 'nu32czLMgUWfEXJgQPyWH3AMdjXbaBoqghDwtJbhaJf9UJJ5U'

/** Its public key, which is what the EVM side is handed as the destination. */
const VAULT_KEY = '1111111111111111111111111111111111111111111111111111111111111111'

test('asks MetaMask for the call that brings funds back', async ({ page }) => {
  await withMetaMask(page)
  await page.evaluate(
    (address) =>
      localStorage.setItem(
        'numen-wallet-v1',
        JSON.stringify({
          groups: [{ id: 'ungrouped', name: 'Ungrouped', accounts: [address], collapsed: false }],
          names: {},
          hidden: [],
          watch: [{ address, evmAddress: null, name: 'Vault' }],
          extensionConnected: false,
        }),
      ),
    VAULT,
  )
  await page.reload()

  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Bring in from MetaMask' }).click()

  // The address MetaMask is on, and the account the funds are going into
  const dialog = page.getByRole('dialog')
  await expectAddress(dialog, 'From', '0x1234…5678')
  await expectAddress(dialog, 'Into', 'Vault')

  await dialog.getByPlaceholder('0.0').fill('1')
  await dialog.getByRole('button', { name: 'Ask MetaMask' }).click()
  await expect(page.getByText('MetaMask is sending it')).toBeVisible()

  const asked = (await calls(page)) as unknown as Array<{
    method: string
    params: Array<{ from: string; to: string; data: string }>
  }>
  const sent = asked.find((call) => call.method === 'eth_sendTransaction')

  // The chain goes first, since MetaMask signs against whatever it is pointed at
  expect(asked.slice(-2).map((call) => call.method)).toEqual([
    'wallet_addEthereumChain',
    'eth_sendTransaction',
  ])
  expect(sent!.params[0]!.to).toBe('0x0000000000000000000000000000000000000802')
  expect(sent!.params[0]!.from).toBe('0x1234567890abcdef1234567890abcdef12345678')
  expect(sent!.params[0]!.data).toBe(
    `0x040cf020${VAULT_KEY}${'0de0b6b3a7640000'.padStart(64, '0')}`,
  )
})

/** The account an H160 spends from, which is what adding that H160 to the wallet stores. */
const MIRROR = 'nu2uaQWzSyDzXHrgd78sQL2871qL2LpPU6kHeeb4ETtXfnASg'

test('refuses to bring a balance into the very address holding it', async ({ page }) => {
  await withMetaMask(page)
  await page.evaluate(
    (address) =>
      localStorage.setItem(
        'numen-wallet-v1',
        JSON.stringify({
          groups: [{ id: 'ungrouped', name: 'Ungrouped', accounts: [address], collapsed: false }],
          names: {},
          hidden: [],
          watch: [{ address, evmAddress: null, name: 'Mirror' }],
          extensionConnected: false,
        }),
      ),
    MIRROR,
  )
  await page.reload()

  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Bring in from MetaMask' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('This account is that EVM address')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Ask MetaMask' })).toBeDisabled()

  // Nothing was asked of MetaMask beyond which account it is on
  const asked = (await calls(page)) as unknown as Array<{ method: string }>
  expect(asked.every((call) => call.method === 'eth_requestAccounts')).toBe(true)
})
