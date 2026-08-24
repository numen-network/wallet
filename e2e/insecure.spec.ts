import { expect, test, type Page } from '@playwright/test'
import { fillAddress } from './address'

/**
 * A page served over plain http on anything but localhost is not a secure
 * context, so `crypto.randomUUID` and `navigator.clipboard` are simply absent.
 * Every LAN test build lands here, and reaching for one used to throw after the
 * work was already done, which reported success as a failure.
 */
async function overPlainHttp(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
  })
  await page.goto('/')
  await expect(page.getByText('No accounts yet.')).toBeVisible()
}

const DEV_PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk'

test('importing a key reports the success it actually had', async ({ page }) => {
  await overPlainHttp(page)

  await page.getByRole('button', { name: 'Add account' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'From seed' }).check()
  await dialog.getByLabel('Seed', { exact: true }).fill(`${DEV_PHRASE}//Alice`)
  await dialog.getByLabel('Name').fill('Alice')
  await dialog.getByLabel('Password', { exact: true }).fill('correct horse battery')
  await dialog.getByLabel('Repeat password').fill('correct horse battery')
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(page.getByText('Account imported')).toBeVisible()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('article')).toHaveCount(1)
})

test('creating a group still works without randomUUID', async ({ page }) => {
  await overPlainHttp(page)

  await page.getByRole('button', { name: 'Group' }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('Cold storage')
  await page.getByRole('button', { name: 'Create' }).click()

  await expect(page.getByRole('heading', { name: 'Cold storage' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Cold storage' })).toBeVisible()
})

test('copying says what is missing rather than throwing', async ({ page }) => {
  await overPlainHttp(page)

  await page.getByRole('button', { name: 'Add account' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'Watch only' }).check()
  await fillAddress(page, dialog, 'Address', 'nu3oNksEGXV3Tsr4sBeRUpcfA5zYp4VvZ7t9uKVPMAe2UCo98')
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()

  await page.getByRole('button', { name: 'Copy Numen address' }).click()
  await expect(page.getByText('Copying needs a page served over https')).toBeVisible()
  // The board is still alive, the failed copy did not take the page down
  await expect(page.locator('article')).toHaveCount(1)
})
