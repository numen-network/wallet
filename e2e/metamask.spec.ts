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
      blockExplorerUrls: string[]
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
  expect(call!.params[0]!.blockExplorerUrls).toEqual(['http://127.0.0.1:3000'])
})

test('follows the endpoint picker', async ({ page }) => {
  await withMetaMask(page)
  await page.getByRole('combobox', { name: 'RPC endpoint' }).click()
  await page.getByRole('option', { name: 'Numen', exact: true }).click()
  await page.getByRole('button', { name: 'Add to MetaMask' }).click()

  const [call] = (await calls(page)) as unknown as Array<{
    params: Array<{ chainId: string; rpcUrls: string[]; blockExplorerUrls: string[] }>
  }>
  // The endpoint follows the picker, the chain id follows whatever chain
  // answers there, which for the mock is the same chain as before
  expect(parseInt(call!.params[0]!.chainId, 16)).toBe(320262)
  expect(call!.params[0]!.rpcUrls).toEqual(['https://rpc.numen-network.org'])
  expect(call!.params[0]!.blockExplorerUrls).toEqual(['https://explorer.numen-network.org'])
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
    await expect(page.getByRole('menuitem', { name: 'Send from MetaMask' })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: 'Token balances' })).toHaveCount(0)
    await page.keyboard.press('Escape')
  }
})

/** The mock chain's token on six decimals. */
const MUSD = '0x5fbdb2315678afecb367f032d93f642f64180aa3'

/** A second address MetaMask does not hold, for a token to land on. */
const EVM2 = '0x9e4c2b1f7a3d5e6f8091a2b3c4d5e6f708192a3b'
const MIRROR2 = 'nu5JDu2uZr7yS4ujGYsSBrHghTHzYcKRspQiXBqgJnTgLB9LQ'

/** Opens Send on the card and switches the dialog over to a token. */
async function sendingToken(page: Page, name: string, token: RegExp) {
  await card(page, name).getByRole('button', { name: 'Send' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('combobox', { name: 'Token' }).click()
  await page.getByRole('option', { name: token }).click()
  return dialog
}

/** An address the mock chain credits with neither of its tokens. */
const BARE = '0x5a1e7f3c9b2d4e6f8a0b1c2d3e4f5a6b7c8d0009'
const BARE_MIRROR = 'nu4CxPqtTtXohWLqjKxB6eSjHcbeFKccK2zvawcjc4m36z5aa'

const tokenBalances = async (page: Page, name: string) => {
  await card(page, name).getByRole('button', { name: 'Tokens' }).click()
  return page.getByRole('dialog')
}

test('lists what an EVM address holds in a dialog, not on its card', async ({ page }) => {
  await withMetaMask(page)
  await watching(page, [{ address: MIRROR, evmAddress: EVM, name: 'Mirror' }])

  await expect(card(page, 'Mirror').getByText('mUSD')).toHaveCount(0)

  const dialog = await tokenBalances(page, 'Mirror')
  await expect(dialog.getByText('Mock Dollar')).toBeVisible()
  await expect(dialog.locator('img[src$="/wtmr.svg"]')).toHaveCount(2)
  await expect(dialog.getByText('525.694')).toBeVisible()
  await expect(dialog.getByText('1,866.8')).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'View on the explorer' }).first()).toHaveAttribute(
    'href',
    `http://127.0.0.1:3000/token/${MUSD}`,
  )
})

test('says so when an EVM address holds none of the tokens', async ({ page }) => {
  await withMetaMask(page)
  await watching(page, [{ address: BARE_MIRROR, evmAddress: BARE, name: 'Bare' }])

  const dialog = await tokenBalances(page, 'Bare')
  await expect(dialog.getByText('Bare holds none of the tokens the wallet shows.')).toBeVisible()
})

test("opens Send with the row's token already picked", async ({ page }) => {
  await withMetaMask(page)
  await watching(page, [
    { address: MIRROR, evmAddress: EVM, name: 'Mirror' },
    { address: MIRROR2, evmAddress: EVM2, name: 'Cold' },
  ])

  await (await tokenBalances(page, 'Mirror')).getByRole('button', { name: 'Send mUSD' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('combobox', { name: 'Token' })).toContainText('mUSD, Mock Dollar')
  await pickAddress(page, dialog, 'To', /Cold/)
  await dialog.getByPlaceholder('0.0').fill('2')
  await dialog.getByRole('button', { name: 'Ask MetaMask' }).click()
  await expect(page.getByText('MetaMask is sending it')).toBeVisible()

  const asked = (await calls(page)) as unknown as Array<{
    method: string
    params: Array<{ to: string; data: string }>
  }>
  const sent = asked.find((call) => call.method === 'eth_sendTransaction')
  expect(sent!.params[0]!.to).toBe(MUSD)
  expect(sent!.params[0]!.data.endsWith((2_000_000).toString(16).padStart(64, '0'))).toBe(true)
})

test('opens Receive with only the EVM address for a token', async ({ page }) => {
  await withMetaMask(page)
  await watching(page, [{ address: MIRROR, evmAddress: EVM, name: 'Mirror' }])

  await (await tokenBalances(page, 'Mirror')).getByRole('button', { name: 'Receive mUSD' }).click()

  const dialog = page.getByRole('dialog', { name: 'Receive mUSD' })
  await expect(dialog.getByText('EVM address')).toBeVisible()
  await expect(dialog.getByText(EVM)).toBeVisible()
  await expect(dialog.getByText('Numen address')).toHaveCount(0)
})

test('keeps token balances off a Numen account', async ({ page }) => {
  await withMetaMask(page)
  await watching(page, [{ address: VAULT, evmAddress: null, name: 'Vault' }])

  await expect(card(page, 'Vault').getByRole('button', { name: 'Receive' })).toBeVisible()
  await expect(card(page, 'Vault').getByRole('button', { name: 'Tokens' })).toHaveCount(0)
})

test('offers what an EVM address holds in its Send dialog', async ({ page }) => {
  await withMetaMask(page)
  await watching(page, [{ address: MIRROR, evmAddress: EVM, name: 'Mirror' }])

  await card(page, 'Mirror').getByRole('button', { name: 'Send' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('combobox', { name: 'Token' }).click()
  await expect(page.getByRole('option', { name: 'tNUMN' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'wMOCK, Wrapped Mock' })).toBeVisible()
  await page.getByRole('option', { name: 'mUSD, Mock Dollar' }).click()

  await expect(dialog.getByText('holds 525.694 mUSD')).toBeVisible()
})

test('asks MetaMask for a token transfer to the contract', async ({ page }) => {
  await withMetaMask(page)
  await watching(page, [
    { address: MIRROR, evmAddress: EVM, name: 'Mirror' },
    { address: MIRROR2, evmAddress: EVM2, name: 'Cold' },
  ])

  const dialog = await sendingToken(page, 'Mirror', /mUSD/)
  await pickAddress(page, dialog, 'To', /Cold/)
  await dialog.getByPlaceholder('0.0').fill('1.5')
  await dialog.getByRole('button', { name: 'Ask MetaMask' }).click()
  await expect(page.getByText('MetaMask is sending it')).toBeVisible()

  const asked = (await calls(page)) as unknown as Array<{
    method: string
    params: Array<{ from: string; to: string; data: string }>
  }>
  const sent = asked.find((call) => call.method === 'eth_sendTransaction')

  // Six decimals, so one and a half is 1,500,000 of the smallest unit
  expect(sent!.params[0]!.from).toBe(EVM)
  expect(sent!.params[0]!.to).toBe(MUSD)
  expect(sent!.params[0]!.data).toBe(
    `0xa9059cbb${EVM2.slice(2).padStart(64, '0')}${(1_500_000).toString(16).padStart(64, '0')}`,
  )
})

test('refuses a Numen address as the place a token goes', async ({ page }) => {
  await withMetaMask(page)
  await watching(page, [{ address: MIRROR, evmAddress: EVM, name: 'Mirror' }])

  const dialog = await sendingToken(page, 'Mirror', /mUSD/)
  await dialog.getByRole('button', { name: 'To', exact: true }).click()
  await page.getByPlaceholder('0x…').fill(VAULT)
  await expect(page.getByText('Not an EVM address')).toBeVisible()
  await expect(page.getByText('Use this address')).toHaveCount(0)
})

test('refuses to send a token into its own contract', async ({ page }) => {
  await withMetaMask(page)
  await watching(page, [{ address: MIRROR, evmAddress: EVM, name: 'Mirror' }])

  const dialog = await sendingToken(page, 'Mirror', /mUSD/)
  await dialog.getByRole('button', { name: 'To', exact: true }).click()
  await page.getByPlaceholder('0x…').fill(MUSD)
  await page.getByText('Use this address').click()
  await dialog.getByPlaceholder('0.0').fill('1')

  await expect(dialog.getByText("That is the token's own contract")).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Ask MetaMask' })).toBeDisabled()
})
