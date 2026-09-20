import { expect, test, type Page } from '@playwright/test'
import { fillAddress, pickAddress } from './address'

/**
 * The validator dialogs, end to end against VITE_CHAIN=mock. The mock seats the
 * dev chain's Alice as its one validator and its registrar, and it has already
 * waived the stake for Bob, which is what an invitation leaves behind. The dev
 * phrase restores both. Nothing in the mock rotates sessions, so whoever joins
 * stays queued.
 */
const PASSWORD = 'correct horse battery'
const PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk'
const GRANDPA = `0x${'ab'.repeat(32)}`
const KEYS = `${GRANDPA}${'cd'.repeat(32)}`
const PROOF = `0x${'11'.repeat(128)}`

const card = (page: Page, name: string) => page.locator('article').filter({ hasText: name })

/** The board offers its own button while it is empty, the toolbar once it is not. */
async function openAdd(page: Page) {
  const empty = page.getByRole('button', { name: 'Add account' })
  if (await empty.count()) await empty.first().click()
  else await page.getByRole('button', { name: 'Account', exact: true }).click()
}

async function createKey(page: Page, name: string) {
  await openAdd(page)

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'New account' }).check()
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await dialog.getByLabel('Repeat password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()
}

async function importKey(page: Page, who: string, name: string) {
  await openAdd(page)

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'From seed' }).check()
  await dialog.getByLabel('Seed', { exact: true }).fill(`${PHRASE}//${who}`)
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await dialog.getByLabel('Repeat password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
}

async function openMenu(page: Page, name: string, item: string | RegExp) {
  await card(page, name).getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

async function sign(page: Page, submit: string) {
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: submit, exact: true }).click()
}

async function registerKeys(page: Page, name: string) {
  await openMenu(page, name, 'Seat and session keys')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: 'Session keys' }).click()
  await dialog.getByLabel('Keys', { exact: true }).fill(KEYS)
  await dialog.getByLabel('Proof', { exact: true }).fill(PROOF)
  await sign(page, 'Sign and send')
  await expect(page.getByText('Session keys registered')).toBeVisible()
}

test('a fresh account sees every check it still fails before it can join', async ({ page }) => {
  await page.goto('/')
  await createKey(page, 'Vault')
  await openMenu(page, 'Vault', 'Seat and session keys')

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('none, set them under Session keys')).toBeVisible()
  await expect(dialog.getByText('This account has no on chain identity yet')).toBeVisible()
  await expect(dialog.getByText(/100,000,000\.0000 tNUMN needed/)).toBeVisible()
  await expect(dialog.getByText(/Have the node online with its session keys by block/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Join the set' })).toBeDisabled()
})

test('keys are refused until they read as keys, and stay once signed', async ({ page }) => {
  await page.goto('/')
  await createKey(page, 'Vault')
  await openMenu(page, 'Vault', 'Seat and session keys')

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: 'Session keys' }).click()
  // The command already names this account, which is who the proof is made out to
  await expect(dialog.getByText(/author_rotateKeysWithOwner/)).toBeVisible()
  await expect(dialog.getByText('none', { exact: true })).toBeVisible()

  await dialog.getByLabel('Keys', { exact: true }).fill('0x1234')
  await expect(dialog.getByText('Not the session keys this chain takes')).toBeVisible()

  await dialog.getByLabel('Keys', { exact: true }).fill(KEYS)
  await expect(dialog.getByText(GRANDPA)).toBeVisible()
  await dialog.getByLabel('Proof', { exact: true }).fill('0x1')
  await expect(dialog.getByText('Not a 0x hex string')).toBeVisible()

  await dialog.getByLabel('Proof', { exact: true }).fill(PROOF)
  await sign(page, 'Sign and send')
  await expect(page.getByText('Session keys registered')).toBeVisible()

  // Back on the page it was left on, with the boxes cleared and the keys on chain
  await openMenu(page, 'Vault', 'Seat and session keys')
  await expect(dialog.getByLabel('Keys', { exact: true })).toHaveValue('')
  await expect(dialog.getByText(GRANDPA)).toBeVisible()
  await dialog.getByRole('tab', { name: 'Seat' }).click()
  await expect(dialog.getByText('registered', { exact: true })).toBeVisible()
})

test('an invited account joins the set and leaves it again', async ({ page }) => {
  await page.goto('/')
  await importKey(page, 'Bob', 'Invited')
  await importKey(page, 'Alice', 'Registrar')
  const dialog = page.getByRole('dialog')

  // The account's own half, a channel to be reached on and keys for its node
  await openMenu(page, 'Invited', 'Set an on chain identity')
  await dialog.getByRole('tab', { name: 'Manual' }).click()
  await dialog.getByLabel('Display name', { exact: true }).fill('Invited')
  await dialog.getByLabel('Telegram', { exact: true }).fill('@invited')
  await dialog.getByRole('checkbox').uncheck()
  await sign(page, 'Sign and send')
  await expect(page.getByText('Identity registered')).toBeVisible()
  await registerKeys(page, 'Invited')

  // The registrar's half, which is the last check between the account and a seat
  await openMenu(page, 'Registrar', 'Judge an identity')
  await pickAddress(page, dialog, 'Account', 'Invited')
  await sign(page, 'Sign and send')
  await expect(page.getByText('Judgement recorded')).toBeVisible()

  await openMenu(page, 'Invited', 'Seat and session keys')
  await dialog.getByRole('tab', { name: 'Seat' }).click()
  await expect(dialog.getByText('exempt', { exact: true })).toBeVisible()
  await expect(dialog.getByText('clears the standard')).toBeVisible()
  await sign(page, 'Join the set')
  await expect(page.getByText('Queued for the validator set')).toBeVisible()

  // A running seat turns the same page into the way out, with no stake to wait on
  await openMenu(page, 'Invited', 'Seat and session keys')
  await expect(dialog.getByText('none locked')).toBeVisible()
  await expect(dialog.getByText(/Nothing unlocks the stake/)).toHaveCount(0)
  await sign(page, 'Leave the set')
  await expect(page.getByText('Leaving the validator set')).toBeVisible()

  // Out of the queue, so the page offers the way back in
  await openMenu(page, 'Invited', 'Seat and session keys')
  await expect(dialog.getByRole('button', { name: 'Join the set' })).toBeVisible()
})

test('a sitting validator is offered the way out and nothing else', async ({ page }) => {
  await page.goto('/')
  await importKey(page, 'Alice', 'Registrar')

  await openMenu(page, 'Registrar', 'Seat and session keys')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('received this session')).toBeVisible()
  await expect(dialog.getByText('leaving takes effect', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Join the set' })).toHaveCount(0)
  await sign(page, 'Leave the set')
  await expect(page.getByText('Leaving the validator set')).toBeVisible()
})

test('an account nobody here can sign for has no seat to manage', async ({ page }) => {
  await page.goto('/')
  await openAdd(page)

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'Watch only' }).check()
  await dialog.getByLabel('Name').fill('Watched')
  await fillAddress(page, dialog, 'Address', 'nu7SVAyQhPoGBJfFg7di66oYTV2KVBBeCw3Gt9qTRE2zpSUyb')
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()

  // The chain's own validator, watched here without its key
  await card(page, 'Watched').getByRole('button', { name: 'Account menu' }).click()
  await expect(page.getByRole('menuitem', { name: 'Seat and session keys' })).toHaveCount(0)
})
