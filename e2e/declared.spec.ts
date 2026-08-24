import { expect, test, type Page } from '@playwright/test'
import { fillAddress, pickAddress } from './address'

/**
 * Accounts the wallet declares rather than holds a key for. A proxied one still
 * refuses to send, since the proxy call is not wired. A multisig sends as soon
 * as one of its signatories is in here to put a signature on it.
 */
const A = 'nu7SVAyQhPoGBJfFg7di66oYTV2KVBBeCw3Gt9qTRE2zpSUyb'
const B = 'nu32czLMgUWfEXJgQPyWH3AMdjXbaBoqghDwtJbhaJf9UJJ5U'
const C = 'nu3oNksEGXV3Tsr4sBeRUpcfA5zYp4VvZ7t9uKVPMAe2UCo98'
const BOB = 'nu5sKtuEZG5GH9emAghk9MTdVPBJbieEsSD8Z6UKkA45afKcv'
const TWO_OF_THREE = 'nu2ojmYR9qXUFZgJkJSmfjzJRDakd1GaY6g96HX6QgeT5gWJQ'
const PASSWORD = 'correct horse battery'

const card = (page: Page, name: string) => page.locator('article').filter({ hasText: name })

async function addMultisig(page: Page, threshold = '2') {
  await page.goto('/')
  await page.getByRole('button', { name: 'Multisig' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('Treasury')
  await fillAddress(page, dialog, 'Signatory 1', A)
  await fillAddress(page, dialog, 'Signatory 2', B)
  await dialog.getByRole('button', { name: 'Add signatory' }).click()
  await fillAddress(page, dialog, 'Signatory 3', C)
  await dialog.getByLabel('Threshold').fill(threshold)
  return dialog
}

test('a multisig shows its address before it is created', async ({ page }) => {
  const dialog = await addMultisig(page)

  await expect(dialog.getByText(/spendable by any 2 of 3/)).toBeVisible()
  await expect(dialog.getByText(TWO_OF_THREE.slice(0, 7))).toBeVisible()
})

test('a multisig lands as an account that can receive but not send', async ({ page }) => {
  const dialog = await addMultisig(page)
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(page.getByText('Multisig added')).toBeVisible()
  await expect(card(page, 'Treasury').getByText('multisig')).toBeVisible()
  // Not one of these signatories is in this wallet, so there is nothing here
  // that could sign for it. The menu says as much by leaving items out, which
  // reads as missing rather than as locked, so the card says it in a word
  await expect(card(page, 'Treasury').getByText('watch')).toBeVisible()
  await expect(card(page, 'Treasury').getByRole('button', { name: 'Send' })).toBeDisabled()
  await expect(card(page, 'Treasury').getByRole('button', { name: 'Receive' })).toBeEnabled()

  await page.reload()
  await expect(card(page, 'Treasury').getByText('multisig')).toBeVisible()
})

const PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk'

/** A is what //Alice comes out as, so importing her puts a signatory in here. */
async function importKey(page: Page, name: string, shown: string) {
  await page.goto('/')
  const empty = page.getByRole('button', { name: 'Add account' })
  if (await empty.count()) await empty.first().click()
  else await page.getByRole('button', { name: 'Account', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'From seed' }).check()
  await dialog.getByLabel('Seed', { exact: true }).fill(`${PHRASE}//${name}`)
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await dialog.getByLabel('Repeat password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText(shown)).toBeVisible()
}

const importAlice = (page: Page) => importKey(page, 'Alice', 'nu7SVAy…pSUyb')

test('a multisig sends once one of its signatories is in the wallet', async ({ page }) => {
  await importAlice(page)
  const dialog = await addMultisig(page)
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Multisig added')).toBeVisible()

  const treasury = card(page, 'Treasury')
  await expect(treasury.getByRole('button', { name: 'Send' })).toBeEnabled()
  await treasury.getByRole('button', { name: 'Send' }).click()

  const send = page.getByRole('dialog')
  // Alice signs, the multisig pays, and it takes two of them to move anything
  await expect(send.getByText('Signing as')).toBeVisible()
  await expect(send.getByText('Needs any 2 of 3 signatures')).toBeVisible()
  await fillAddress(page, send, 'Address', C)
  // MAX offers what the form will take. The signatory covers the fee, so all
  // this account holds back is the deposit that keeps it alive
  await send.getByRole('button', { name: 'MAX' }).click()
  await send.getByLabel('Account password').fill(PASSWORD)
  await send.getByRole('button', { name: 'Sign and send' }).click()

  await expect(page.getByText('Signature added')).toBeVisible()

  // One signature down, and the account that started it may call it off
  await treasury.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Multisig approvals' }).click()

  const waiting = page.getByRole('dialog')
  await expect(waiting.getByText('1 of 2 signed')).toBeVisible()
  await expect(waiting.getByRole('button', { name: 'Call it off' })).toBeVisible()
})

/**
 * The other half of a multisig, which on a real setup happens on somebody
 * else's machine. The chain hands that machine a hash, the wallet shows what
 * the hash stands for, and the second signature is what runs the call.
 */
test('the second signatory reads the call and runs it', async ({ page }) => {
  await importAlice(page)
  await importKey(page, 'Bob', 'nu5sKtu…afKcv')

  await page.getByRole('button', { name: 'Multisig' }).click()
  const setup = page.getByRole('dialog')
  await setup.getByLabel('Name').fill('Treasury')
  await fillAddress(page, setup, 'Signatory 1', A)
  await fillAddress(page, setup, 'Signatory 2', BOB)
  await setup.getByLabel('Threshold').fill('2')
  await setup.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Multisig added')).toBeVisible()

  const treasury = card(page, 'Treasury')
  // Alice is one of the two, so this one is no more watched than she is
  await expect(treasury.getByText('watch')).toBeHidden()
  await treasury.getByRole('button', { name: 'Send' }).click()
  const send = page.getByRole('dialog')
  await fillAddress(page, send, 'Address', C)
  await send.getByLabel('Amount').fill('10')
  await send.getByLabel('Account password').fill(PASSWORD)
  await send.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Signature added')).toBeVisible()

  // The call itself is kept here, since the chain keeps only its hash
  const kept = await page.evaluate(() =>
    Object.values(JSON.parse(localStorage.getItem('numen-wallet-calls-v1') ?? '{}') as object),
  )
  expect(kept).toHaveLength(1)

  await treasury.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Multisig approvals' }).click()

  // Alice has signed hers, so there is nothing here for her to do
  const waiting = page.getByRole('dialog')
  await expect(waiting.getByText('1 of 2 signed')).toBeVisible()
  // The whole address, since this is the last look before a signature
  await expect(waiting.getByText('10.0000 tNUMN', { exact: true })).toBeVisible()
  await expect(waiting.getByText(C, { exact: true })).toBeVisible()
  await expect(waiting.getByText('You have signed this one')).toBeVisible()

  // Two of two, so Bob's signature is the one that runs it
  await pickAddress(page, waiting, 'Signing as', 'Bob')
  await waiting.getByLabel('Account password').fill(PASSWORD)
  await waiting.getByRole('button', { name: 'Sign and run it' }).click()
  await expect(page.getByText('Nothing is waiting')).toBeVisible()
})

test('a multisig refuses a threshold its signatories cannot meet', async ({ page }) => {
  const dialog = await addMultisig(page, '4')
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(dialog.getByText(/threshold within their count/)).toBeVisible()
})

test('a proxied account needs a local key to act through', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Proxied' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('Cold')
  await fillAddress(page, dialog, 'Acting for', A)
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(dialog.getByText(/holds no account that could act as the proxy/)).toBeVisible()
})

test('a proxied account spends through the key it named', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Add account' }).first().click()
  const add = page.getByRole('dialog')
  await add.getByRole('radio', { name: 'New account' }).check()
  await add.getByLabel('Name').fill('Signer')
  await add.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await add.getByLabel('Repeat password').fill(PASSWORD)
  await add.getByRole('button', { name: 'Create' }).click()
  await add.getByRole('checkbox').check()
  await add.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'Proxied' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('Cold')
  await fillAddress(page, dialog, 'Acting for', A)
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(page.getByText('Proxied account added')).toBeVisible()
  await expect(card(page, 'Cold').getByText('proxied')).toBeVisible()

  // The key that was named acts for it, so the money leaves the cold account
  // and the fee comes off the one that signed
  await card(page, 'Cold').getByRole('button', { name: 'Send' }).click()
  const send = page.getByRole('dialog')
  await expect(send.getByText('Signed by the proxy, spent from this account')).toBeVisible()
  await fillAddress(page, send, 'Address', B)
  await send.getByLabel('Amount').fill('10')
  await send.getByLabel('Account password').fill(PASSWORD)
  await send.getByRole('button', { name: 'Sign and send' }).click()

  await expect(page.getByText('Transfer sent')).toBeVisible()
})
