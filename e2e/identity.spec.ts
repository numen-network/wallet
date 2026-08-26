import { expect, test, type Page } from '@playwright/test'
import { expectAddress, fillAddress, pickAddress } from './address'

/**
 * On chain identity, end to end against VITE_CHAIN=mock. The mock keeps a
 * registration per account and drops the judgements when the identity changes,
 * which is the part the card reads to say whether the account qualifies.
 */
const PASSWORD = 'correct horse battery'
const SUB = 'nu3oNksEGXV3Tsr4sBeRUpcfA5zYp4VvZ7t9uKVPMAe2UCo98'

const card = (page: Page, name = 'Vault') => page.locator('article').filter({ hasText: name })

/** The board offers its own button while it is empty, the toolbar once it is not. */
async function openAdd(page: Page) {
  const empty = page.getByRole('button', { name: 'Add account' })
  if (await empty.count()) await empty.first().click()
  else await page.getByRole('button', { name: 'Account', exact: true }).click()
}

async function createKey(page: Page, name = 'Vault') {
  await page.goto('/')
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

async function watchOnly(page: Page, name: string, address: string) {
  await openAdd(page)

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'Watch only' }).check()
  await dialog.getByLabel('Name').fill(name)
  await fillAddress(page, dialog, 'Address', address)
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
}

async function openMenu(page: Page, item: string | RegExp, name = 'Vault') {
  await card(page, name).getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

/**
 * One menu item, two tabs behind it. The automatic one leads, so anything that
 * types into the eight field form has to reach for the other tab first.
 */
async function openIdentity(page: Page, tab: 'Automatic' | 'Manual') {
  await openMenu(page, /(Set an|Edit the) on chain identity/)
  if (tab === 'Manual') {
    await page.getByRole('dialog').getByRole('button', { name: 'Manual' }).click()
  }
}

/**
 * The dialog asks the registrar in the same signature by default, which is the
 * whole point of it. `ask: false` is the path for somebody who only wants the
 * identity on chain.
 */
async function setIdentity(
  page: Page,
  fields: Record<string, string>,
  { ask = true }: { ask?: boolean } = {},
) {
  await openIdentity(page, 'Manual')

  const dialog = page.getByRole('dialog')
  for (const [label, value] of Object.entries(fields)) {
    await dialog.getByLabel(label, { exact: true }).fill(value)
  }
  if (!ask) await dialog.getByRole('checkbox').uncheck()
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
}

test('registering and asking a registrar is one signature', async ({ page }) => {
  await createKey(page)
  await setIdentity(page, { 'Display name': 'Alice', Telegram: '@alice' })

  await expect(page.getByText('Identity registered')).toBeVisible()
  await expect(card(page).getByText('Alice', { exact: true })).toBeVisible()
  // Already waiting on a registrar, without a second trip through the menu
  await expect(card(page).getByRole('img', { name: /being paid to check/ })).toBeVisible()

  // One call reached the chain, not two
  await page.getByRole('button', { name: 'Activity' }).click()
  const sent = page.getByRole('region', { name: 'Sent from this tab' })
  await expect(sent.getByText('Set identity')).toHaveCount(1)
})

test('an identity can go on chain with nobody asked to check it', async ({ page }) => {
  await createKey(page)
  await setIdentity(page, { 'Display name': 'Alice', X: '@alice' }, { ask: false })

  await expect(page.getByText('Identity registered')).toBeVisible()
  await expect(card(page).getByRole('img', { name: /No registrar has checked/ })).toBeVisible()
})

test('the dialog says which fields a registrar will check', async ({ page }) => {
  await createKey(page)
  await openIdentity(page, 'Manual')

  // The bot never takes a manual request, so the list starts at the human
  // registrar, which declares X and sorts the fields by that
  const dialog = page.getByRole('dialog')
  // Which registrar is a choice, and it decides how the fields sort
  await expectAddress(dialog, 'Registrar', '1 · 0.5000')
  await expect(dialog.getByText('Checked by this registrar', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Not checked by this registrar')).toBeVisible()
  await expect(dialog.getByText(/deposit, returned when the identity is cleared/)).toBeVisible()
  // Nothing here talks about what the chain does with a verdict afterwards
  await expect(dialog.getByText(/[Gg]overnance/)).toHaveCount(0)
})

test('a field the chain cannot hold is refused before it is signed', async ({ page }) => {
  await createKey(page)
  await openIdentity(page, 'Manual')

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Display name', { exact: true }).fill('a'.repeat(33))
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  await expect(dialog.getByText('33 bytes, 32 is the most the chain holds')).toBeVisible()
  await expect(dialog).toBeVisible()
})

test('an identity with no channel has nothing for a registrar to check', async ({ page }) => {
  await createKey(page)
  await setIdentity(page, { 'Display name': 'Alice' }, { ask: false })

  await openMenu(page, 'Ask a registrar')
  await expect(page.getByRole('dialog').getByText(/claims no X, Telegram or Discord/)).toBeVisible()
})

test('asking a registrar leaves a request the account can withdraw', async ({ page }) => {
  await createKey(page)
  await setIdentity(page, { 'Display name': 'Alice', Telegram: '@alice' }, { ask: false })

  await openMenu(page, 'Ask a registrar')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/Claiming Telegram/)).toBeVisible()
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Registrar asked')).toBeVisible()

  await openMenu(page, 'Withdraw the request')
  await expect(dialog.getByText(/Registrar 1 is being paid/)).toBeVisible()
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Withdraw it' }).click()
  await expect(page.getByText('Request withdrawn')).toBeVisible()
})

test('clearing takes the identity off the card', async ({ page }) => {
  await createKey(page)
  await setIdentity(page, { 'Display name': 'Alice', X: '@alice' }, { ask: false })
  await expect(card(page).getByText('Alice', { exact: true })).toBeVisible()

  await openMenu(page, 'Clear on chain identity')
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Clear it' }).click()

  await expect(page.getByText('Identity cleared')).toBeVisible()
  await expect(card(page).getByText('Alice', { exact: true })).toBeHidden()
})

test('subs go up as one list, and each one costs the parent a deposit', async ({ page }) => {
  await createKey(page)
  await setIdentity(page, { 'Display name': 'Numen', Telegram: '@numen' }, { ask: false })
  await expect(page.getByText('Identity registered')).toBeVisible()

  await openMenu(page, 'Sub accounts')
  const dialog = page.getByRole('dialog')
  // Nothing held while the list is empty
  await expect(dialog.getByText(/^0\.00 tNUMN held/)).toBeVisible()

  await fillAddress(page, dialog, 'Add an account', SUB)
  await dialog.getByLabel('Called').fill('Payouts')

  // Signing over a filled in box would drop what is in it
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Add the account to the list before signing')).toBeVisible()

  await dialog.getByRole('button', { name: 'Add to the list' }).click()

  // The row is only in the form until it is signed, and the deposit follows it
  await expect(dialog.getByText('Payouts')).toBeVisible()
  await expect(dialog.getByText(/^5\.53 tNUMN held/)).toBeVisible()

  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Sub accounts saved')).toBeVisible()
})

test('a sub reads as the parent as soon as the list is signed', async ({ page }) => {
  await createKey(page)
  await watchOnly(page, 'Payouts', SUB)
  await setIdentity(page, { 'Display name': 'Numen', Telegram: '@numen' }, { ask: false })
  await expect(page.getByText('Identity registered')).toBeVisible()

  await openMenu(page, 'Sub accounts')
  const dialog = page.getByRole('dialog')
  await pickAddress(page, dialog, 'Add an account', 'Payouts')
  await dialog.getByLabel('Called').fill('Payouts')
  await dialog.getByRole('button', { name: 'Add to the list' }).click()
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  // The record the call wrote belongs to the sub rather than to whoever signed,
  // and the board has to say so without being reloaded
  await expect(page.getByText('Sub accounts saved')).toBeVisible()
  await expect(card(page, 'Payouts').getByText('Numen/Payouts')).toBeVisible()
})

test('a sub can reject the parent identity on its own signature', async ({ page }) => {
  await createKey(page)
  await createKey(page, 'Payouts')
  await setIdentity(page, { 'Display name': 'Numen', Telegram: '@numen' }, { ask: false })

  await openMenu(page, 'Sub accounts')
  const list = page.getByRole('dialog')
  await pickAddress(page, list, 'Add an account', 'Payouts')
  await list.getByLabel('Called').fill('Payouts')
  await list.getByRole('button', { name: 'Add to the list' }).click()
  await list.getByLabel('Account password').fill(PASSWORD)
  await list.getByRole('button', { name: 'Sign and send' }).click()
  await expect(card(page, 'Payouts').getByText('Numen/Payouts')).toBeVisible()

  // The parent is not asked, and the deposit it put up is forfeit to the sub
  await openMenu(page, 'Reject the parent identity', 'Payouts')
  const quit = page.getByRole('dialog')
  await expect(quit.getByText(/5\.53 tNUMN deposit as the penalty/)).toBeVisible()
  await quit.getByLabel('Account password').fill(PASSWORD)
  await quit.getByRole('button', { name: 'Reject it' }).click()

  await expect(page.getByText('Parent identity rejected')).toBeVisible()
  await expect(card(page, 'Payouts').getByText('Numen/Payouts')).toBeHidden()

  // And the list the parent signed is one shorter without being asked again
  await openMenu(page, 'Sub accounts')
  await expect(page.getByRole('dialog').getByText(/^0\.00 tNUMN held/)).toBeVisible()
})

test('a multisig named a sub rejects it through its signatories', async ({ page }) => {
  await createKey(page)
  await createKey(page, 'Payouts')

  await page.getByRole('button', { name: 'Multisig' }).click()
  const setup = page.getByRole('dialog')
  await setup.getByLabel('Name').fill('Treasury')
  await pickAddress(page, setup, 'Signatory 1', 'Vault')
  await pickAddress(page, setup, 'Signatory 2', 'Payouts')
  await setup.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Multisig added')).toBeVisible()

  await setIdentity(page, { 'Display name': 'Numen', Telegram: '@numen' }, { ask: false })
  await openMenu(page, 'Sub accounts')
  const list = page.getByRole('dialog')
  await pickAddress(page, list, 'Add an account', 'Treasury')
  await list.getByLabel('Called').fill('Cold')
  await list.getByRole('button', { name: 'Add to the list' }).click()
  await list.getByLabel('Account password').fill(PASSWORD)
  await list.getByRole('button', { name: 'Sign and send' }).click()
  await expect(card(page, 'Treasury').getByText('Numen/Cold')).toBeVisible()

  // A multisig holds no key of its own, so the way out runs on a signature
  // from one of the accounts behind it
  await openMenu(page, 'Reject the parent identity', 'Treasury')
  const quit = page.getByRole('dialog')
  await expect(quit.getByText('Signing as')).toBeVisible()
  await quit.getByLabel('Account password').fill(PASSWORD)
  await quit.getByRole('button', { name: 'Reject it' }).click()

  await expect(page.getByText('Signature added')).toBeVisible()
})

/**
 * Everything on the menu that ends in a signature is open to a multisig, since
 * a multisig is an account like any other once somebody wraps the call. What is
 * worth proving is where the record lands, which is on the multisig rather than
 * on whoever signed last.
 */
test('a multisig sets an identity of its own', async ({ page }) => {
  await createKey(page)
  await createKey(page, 'Payouts')

  await page.getByRole('button', { name: 'Multisig' }).click()
  const setup = page.getByRole('dialog')
  await setup.getByLabel('Name').fill('Treasury')
  await pickAddress(page, setup, 'Signatory 1', 'Vault')
  await pickAddress(page, setup, 'Signatory 2', 'Payouts')
  await setup.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Multisig added')).toBeVisible()

  await openMenu(page, /Set an on chain identity/, 'Treasury')
  const form = page.getByRole('dialog')
  await form.getByRole('button', { name: 'Manual' }).click()
  await form.getByLabel('Display name', { exact: true }).fill('Cold Store')
  await form.getByRole('checkbox').uncheck()
  await expect(form.getByText('Signing as')).toBeVisible()
  await form.getByLabel('Account password').fill(PASSWORD)
  await form.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Signature added')).toBeVisible()

  await openMenu(page, 'Multisig approvals', 'Treasury')
  const waiting = page.getByRole('dialog')
  await pickAddress(page, waiting, 'Signing as', 'Payouts')
  await waiting.getByLabel('Account password').fill(PASSWORD)
  await waiting.getByRole('button', { name: 'Sign and run it' }).click()
  await expect(page.getByText('Nothing is waiting')).toBeVisible()

  await expect(card(page, 'Treasury').getByText('Cold Store')).toBeVisible()
  await expect(card(page, 'Vault').getByText('Cold Store')).toBeHidden()
})

test('a watch only account has no identity to set', async ({ page }) => {
  await page.goto('/')
  await watchOnly(page, 'Vault', SUB)

  await card(page).getByRole('button', { name: 'Account menu' }).click()
  await expect(page.getByRole('menuitem', { name: 'Set an on chain identity' })).toBeHidden()
})

test('the identity never crowds out the name the wallet gave the account', async ({ page }) => {
  await createKey(page)
  await setIdentity(page, { 'Display name': 'A rather long identity name', X: '@alice' }, { ask: false })
  await expect(page.getByText('Identity registered')).toBeVisible()

  // Both, and the judgement mark says which registrars have looked at it
  await expect(card(page).getByText('Vault', { exact: true })).toBeVisible()
  await expect(card(page).getByText('A rather long identity name')).toBeVisible()
  await expect(card(page).getByRole('img', { name: /No registrar has checked/ })).toBeVisible()
})

test('reading the menu with the button held down does not drag the card', async ({ page }) => {
  await createKey(page)
  await card(page).getByRole('button', { name: 'Account menu' }).click()

  // A press inside the menu reaches the card through React, not the DOM, so the
  // guard the card drags behind has to cover the portal as well
  const item = page.getByRole('menuitem', { name: 'Rename this account' })
  const box = (await item.boundingBox())!
  await page.mouse.move(box.x + 10, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 90, box.y + box.height / 2, { steps: 8 })
  await page.mouse.up()

  await expect(page.locator('body.dragging')).toHaveCount(0)
  await expect(card(page)).toBeVisible()
})

test('typing into a field keeps the cursor there', async ({ page }) => {
  await createKey(page)
  await openIdentity(page, 'Manual')

  // fill() sets a value in one go, which hides a form that loses focus per
  // keystroke. This types the way a person does.
  const dialog = page.getByRole('dialog')
  const name = dialog.getByLabel('Display name', { exact: true })
  await name.click()
  await page.keyboard.type('Numen Foundation')

  await expect(name).toHaveValue('Numen Foundation')
  await expect(name).toBeFocused()
})

test('a line of its own says where the registrar box leaves you', async ({ page }) => {
  await createKey(page)
  await openIdentity(page, 'Manual')

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/The request goes on chain beside it/)).toBeVisible()
  await expect(dialog.getByText(/paid whatever the registrar decides/)).toBeVisible()

  await dialog.getByRole('checkbox').uncheck()
  await expect(dialog.getByText(/No request goes on chain/)).toBeVisible()
  // Not the same fee, since a registrar reprices whenever it likes
  await expect(dialog.getByText(/at whatever the registrar charges then/)).toBeVisible()

  // The label names the action and nothing else. No cost, no consequence.
  const label = dialog.getByText('Ask this registrar to check it in the same signature')
  await expect(label).toBeVisible()
  await expect(label).not.toContainText('tNUMN')
})

test('a request already paid for outlives an edit, and the dialog says so', async ({ page }) => {
  await createKey(page)
  await setIdentity(page, { 'Display name': 'Alice', Telegram: '@alice' })
  await expect(page.getByText('Identity registered')).toBeVisible()

  // Editing again defaults to not asking, because one is already in flight
  await openIdentity(page, 'Manual')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('checkbox')).not.toBeChecked()
  await expect(dialog.getByText(/Registrar 1 was already asked/)).toBeVisible()
  await expect(dialog.getByText(/what you write here is what it looks at/)).toBeVisible()

  await dialog.getByLabel('Display name', { exact: true }).fill('Alicia')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Identity registered')).toBeVisible()

  // The request is still there, so the card still reads as waiting on one
  await expect(card(page).getByRole('img', { name: /being paid to check/ })).toBeVisible()
})

/**
 * The verified path. VITE_CHAIN=mock has no identity site to open a window on,
 * so the verifier hands back what one would have proved and the rest of the
 * flow is the real thing. A sign in is held by the dialog, the signature that
 * spends it is its own click.
 */
async function verifyWith(page: Page, provider: Channel, name = 'Alice') {
  await openIdentity(page, 'Automatic')

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Display name', { exact: true }).fill(name)
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: `Verify with ${provider}` }).click()
  await expect(channel(page, provider)).toContainText('Signed in as vaultkeeper')
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
}

type Channel = 'Telegram' | 'Discord'

/** One channel a row, holding its button beside what the chain and the hour say. */
const channel = (page: Page, provider: Channel) =>
  page
    .getByRole('dialog')
    .getByRole('listitem')
    .filter({ hasText: `Verify with ${provider}` })

test('verifying puts an identity on chain in one call', async ({ page }) => {
  await createKey(page)
  await verifyWith(page, 'Telegram')

  await expect(page.getByText('Identity registered')).toBeVisible()
  // The name is the one that was typed, the handle is the one that was proved
  await expect(card(page).getByText('Alice', { exact: true })).toBeVisible()
  // The same signature paid for the check, and the judge answers moments later
  await expect(card(page).getByRole('img', { name: /Checked by a registrar/ })).toBeVisible()

  // One call, rather than a registration followed by a payment
  await page.getByRole('button', { name: 'Activity' }).click()
  const sent = page.getByRole('region', { name: 'Sent from this tab' })
  await expect(sent.getByText('Set identity')).toHaveCount(1)
})

test('a fresh account is quoted the whole price before it signs in anywhere', async ({ page }) => {
  await createKey(page)
  await openIdentity(page, 'Automatic')

  // The bill quotes a record nobody has proved a channel for yet, so the chain
  // fee it would cost belongs beside it rather than waiting for the first proof
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/Estimated fee/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Sign and send' })).toHaveCount(0)
})

test('two sign ins ride one signature and each pays its price', async ({ page }) => {
  await createKey(page)
  await openIdentity(page, 'Automatic')

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Display name', { exact: true }).fill('Alice')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Verify with Telegram' }).click()
  await expect(channel(page, 'Telegram')).toContainText('Signed in as vaultkeeper')
  // The total follows the sign ins, one price apiece
  await expect(dialog.getByText('1 × 10.0000 = 10.0000 tNUMN')).toBeVisible()
  await dialog.getByRole('button', { name: 'Verify with Discord' }).click()
  await expect(channel(page, 'Discord')).toContainText('Signed in as vaultkeeper')
  await expect(
    dialog.getByText('2 × 10.0000 = 20.0000 tNUMN'),
  ).toBeVisible()

  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Identity registered')).toBeVisible()

  await openIdentity(page, 'Manual')
  const manual = page.getByRole('dialog')
  await expect(manual.getByLabel('Telegram', { exact: true })).toHaveValue('vaultkeeper')
  await expect(manual.getByLabel('Discord', { exact: true })).toHaveValue('vaultkeeper')
  await page.mouse.click(20, 400)

  await page.getByRole('button', { name: 'Activity' }).click()
  const sent = page.getByRole('region', { name: 'Sent from this tab' })
  await expect(sent.getByText('Set identity')).toHaveCount(1)
})

test('a channel already checked is not paid again', async ({ page }) => {
  await createKey(page)
  await verifyWith(page, 'Telegram')
  await expect(page.getByText('Identity registered')).toBeVisible()
  await expect(card(page).getByRole('img', { name: /Checked by a registrar/ })).toBeVisible()

  // The chain already stands behind telegram, so it opens checked and free
  await openIdentity(page, 'Automatic')
  const dialog = page.getByRole('dialog')
  await expect(channel(page, 'Telegram')).toContainText('Checked on chain as vaultkeeper')
  await expect(channel(page, 'Discord')).toContainText('Never checked')
  await expect(dialog.getByText('0 × 10.0000 = 0.0000 tNUMN')).toBeVisible()

  // Only the new sign in is on the bill
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Verify with Discord' }).click()
  await expect(channel(page, 'Discord')).toContainText('Signed in as vaultkeeper')
  await expect(dialog.getByText('1 × 10.0000 = 10.0000 tNUMN')).toBeVisible()

  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Identity registered')).toBeVisible()
  await expect(card(page).getByRole('img', { name: /Checked by a registrar/ })).toBeVisible()

  await openIdentity(page, 'Manual')
  const manual = page.getByRole('dialog')
  await expect(manual.getByLabel('Telegram', { exact: true })).toHaveValue('vaultkeeper')
  await expect(manual.getByLabel('Discord', { exact: true })).toHaveValue('vaultkeeper')
})

test('a rewrite pays the judgement fee and no sign fee', async ({ page }) => {
  await createKey(page)
  await verifyWith(page, 'Telegram')
  await expect(page.getByText('Identity registered')).toBeVisible()

  await openIdentity(page, 'Automatic')
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Display name', { exact: true }).fill('Alicia')
  await expect(dialog.getByText('0 × 10.0000 = 0.0000 tNUMN')).toBeVisible()
  await expect(dialog.getByText('0.5000 tNUMN', { exact: true })).toBeVisible()
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Identity registered')).toBeVisible()

  // The new name is up and the judgement survived the rewrite
  await expect(card(page).getByText('Alicia')).toBeVisible()
  await expect(card(page).getByRole('img', { name: /Checked by a registrar/ })).toBeVisible()
})

test('the one click dialog asks nothing about registrars', async ({ page }) => {
  await createKey(page)
  await openIdentity(page, 'Automatic')

  // Nobody has to pick a registrar, pay one, or read what one checks
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('combobox', { name: 'Registrar' })).toHaveCount(0)
  await expect(dialog.getByRole('checkbox')).toHaveCount(0)
  await expect(dialog.getByText(/registrar/i)).toHaveCount(0)
  await expect(dialog.getByText(/deposit/)).toHaveCount(0)
  // The prices are on the table before anybody signs in for anything
  await expect(dialog.getByText('0 × 10.0000 = 0.0000 tNUMN')).toBeVisible()
  await expect(dialog.getByText('0.5000 tNUMN', { exact: true })).toBeVisible()
})

test('a channel row says whether it is checked and how long the sign in holds', async ({
  page,
}) => {
  await createKey(page)
  await openIdentity(page, 'Automatic')

  // Nothing on chain and nothing held, which is where both channels start
  for (const provider of ['Telegram', 'Discord'] as const) {
    await expect(channel(page, provider)).toContainText('Never checked')
    await expect(channel(page, provider)).toContainText('Not signed in')
  }
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('0 × 10.0000 = 0.0000 tNUMN')).toBeVisible()
  // What is held is the record about to be written, so an empty one is the floor
  await expect(dialog.getByText('5.25 tNUMN', { exact: true })).toBeVisible()

  // A sign in is good for an hour, and only the channel it was for changes
  await dialog.getByRole('button', { name: 'Verify with Telegram' }).click()
  await expect(channel(page, 'Telegram')).toContainText('Signed in as vaultkeeper, 60 min left')
  await expect(channel(page, 'Telegram')).toContainText('Never checked')
  await expect(channel(page, 'Discord')).toContainText('Not signed in')
  await expect(dialog.getByText('1 × 10.0000 = 10.0000 tNUMN')).toBeVisible()
  // The handle went on the record, so the held amount grew with it
  await expect(dialog.getByText('5.36 tNUMN', { exact: true })).toBeVisible()
})

test('the only two boxes are the name and the password', async ({ page }) => {
  await createKey(page)
  await openIdentity(page, 'Automatic')

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('textbox')).toHaveCount(2)
  await expect(dialog.getByLabel('Display name', { exact: true })).toBeVisible()

  // Signing in never touches the key, so no password stands in its way
  const telegram = dialog.getByRole('button', { name: 'Verify with Telegram' })
  await expect(telegram).toBeEnabled()
  await telegram.click()
  await expect(channel(page, 'Telegram')).toContainText('Signed in as vaultkeeper')

  const sign = dialog.getByRole('button', { name: 'Sign and send' })
  await expect(sign).toBeDisabled()
  await dialog.getByLabel('Account password').fill(PASSWORD)
  // Both boxes gate the signature, a password without a name signs nothing
  await expect(sign).toBeDisabled()
  await dialog.getByLabel('Display name', { exact: true }).fill('Alice')
  await expect(sign).toBeEnabled()

  // A name the chain cannot hold stops the signature, not the sign in
  await dialog.getByLabel('Display name', { exact: true }).fill('a'.repeat(33))
  await expect(dialog.getByText('33 bytes, 32 is the most the chain holds')).toBeVisible()
  await expect(sign).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Verify with Discord' })).toBeEnabled()
})

test('a record with no name does not sign', async ({ page }) => {
  await createKey(page)
  await openIdentity(page, 'Automatic')

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Verify with Telegram' }).click()
  await expect(channel(page, 'Telegram')).toContainText('Signed in as vaultkeeper')

  const sign = dialog.getByRole('button', { name: 'Sign and send' })
  await expect(dialog.getByText('The record needs a display name')).toBeVisible()
  await expect(sign).toBeDisabled()

  // Whitespace is not a name
  await dialog.getByLabel('Display name', { exact: true }).fill('   ')
  await expect(sign).toBeDisabled()

  await dialog.getByLabel('Display name', { exact: true }).fill('Alice')
  await expect(dialog.getByText('The record needs a display name')).toHaveCount(0)
  await expect(sign).toBeEnabled()
})

test('a sign in can be taken back before it is paid for', async ({ page }) => {
  await createKey(page)
  await openIdentity(page, 'Automatic')

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Verify with Telegram' }).click()
  await expect(channel(page, 'Telegram')).toContainText('Signed in as vaultkeeper')
  await expect(dialog.getByText('1 × 10.0000 = 10.0000 tNUMN')).toBeVisible()

  await channel(page, 'Telegram').getByRole('button', { name: 'Remove Telegram' }).click()
  await expect(channel(page, 'Telegram')).toContainText('Not signed in')
  await expect(dialog.getByText('0 × 10.0000 = 0.0000 tNUMN')).toBeVisible()
})

test('a checked channel can be taken off the record', async ({ page }) => {
  await createKey(page)
  await verifyWith(page, 'Telegram')
  await expect(page.getByText('Identity registered')).toBeVisible()

  await openIdentity(page, 'Automatic')
  const dialog = page.getByRole('dialog')
  await expect(channel(page, 'Telegram')).toContainText('Checked on chain as vaultkeeper')

  await dialog.getByRole('button', { name: 'Verify with Discord' }).click()
  await expect(channel(page, 'Discord')).toContainText('Signed in as vaultkeeper')

  // Dropping the checked handle costs nothing, only the fresh sign in is billed
  await channel(page, 'Telegram').getByRole('button', { name: 'Remove Telegram' }).click()
  await expect(channel(page, 'Telegram')).toContainText('Comes off the record when you sign')
  await expect(dialog.getByText('1 × 10.0000 = 10.0000 tNUMN')).toBeVisible()

  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Identity registered')).toBeVisible()

  await openIdentity(page, 'Manual')
  const manual = page.getByRole('dialog')
  await expect(manual.getByLabel('Telegram', { exact: true })).toHaveValue('')
  await expect(manual.getByLabel('Discord', { exact: true })).toHaveValue('vaultkeeper')
})

test('removing the last channel leaves nothing to sign', async ({ page }) => {
  await createKey(page)
  await verifyWith(page, 'Telegram')
  await expect(page.getByText('Identity registered')).toBeVisible()

  await openIdentity(page, 'Automatic')
  const dialog = page.getByRole('dialog')
  await channel(page, 'Telegram').getByRole('button', { name: 'Remove Telegram' }).click()

  await expect(dialog.getByRole('button', { name: 'Sign and send' })).toHaveCount(0)
  await expect(dialog.getByText(/Clear on chain identity in the account menu/)).toBeVisible()
})

test('closing the dialog forgets a removal', async ({ page }) => {
  await createKey(page)
  await verifyWith(page, 'Telegram')
  await expect(page.getByText('Identity registered')).toBeVisible()

  await openIdentity(page, 'Automatic')
  await channel(page, 'Telegram').getByRole('button', { name: 'Remove Telegram' }).click()
  await expect(channel(page, 'Telegram')).toContainText('Comes off the record when you sign')

  // The overlay click that keeps typed drafts must not keep this
  await page.mouse.click(20, 400)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await openIdentity(page, 'Automatic')
  const dialog = page.getByRole('dialog')
  await expect(channel(page, 'Telegram')).toContainText('Checked on chain as vaultkeeper')
  await expect(dialog.getByText(/Comes off the record/)).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Sign and send' })).toBeVisible()
})

test('verifying says what it would take off the record', async ({ page }) => {
  await createKey(page)
  await setIdentity(page, { 'Display name': 'Alice', GitHub: 'alice' }, { ask: false })
  await expect(page.getByText('Identity registered')).toBeVisible()

  await openIdentity(page, 'Automatic')
  await expect(
    page.getByRole('dialog').getByText(/replaces what is on chain now, so GitHub goes with it/),
  ).toBeVisible()

  // And it does, once it lands
  await page.getByRole('dialog').getByLabel('Account password').fill(PASSWORD)
  await page.getByRole('dialog').getByRole('button', { name: 'Verify with Discord' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Identity registered')).toBeVisible()

  await openIdentity(page, 'Manual')
  await expect(page.getByRole('dialog').getByLabel('GitHub', { exact: true })).toHaveValue('')
  await expect(page.getByRole('dialog').getByLabel('Discord', { exact: true })).toHaveValue(
    'vaultkeeper',
  )
})

test('one menu item carries both ways of filling it in', async ({ page }) => {
  await createKey(page)
  await openIdentity(page, 'Automatic')

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Verify with Telegram' })).toBeVisible()
  await expect(dialog.getByLabel('Website', { exact: true })).toHaveCount(0)

  await dialog.getByRole('button', { name: 'Manual' }).click()
  await expect(dialog.getByLabel('Website', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Verify with Telegram' })).toHaveCount(0)

  // Back again, and the dialog never went away
  await dialog.getByRole('button', { name: 'Automatic' }).click()
  await expect(dialog.getByRole('button', { name: 'Verify with Telegram' })).toBeVisible()
  await expect(dialog).toHaveCount(1)
})

test('the dialog keeps what was typed, one draft an account', async ({ page }) => {
  await createKey(page)
  await openIdentity(page, 'Manual')

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Display name').fill('Alice')
  await dialog.getByLabel('X', { exact: true }).fill('@alice')

  // A click on the overlay, which is the misclick this is here for
  await page.mouse.click(20, 400)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Which tab it was left on is part of what would have been lost
  await openMenu(page, /(Set an|Edit the) on chain identity/)
  await expect(dialog.getByLabel('Display name')).toHaveValue('Alice')
  await expect(dialog.getByLabel('X', { exact: true })).toHaveValue('@alice')
  await page.mouse.click(20, 400)

  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await dialog.getByRole('radio', { name: 'New account' }).check()
  await dialog.getByLabel('Name').fill('Spare')
  await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await dialog.getByLabel('Repeat password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  // Somebody else's identity is a different form with the same fields, so it
  // opens where a fresh one does
  await page
    .locator('article')
    .filter({ hasText: 'Spare' })
    .getByRole('button', { name: 'Account menu' })
    .click()
  await page.getByRole('menuitem', { name: 'Set an on chain identity' }).click()
  await expect(dialog.getByRole('button', { name: 'Verify with Telegram' })).toBeVisible()
  await expect(dialog.getByLabel('Display name')).toHaveValue('')
})

/**
 * The registrar's half. The mock lists one registrar and it is the account the
 * Alice phrase restores, so importing that phrase is what puts this wallet on
 * the other side of the counter.
 */
const TEAM = 'nu2uaQWzSyDzXHrgd78sQL2871qL2LpPU6kHeeb4ETtXfnASg'

async function importRegistrar(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add account' }).first().click()

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'From seed' }).check()
  await dialog
    .getByLabel('Seed', { exact: true })
    .fill('bottom drive obey lake curtain smoke basket hold race lonely fit walk//Alice')
  await dialog.getByLabel('Name').fill('Registrar')
  await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await dialog.getByLabel('Repeat password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
}

test('a registrar judges the identity it was shown', async ({ page }) => {
  await importRegistrar(page)

  await page
    .locator('article')
    .filter({ hasText: 'Registrar' })
    .getByRole('button', { name: 'Account menu' })
    .click()
  await page.getByRole('menuitem', { name: 'Judge an identity' }).click()

  const dialog = page.getByRole('dialog')
  await fillAddress(page, dialog, 'Account', TEAM)

  // What is being vouched for, field by field, since the chain binds the
  // verdict to the hash of exactly this
  await expect(dialog.getByText('Numen Explorer Team')).toBeVisible()
  await expect(dialog.getByText('@numen_explorer')).toBeVisible()

  // Nobody asked this registrar to look at it, so the verdict earns nothing
  await expect(dialog.getByText('Your fee')).toBeVisible()
  await expect(dialog.getByText('Not paid', { exact: true })).toBeVisible()

  await dialog.getByRole('combobox', { name: 'Judgement' }).click()
  await page.getByRole('option', { name: 'KnownGood' }).click()
  await expect(dialog.getByText(/knows this account directly/)).toBeVisible()

  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Judgement recorded')).toBeVisible()
})

test('offers nothing to judge with on an account that is not a registrar', async ({ page }) => {
  await createKey(page)

  await card(page).getByRole('button', { name: 'Account menu' }).click()
  await expect(page.getByRole('menuitem', { name: 'Judge an identity' })).toHaveCount(0)
})

test('the registrar reprices its work and the new fee sticks', async ({ page }) => {
  await importRegistrar(page)
  await openMenu(page, 'Set the judgement fee', 'Registrar')

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Signing as registrar 0')).toBeVisible()
  await expect(dialog.getByText('charges 0.5000 tNUMN today')).toBeVisible()
  await dialog.getByLabel('Fee').fill('2')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Judgement fee set')).toBeVisible()

  // The new price is read back from the chain rather than remembered
  await openMenu(page, 'Set the judgement fee', 'Registrar')
  await expect(page.getByRole('dialog').getByText('charges 2.0000 tNUMN today')).toBeVisible()
})

test('the picker says what the chain calls an address, not only what this wallet does', async ({
  page,
}) => {
  await createKey(page)
  await setIdentity(page, { 'Display name': 'Numen Foundation', Telegram: '@numen' })
  await expect(page.getByText('Identity registered')).toBeVisible()

  const dialog = page.getByRole('dialog')
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await dialog.getByRole('radio', { name: 'New account' }).check()
  await dialog.getByLabel('Name').fill('Spare')
  await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await dialog.getByLabel('Repeat password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  await page
    .locator('article')
    .filter({ hasText: 'Spare' })
    .getByRole('button', { name: 'Send' })
    .click()
  await dialog.getByRole('button', { name: 'Address', exact: true }).click()

  // The name the wallet gave it, what the chain was told, and the verdict on
  // that, since a display name nobody checked is only a claim
  const row = page.getByRole('option', { name: /Vault/ })
  await expect(row).toContainText('Numen Foundation')
  await expect(row).toContainText(/nu\w{5}…\w{5}/)
  await expect(row.getByRole('img', { name: /being paid to check/ })).toBeVisible()
})
