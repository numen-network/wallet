import { expect, test, type Page } from '@playwright/test'
import { expectAddress, pickAddress } from './address'

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
          // Numen Local, so nothing asks MetaMask to switch chains
          if (method === 'eth_chainId') return '0x4e306'
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

/** The accounts the wallet finds already saved when it loads. */
async function watching(
  page: Page,
  entries: Array<{ address: string; evmAddress: string | null; name: string }>,
) {
  await page.evaluate(
    (watch) =>
      localStorage.setItem(
        'numen-wallet-v1',
        JSON.stringify({
          groups: [
            {
              id: 'ungrouped',
              name: 'Ungrouped',
              accounts: watch.map((entry) => entry.address),
              collapsed: false,
            },
          ],
          names: {},
          hidden: [],
          watch,
          extensionConnected: false,
        }),
      ),
    entries,
  )
  await page.reload()
}

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

/** The address the stubbed MetaMask is on. */
const EVM = '0x1234567890abcdef1234567890abcdef12345678'

/** The account an H160 spends from, which is what adding that H160 to the wallet stores. */
const MIRROR = 'nu2uaQWzSyDzXHrgd78sQL2871qL2LpPU6kHeeb4ETtXfnASg'

const card = (page: Page, name: string) => page.locator('article').filter({ hasText: name })

test('asks MetaMask for the call that brings funds back', async ({ page }) => {
  await withMetaMask(page)
  await watching(page, [
    { address: MIRROR, evmAddress: EVM, name: 'Mirror' },
    { address: VAULT, evmAddress: null, name: 'Vault' },
  ])

  await card(page, 'Mirror').getByRole('button', { name: 'Send' }).click()

  // The card is that address, so From fills itself in
  const dialog = page.getByRole('dialog')
  await expectAddress(dialog, 'From', '0x1234…5678')
  await pickAddress(page, dialog, 'Into', /Vault/)

  await dialog.getByPlaceholder('0.0').fill('1')
  await dialog.getByRole('button', { name: 'Ask MetaMask' }).click()
  await expect(page.getByText('MetaMask is sending it')).toBeVisible()

  const asked = (await calls(page)) as unknown as Array<{
    method: string
    params: Array<{ from: string; to: string; data: string }>
  }>
  const sent = asked.find((call) => call.method === 'eth_sendTransaction')

  // MetaMask is already sitting on Numen, so it is never asked to switch
  expect(asked.some((call) => call.method === 'wallet_addEthereumChain')).toBe(false)
  expect(sent!.params[0]!.to).toBe('0x0000000000000000000000000000000000000802')
  expect(sent!.params[0]!.from).toBe(EVM)
  expect(sent!.params[0]!.data).toBe(
    `0x040cf020${VAULT_KEY}${'0de0b6b3a7640000'.padStart(64, '0')}`,
  )
})

test('refuses to bring a balance into the very address holding it', async ({ page }) => {
  await withMetaMask(page)
  await watching(page, [{ address: MIRROR, evmAddress: EVM, name: 'Mirror' }])

  await card(page, 'Mirror').getByRole('button', { name: 'Send' }).click()

  const dialog = page.getByRole('dialog')
  await pickAddress(page, dialog, 'Into', /Mirror/)
  await expect(dialog.getByText('This account is that EVM address')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Ask MetaMask' })).toBeDisabled()

  // Nothing was asked of MetaMask beyond which account it is on
  const asked = (await calls(page)) as unknown as Array<{ method: string }>
  expect(asked.every((call) => call.method === 'eth_requestAccounts')).toBe(true)
})

test('offers no menu item for what the Send button already does', async ({ page }) => {
  await withMetaMask(page)
  await watching(page, [
    { address: MIRROR, evmAddress: EVM, name: 'Mirror' },
    { address: VAULT, evmAddress: null, name: 'Vault' },
  ])

  for (const name of ['Mirror', 'Vault']) {
    await card(page, name).getByRole('button', { name: 'Account menu' }).click()
    await expect(page.getByRole('menuitem', { name: 'Rename this account' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Bring in from MetaMask' })).toHaveCount(0)
    await page.keyboard.press('Escape')
  }
})
