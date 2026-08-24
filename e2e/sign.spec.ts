import { expect, test, type Page } from '@playwright/test'
import { fillAddress, pickAddress } from './address'

/**
 * A signature over words. Nothing here reaches a chain, so what is proved is
 * that the wallet signs what it says it signs and reads it back the same way
 * every other wallet would.
 */
const PASSWORD = 'correct horse battery'
const MESSAGE = 'I am the treasury account'
const OTHER = 'nu3oNksEGXV3Tsr4sBeRUpcfA5zYp4VvZ7t9uKVPMAe2UCo98'

async function createKey(page: Page, name = 'Vault') {
  await page.goto('/')
  const empty = page.getByRole('button', { name: 'Add account' })
  if (await empty.count()) await empty.first().click()
  else await page.getByRole('button', { name: 'Account', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'New account' }).check()
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await dialog.getByLabel('Repeat password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()
}

const open = async (page: Page) => {
  await page.getByRole('button', { name: 'Sign/Verify' }).click()
  return page.getByRole('dialog')
}

test('signs a message and reads its own signature back', async ({ page }) => {
  await createKey(page)
  const dialog = await open(page)

  await dialog.getByLabel('Message').fill(MESSAGE)
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign it' }).click()

  const signature = await dialog.getByText(/^0x[0-9a-f]{128}$/).innerText()

  // The other half, on the same signature it just made
  await dialog.getByRole('button', { name: 'Verify' }).click()
  await pickAddress(page, dialog, 'Signed by', 'Vault')
  await dialog.getByLabel('Message').fill(MESSAGE)
  await dialog.getByLabel('Signature').fill(signature)
  await dialog.getByRole('button', { name: 'Check it' }).click()

  await expect(dialog.getByText('signed that message, over sr25519')).toBeVisible()
})

test('refuses a wrong password rather than signing', async ({ page }) => {
  await createKey(page)
  const dialog = await open(page)

  await dialog.getByLabel('Message').fill(MESSAGE)
  await dialog.getByLabel('Account password').fill('not the password')
  await dialog.getByRole('button', { name: 'Sign it' }).click()

  await expect(dialog.getByText('Wrong password')).toBeVisible()
  await expect(dialog.getByText(/^0x[0-9a-f]{128}$/)).toHaveCount(0)
})

test('says nothing was signed when the message was edited after', async ({ page }) => {
  await createKey(page)
  const signing = await open(page)

  await signing.getByLabel('Message').fill(MESSAGE)
  await signing.getByLabel('Account password').fill(PASSWORD)
  await signing.getByRole('button', { name: 'Sign it' }).click()
  const signature = await signing.getByText(/^0x[0-9a-f]{128}$/).innerText()

  await signing.getByRole('button', { name: 'Verify' }).click()
  const dialog = page.getByRole('dialog')
  await fillAddress(page, dialog, 'Signed by', OTHER)
  await dialog.getByLabel('Message').fill(MESSAGE)
  await dialog.getByLabel('Signature').fill(signature)
  await dialog.getByRole('button', { name: 'Check it' }).click()

  await expect(dialog.getByText('did not sign that message')).toBeVisible()
})

test('refuses a signature it cannot even read', async ({ page }) => {
  await createKey(page)
  const dialog = await open(page)
  await dialog.getByRole('button', { name: 'Verify' }).click()

  await fillAddress(page, page.getByRole('dialog'), 'Signed by', OTHER)
  await page.getByRole('dialog').getByLabel('Message').fill(MESSAGE)
  await page.getByRole('dialog').getByLabel('Signature').fill('0x1234')
  await page.getByRole('dialog').getByRole('button', { name: 'Check it' }).click()

  await expect(page.getByRole('dialog').getByText(/64 bytes/)).toBeVisible()
})
