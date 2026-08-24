import { expect, test, type Page } from '@playwright/test'
import { fillAddress } from './address'

/**
 * Drives the paths that need a signer. The injected extension below is a stub,
 * and the mock repository never looks at a signature, so this exercises the
 * wallet's own wiring rather than any cryptography.
 */
const ALICE_GENERIC = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'
const ALICE_NUMEN = 'nu7SVAyQhPoGBJfFg7di66oYTV2KVBBeCw3Gt9qTRE2zpSUyb'
const PASSWORD = 'correct horse battery'
const DESTINATION = 'nu3oNksEGXV3Tsr4sBeRUpcfA5zYp4VvZ7t9uKVPMAe2UCo98'

async function withExtension(page: Page) {
  await page.addInitScript((address) => {
    const signature = `0x${'00'.repeat(65)}`
    Object.assign(window, {
      injectedWeb3: {
        'stub-extension': {
          version: '0.0.1',
          enable: async () => ({
            signer: {
              signPayload: async () => ({ id: 1, signature }),
              signRaw: async () => ({ id: 1, signature }),
            },
            accounts: {
              get: async () => [{ address, name: 'Alice', type: 'sr25519' }],
              subscribe: () => () => {},
            },
          }),
        },
      },
    })
  }, ALICE_GENERIC)
  await page.goto('/')
}

async function connect(page: Page) {
  await page.getByRole('button', { name: 'Add account' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Connect' }).click()
  await expect(page.getByText('Alice')).toBeVisible()
}

test('importing from the extension fills the wallet', async ({ page }) => {
  await withExtension(page)
  await connect(page)

  const card = page.locator('article').filter({ hasText: 'Alice' })
  await expect(card.getByText(ALICE_NUMEN.slice(0, 7))).toBeVisible()
  await expect(card.getByRole('button', { name: 'Send' })).toBeEnabled()
  // An sr25519 key has no H160, so the card carries one address only
  await expect(card.getByText('EVM')).toHaveCount(0)
})

test('an authorised extension reconnects on the next visit', async ({ page }) => {
  await withExtension(page)
  await connect(page)

  await page.reload()
  await expect(page.getByText('Alice')).toBeVisible()
})

/**
 * The extension answers a tick after the page does, so the board is drawn once
 * without its accounts. Reading that as accounts the wallet no longer has is
 * what used to send them to the end of the board on every reload.
 */
test('an extension account keeps its place across a reload', async ({ page }) => {
  await withExtension(page)
  await connect(page)

  // A second account, so there is somewhere for the first to be pushed to
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  const add = page.getByRole('dialog')
  await add.getByRole('radio', { name: 'New account' }).check()
  await add.getByLabel('Name').fill('Vault')
  await add.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await add.getByLabel('Repeat password').fill(PASSWORD)
  await add.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  const first = page.locator('article').first()
  await expect(first).toContainText('Alice')

  for (const _ of [1, 2]) {
    await page.reload()
    await expect(page.getByText('Alice')).toBeVisible()
    await expect(first).toContainText('Alice')
  }
})

test('send refuses an amount the account cannot cover', async ({ page }) => {
  await withExtension(page)
  await connect(page)

  await page.locator('article').filter({ hasText: 'Alice' }).getByRole('button', { name: 'Send' }).click()
  const dialog = page.getByRole('dialog')
  await fillAddress(page, dialog, 'Address', DESTINATION)
  await dialog.getByPlaceholder('0.0').fill('99999999999')
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  await expect(dialog.getByText(/within the transferable balance/)).toBeVisible()
})

test('send refuses an address it cannot resolve', async ({ page }) => {
  await withExtension(page)
  await connect(page)

  await page.locator('article').filter({ hasText: 'Alice' }).getByRole('button', { name: 'Send' }).click()
  const dialog = page.getByRole('dialog')
  // The box will not take it, so nothing reaches the form
  await dialog.getByRole('button', { name: 'Address', exact: true }).click()
  await page.getByPlaceholder('nu… or 0x…').fill('not an address')
  await expect(page.getByText('Not a Numen or EVM address')).toBeVisible()
  await expect(page.getByText('Use this address')).toHaveCount(0)

  await page.keyboard.press('Escape')
  await dialog.getByPlaceholder('0.0').fill('1')
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  await expect(dialog.getByText('Enter a Numen or EVM address')).toBeVisible()
})

test('MAX sends everything the fee leaves behind', async ({ page }) => {
  await withExtension(page)
  await connect(page)

  await page.locator('article').filter({ hasText: 'Alice' }).getByRole('button', { name: 'Send' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/Estimated fee/)).toBeVisible()

  await fillAddress(page, dialog, 'Address', DESTINATION)
  await dialog.getByRole('button', { name: 'MAX' }).click()
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  await expect(page.getByText('Transfer confirmed')).toBeVisible()
  await expect(dialog).toHaveCount(0)
})
