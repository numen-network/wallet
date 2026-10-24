import { expect, test, type Page } from '@playwright/test'
import { expectAddress, fillAddress, pickAddress } from './address'

/**
 * The path that needs no extension at all. Runs against VITE_CHAIN=mock, which
 * ignores signatures, so what is proved here is the wallet's own wiring from
 * key creation through to a submitted transfer.
 */
const PASSWORD = 'correct horse battery'
const OTHER_PASSWORD = 'another horse battery'
const DESTINATION = 'nu3oNksEGXV3Tsr4sBeRUpcfA5zYp4VvZ7t9uKVPMAe2UCo98'
const SECOND = 'nu2uaQWzSyDzXHrgd78sQL2871qL2LpPU6kHeeb4ETtXfnASg'

const card = (page: Page) => page.locator('article').filter({ hasText: 'Vault' })

async function createKey(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add account' }).first().click()

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'New account' }).check()
  await dialog.getByLabel('Name').fill('Vault')
  await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await dialog.getByLabel('Repeat password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Create' }).click()
}

test('a new key comes with a phrase and lands as a signing account', async ({ page }) => {
  await createKey(page)

  const notice = page.getByRole('dialog')
  await expect(notice.getByText('Write this down')).toBeVisible()

  await expect(notice.getByRole('listitem')).toHaveCount(12)
  // The same account in the shape the From seed tab takes back
  await expect(notice.getByText(/^0x[0-9a-f]{64}$/)).toBeVisible()

  // Done stays shut until the user says the phrase is written down
  await expect(notice.getByRole('button', { name: 'Done' })).toBeDisabled()

  await notice.getByRole('checkbox').check()
  await notice.getByRole('button', { name: 'Done' }).click()

  await expect(card(page).getByText('local', { exact: true })).toBeVisible()
  await expect(card(page).getByRole('button', { name: 'Send' })).toBeEnabled()
})

test('rerolling picks a different account, and that is the one created', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add account' }).first().click()

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'New account' }).check()

  const preview = dialog.getByText(/^nu/)
  const first = await preview.innerText()
  await dialog.getByRole('button', { name: 'Reroll' }).click()
  const second = await preview.innerText()
  expect(second).not.toBe(first)

  await dialog.getByLabel('Name').fill('Vault')
  await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await dialog.getByLabel('Repeat password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  await expect(card(page).getByText(second.slice(0, 7))).toBeVisible()
})

test('leaving the phrase behind stores no key', async ({ page }) => {
  await createKey(page)
  await expect(page.getByText('Write this down')).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(page.locator('article')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('article')).toHaveCount(0)
})

test('the key survives a reload', async ({ page }) => {
  await createKey(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  await page.reload()
  await expect(card(page).getByText('local', { exact: true })).toBeVisible()
})

test('sending asks for the password and refuses a wrong one', async ({ page }) => {
  await createKey(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  await card(page).getByRole('button', { name: 'Send' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/Estimated fee/)).toBeVisible()

  await fillAddress(page, dialog, 'Address', DESTINATION)
  await dialog.getByRole('button', { name: 'MAX' }).click()

  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(dialog.getByText('Enter the password for this account')).toBeVisible()

  await dialog.getByLabel('Account password').fill('not the password')
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(dialog.getByText('Wrong password')).toBeVisible()

  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Transfer confirmed')).toBeVisible()
})

test('the key can be exported as a keystore file', async ({ page }) => {
  await createKey(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  await card(page).getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Create a backup file' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Account password').fill('not the password')
  await dialog.getByRole('button', { name: 'Save file' }).click()
  await expect(dialog.getByText('Wrong password')).toBeVisible()

  await dialog.getByLabel('Account password').fill(PASSWORD)
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Save file' }).click()

  expect((await download).suggestedFilename()).toMatch(/^nu.+\.json$/)
})

test('changing the password swaps which one opens the key', async ({ page }) => {
  await createKey(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  const change = async (current: string, next: string) => {
    await card(page).getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: 'Change password' }).click()

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Current password').fill(current)
    await dialog.getByLabel('New password', { exact: true }).fill(next)
    await dialog.getByLabel('Repeat new password').fill(next)
    await dialog.getByRole('button', { name: 'Change' }).click()
  }

  await change(PASSWORD, 'a longer one')
  await expect(page.getByText('Password changed')).toBeVisible()

  await change(PASSWORD, 'a third one')
  await expect(page.getByRole('dialog').getByText('Wrong password')).toBeVisible()
})

test('deleting a key says what it costs and then removes it', async ({ page }) => {
  await createKey(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  await card(page).getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Forget this account' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/only copy of/)).toBeVisible()

  // The key does not go without the password that opens it
  await dialog.getByLabel('Account password').fill('not the password')
  await dialog.getByRole('button', { name: 'Forget' }).click()
  await expect(dialog.getByText('Wrong password')).toBeVisible()

  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Forget' }).click()

  await expect(page.getByText('No accounts yet.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('No accounts yet.')).toBeVisible()
})

test('what has vested stays frozen until it is asked for', async ({ page }) => {
  await createKey(page)
  // createKey stops at the backup notice, which stands between here and the board
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  await card(page).getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Vesting' }).click()

  const dialog = page.getByRole('dialog')
  // Twenty thousand blocks in at one a block and vested five thousand blocks
  // ago, so only what thawed since then is ready
  await expect(dialog.getByText('5,000.0000 tNUMN', { exact: true })).toBeVisible()
  await expect(dialog.getByText('40,000.0000 tNUMN', { exact: true })).toBeVisible()
  await expect(dialog.getByText('40,000.0000 of 60,000.0000 tNUMN')).toBeVisible()

  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Vested balance released')).toBeVisible()
})

test('grants a schedule and says where the rate lands it', async ({ page }) => {
  await createKey(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  await card(page).getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Vesting' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: 'Grant' }).click()
  await fillAddress(page, dialog, 'To', DESTINATION)
  await dialog.getByLabel('Amount').fill('10')
  await dialog.getByLabel('Unlocks over').fill('30')

  // Ten over thirty days, at 8,640 blocks a day
  await expect(dialog.getByText('0.3333 tNUMN a day')).toBeVisible()

  // Where the days land, said beside the days rather than only in the summary.
  // A schedule runs until the last planck is out, so the block is worth reading
  // off the schedule instead of counting days from the start
  const aside = await dialog.getByText(/^ends at block [\d,]+$/).innerText()
  const summary = await dialog.getByText(/^block [\d,]+, about \d+ days$/).innerText()
  expect(summary).toContain(aside.replace('ends at block ', ''))

  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(dialog.getByText('Enter the password for this account')).toBeVisible()

  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Vesting schedule granted')).toBeVisible()
})

test('releases a schedule on behalf of another account', async ({ page }) => {
  await createKey(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  // The schedule sits on the first account, so a second one does the asking
  await card(page).getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Derive an account' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('Child')
  await dialog.getByLabel('Password for Vault').fill(PASSWORD)
  await dialog.getByLabel('New account password').fill('child password')
  await dialog.getByLabel('Repeat').fill('child password')
  await dialog.getByRole('button', { name: 'Derive' }).click()
  await expect(page.locator('article')).toHaveCount(2)

  const child = page.locator('article').filter({ hasText: 'Child' })
  await child.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Vesting' }).click()
  await pickAddress(page, dialog, 'For', 'Vault')
  await expect(dialog.getByText('5,000.0000 tNUMN', { exact: true })).toBeVisible()

  await dialog.getByLabel('Account password').fill('child password')
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Vested balance released')).toBeVisible()
})

/**
 * A call the wallet lets through and the chain then turns down. The grant fits
 * the balance and not the balance plus the fee, which the form cannot know
 * before it asks.
 */
test('says which pallet refused a call and what for', async ({ page }) => {
  await createKey(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  await card(page).getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Vesting' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: 'Grant' }).click()
  await fillAddress(page, dialog, 'To', DESTINATION)

  const whole = await dialog.getByText(/tNUMN to send/).innerText()
  await dialog.getByLabel('Amount').fill(whole)
  await dialog.getByLabel('Unlocks over').fill('30')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  await page.getByRole('button', { name: 'Activity' }).click()
  const sent = page.getByRole('region', { name: 'Sent from this tab' })
  // Named rather than left as a loose red line, so it reads as what it is
  await expect(sent.getByRole('term').filter({ hasText: 'refused' })).toBeVisible()
  await expect(
    sent.getByRole('definition').filter({ hasText: 'Token: FundsUnavailable' }),
  ).toBeVisible()
})

test('refuses a grant under what the chain takes', async ({ page }) => {
  await createKey(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  await card(page).getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Vesting' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: 'Grant' }).click()
  await fillAddress(page, dialog, 'To', DESTINATION)
  await dialog.getByLabel('Amount').fill('0.5')
  await dialog.getByLabel('Unlocks over').fill('30')
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  await expect(dialog.getByText(/at least 1\.0000 tNUMN/)).toBeVisible()
})

test('an imported phrase restores a known account', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add account' }).first().click()

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'From seed' }).check()
  await dialog
    .getByLabel('Seed', { exact: true })
    .fill('bottom drive obey lake curtain smoke basket hold race lonely fit walk//Alice')
  await dialog.getByLabel('Name').fill('Alice')
  await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await dialog.getByLabel('Repeat password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(page.getByText('nu7SVAy…SUyb')).toBeVisible()
})

test('a phrase with a typo is refused rather than making a new account', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add account' }).first().click()

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'From seed' }).check()
  await dialog
    .getByLabel('Seed', { exact: true })
    .fill('bottle drive obey lake curtain smoke basket hold race lonely fit walk')
  await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await dialog.getByLabel('Repeat password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(dialog.getByText('That is not a valid seed')).toBeVisible()
})

test('a keystore file has its own way in', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'From JSON' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Import from JSON')).toBeVisible()
  await dialog.getByRole('button', { name: 'Import' }).click()
  await expect(dialog.getByText('Choose a keystore file')).toBeVisible()
})

test('deriving gives a second account of its own', async ({ page }) => {
  await createKey(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  await card(page).getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Derive an account' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('Child')
  await dialog.getByLabel(`Password for Vault`).fill('not the password')
  await dialog.getByLabel('New account password').fill('child password')
  await dialog.getByLabel('Repeat').fill('child password')
  await dialog.getByRole('button', { name: 'Derive' }).click()
  await expect(dialog.getByText('Wrong password')).toBeVisible()

  await dialog.getByLabel(`Password for Vault`).fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Derive' }).click()

  await expect(page.locator('article')).toHaveCount(2)
  await page.reload()
  await expect(page.locator('article').filter({ hasText: 'Child' })).toHaveCount(1)
})

test('delegating votes on a track, then taking them back', async ({ page }) => {
  await createKey(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  const dialog = page.getByRole('dialog')
  const menu = async (item: string) => {
    await card(page).getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: item }).click()
  }

  // Nothing is delegated yet, so there is nothing to take back
  await menu('Take a delegation back')
  await expect(dialog.getByRole('checkbox', { name: 'Small spender' })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Sign and send' })).toBeDisabled()
  await page.keyboard.press('Escape')

  await menu('Delegate votes')
  await dialog.getByRole('checkbox', { name: 'Small spender' }).check()
  await fillAddress(page, dialog, 'Delegate to', DESTINATION)
  await dialog.getByPlaceholder('0.0').fill('100')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Votes delegated')).toBeVisible()

  // The same delegation again has nothing to send
  await menu('Delegate votes')
  await dialog.getByRole('checkbox', { name: 'Small spender' }).check()
  await fillAddress(page, dialog, 'Delegate to', DESTINATION)
  await dialog.getByPlaceholder('0.0').fill('100')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(dialog.getByText('Nothing to send for the tracks picked')).toBeVisible()

  // A different amount takes the old one back and delegates again, in one go
  await dialog.getByPlaceholder('0.0').fill('200')
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('All of it went through')).toBeVisible()

  await menu('Take a delegation back')
  await expect(dialog.getByRole('checkbox', { name: 'Medium spender' })).toBeDisabled()
  await dialog.getByRole('checkbox', { name: 'Small spender' }).check()
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Delegation ended')).toBeVisible()
})

/**
 * Two accounts under two passwords, delegated together under the first. The
 * second is never signed, and that is what fails.
 */
async function delegateFromTwo(page: Page) {
  await createKey(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'Account', exact: true }).click()
  const adding = page.getByRole('dialog')
  await adding.getByRole('radio', { name: 'New account' }).check()
  await adding.getByLabel('Name').fill('Spare')
  await adding.getByLabel('Password', { exact: true }).fill(OTHER_PASSWORD)
  await adding.getByLabel('Repeat password').fill(OTHER_PASSWORD)
  await adding.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  await card(page).getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Delegate votes' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delegate votes' })
  await dialog.getByRole('tab', { name: 'Multiple' }).click()
  await dialog.getByRole('group', { name: 'Delegating as' }).getByRole('checkbox', { name: 'Spare' }).check()
  await dialog.getByRole('checkbox', { name: 'Small spender' }).check()
  await fillAddress(page, dialog, 'Delegate to', DESTINATION)
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(dialog).toHaveCount(0)
}

test('a failed part brings the dialog back on what failed', async ({ page }) => {
  await delegateFromTwo(page)

  const failed = page.locator('[data-sonner-toast][data-type="error"]')
  await expect(failed).toContainText('1 of 2 failed')
  await failed.getByRole('button').click()

  // The sidebar takes the failure over from the corner
  const sidebar = page.getByRole('dialog', { name: 'Activity' })
  const waiting = sidebar.getByRole('region', { name: 'Needs attention' })
  await expect(waiting.getByText('Spare')).toBeVisible()
  await expect(failed).toHaveCount(0)

  // Walking away from a retry leaves the failure where it was
  await waiting.getByRole('button', { name: 'Edit and retry' }).click()
  const again = page.getByRole('dialog', { name: 'Delegate votes' })
  const delegating = again.getByRole('group', { name: 'Delegating as' })
  await expect(delegating.getByRole('checkbox', { name: 'Spare' })).toBeChecked()
  await expect(delegating.getByRole('checkbox', { name: 'Vault' })).not.toBeChecked()
  await expect(again.getByRole('checkbox', { name: 'Small spender' })).toBeChecked()
  await expect(again.getByLabel('Account password')).toHaveValue('')
  await again.getByRole('button', { name: 'Cancel' }).click()
  await expect(waiting.getByText('Spare')).toBeVisible()

  // So does closing the sidebar, the way any panel here closes
  await page.mouse.click(40, 400)
  await expect(sidebar).toHaveCount(0)
  await page.getByRole('button', { name: 'Activity' }).click()
  await expect(waiting.getByText('Spare')).toBeVisible()

  // Sent again under the right password, the failure goes with it
  await waiting.getByRole('button', { name: 'Edit and retry' }).click()
  await again.getByLabel('Account password').fill(OTHER_PASSWORD)
  await again.getByRole('button', { name: 'Sign and send' }).click()
  await expect(again).toHaveCount(0)
  await expect(waiting).toHaveCount(0)
  await expect(page.getByText('Votes delegated')).toBeVisible()
})

test('a failure stays in the sidebar until it is dismissed', async ({ page }) => {
  await delegateFromTwo(page)

  await page.getByRole('button', { name: 'Activity' }).click()
  const sidebar = page.getByRole('dialog', { name: 'Activity' })
  const waiting = sidebar.getByRole('region', { name: 'Needs attention' })
  await expect(waiting.getByText('Spare')).toBeVisible()
  // Seen in the sidebar, so the corner has nothing left to point at
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0)

  await waiting.getByRole('button', { name: 'Dismiss' }).click()
  await expect(waiting).toHaveCount(0)
  // The log keeps what happened either way
  const sent = sidebar.getByRole('region', { name: 'Sent from this tab' })
  await expect(sent.getByText('Delegate votes')).toBeVisible()
})

test('sending the full balance closes the account out', async ({ page }) => {
  await createKey(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  const before = await card(page).locator('div.font-mono').first().innerText()

  await card(page).getByRole('button', { name: 'Send' }).click()
  const dialog = page.getByRole('dialog')
  await fillAddress(page, dialog, 'Address', DESTINATION)
  await dialog.getByLabel('Send the full balance, closing this account').check()
  await expect(dialog.getByPlaceholder('0.0')).toBeDisabled()

  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  await expect(page.getByText('Transfer confirmed')).toBeVisible()
  await expect(card(page).locator('div.font-mono').first()).not.toHaveText(before)
})

test('a proxy goes on the chain list, then comes off it', async ({ page }) => {
  await createKey(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  const dialog = page.getByRole('dialog')
  const menu = async (item: string) => {
    await card(page).getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: item }).click()
  }

  await menu('Remove proxy')
  await expect(dialog.getByText('Nothing acts for Vault.')).toBeVisible()
  await page.keyboard.press('Escape')

  await menu('Add proxy')
  await fillAddress(page, dialog, 'Proxy account', DESTINATION)
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  // Signed, then settled. The list is only right once the chain agrees
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('Proxy added')).toBeVisible()

  await menu('Remove proxy')
  await expectAddress(dialog, 'Proxy', 'Governance')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Proxy removed')).toBeVisible()
})

test('the tab remembers what it sent, across a reload', async ({ page }) => {
  await createKey(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  // Nothing sent yet, so the page that lists it says so
  await page.getByRole('button', { name: 'Activity' }).click()
  await expect(page.getByText('Nothing sent yet')).toBeVisible()
  await page.keyboard.press('Escape')

  await card(page).getByRole('button', { name: 'Send' }).click()
  const dialog = page.getByRole('dialog')
  await fillAddress(page, dialog, 'Address', DESTINATION)
  await dialog.getByPlaceholder('0.0').fill('1')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  // The form lets go as soon as the call is signed, well before it is final,
  // and the corner picks the walk up from there
  const flight = page.locator('[data-sonner-toast][data-type="loading"]')
  await expect(flight).toContainText('Transfer')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('Transfer confirmed')).toBeVisible()
  // Settled is the toast's to say, so the corner lets go of it
  await expect(flight).toHaveCount(0)

  await page.reload()
  await page.getByRole('button', { name: 'Activity' }).click()
  const sent = page.getByRole('region', { name: 'Sent from this tab' })
  await expect(sent.getByText('Transfer', { exact: true })).toBeVisible()
  await expect(sent.getByText('final')).toBeVisible()
})

test('one page carries what every account sent, not one account at a time', async ({ page }) => {
  const make = async (name: string) => {
    const add = page.getByRole('button', { name: 'Add account' }).first()
    if (await add.count()) await add.click()
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

  const send = async (name: string, amount: string) => {
    await page.locator('article').filter({ hasText: name }).getByRole('button', { name: 'Send' }).click()
    const dialog = page.getByRole('dialog')
    await fillAddress(page, dialog, 'Address', DESTINATION)
    await dialog.getByPlaceholder('0.0').fill(amount)
    await dialog.getByLabel('Account password').fill(PASSWORD)
    await dialog.getByRole('button', { name: 'Sign and send' }).click()
    await expect(dialog).toHaveCount(0)
  }

  await page.goto('/')
  await make('Vault')
  await make('Spare')
  await send('Vault', '1')
  await send('Spare', '2')

  await page.getByRole('button', { name: 'Activity' }).click()
  const sent = page.getByRole('region', { name: 'Sent from this tab' })
  await expect(sent.locator('article')).toHaveCount(2)
  // Each one names the account that signed it and says which address that is,
  // since the page is not about one account
  const spare = sent.locator('article').filter({ hasText: 'Spare' })
  // The first of them, since the transaction links to the explorer as well
  const signer = spare.getByRole('link').first()
  await expect(signer).toContainText('Spare')
  await expect(signer).toContainText(/nu\w{5}…\w{4}/)
  await expect(sent.locator('article').filter({ hasText: 'Vault' })).toHaveCount(1)

  // Every entry reads the same way whatever the call was. The name the runtime
  // files it as, then a row per argument under the runtime's own name for it,
  // rather than a line somebody wrote for this one kind
  for (const row of ['call', 'to', 'amount', 'transaction']) {
    await expect(spare.getByText(row, { exact: true })).toBeVisible()
  }
  await expect(spare.getByText('transfer', { exact: true })).toBeVisible()
  await expect(spare.getByText(DESTINATION, { exact: true })).toBeVisible()
  await expect(spare.getByText('2000000000000000000', { exact: true })).toBeVisible()
})

test('one signature pays several accounts at once', async ({ page }) => {
  await createKey(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  await card(page).getByRole('button', { name: 'Send' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: 'Batch' }).click()
  await fillAddress(page, dialog, 'Address 1', DESTINATION)
  await dialog.getByLabel('Amount 1').fill('1')

  // The trash on the only row clears it rather than taking it away
  await dialog.getByRole('button', { name: 'Remove row 1' }).click()
  await expect(dialog.getByLabel('Amount 1')).toHaveValue('')
  await expect(dialog.getByRole('button', { name: 'Address 1' })).toContainText('nu… or 0x…')
  await fillAddress(page, dialog, 'Address 1', DESTINATION)
  await dialog.getByLabel('Amount 1').fill('1')

  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await fillAddress(page, dialog, 'Address 2', SECOND)
  await dialog.getByLabel('Amount 2').fill('2.5')
  await expect(dialog.getByText('2 payments, adding up to 3.5000')).toBeVisible()

  // Nothing goes until every row would be taken
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(dialog.getByText('Enter a Numen or EVM address')).toBeVisible()
  await dialog.getByRole('button', { name: 'Remove row 3' }).click()

  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('All of it went through')).toBeVisible()

  // One call reached the chain, not two
  await page.getByRole('button', { name: 'Activity' }).click()
  const sent = page.getByRole('region', { name: 'Sent from this tab' })
  await expect(sent.locator('article')).toHaveCount(1)
})

test('one delegation covers every track it is ticked for', async ({ page }) => {
  await createKey(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  await card(page).getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Delegate votes' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('checkbox', { name: 'Small spender' }).check()
  await dialog.getByRole('checkbox', { name: 'Medium spender' }).check()
  await dialog.getByRole('checkbox', { name: 'Big spender' }).check()

  await fillAddress(page, dialog, 'Delegate to', DESTINATION)
  await dialog.getByPlaceholder(/0\.0/).fill('500')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  await expect(page.getByText('All of it went through')).toBeVisible()
  await page.getByRole('button', { name: 'Activity' }).click()
  const sent = page.getByRole('region', { name: 'Sent from this tab' })
  await expect(sent.locator('article')).toHaveCount(1)
})

test('a delegate link opens the delegation with the delegate filled in', async ({ page }) => {
  await createKey(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  await page.goto(`/?delegate=${DESTINATION}`)

  const dialog = page.getByRole('dialog', { name: 'Delegate votes' })
  await expectAddress(dialog, 'Delegating as', 'Vault')
  await expectAddress(dialog, 'Delegate to', /nu3oNks.*Co98/)
  await expect(page).not.toHaveURL(/delegate=/)

  await dialog.getByRole('checkbox', { name: 'Small spender' }).check()
  await dialog.getByPlaceholder('0.0').fill('100')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Votes delegated')).toBeVisible()
})

test('a ticked group delegates from each of its accounts', async ({ page }) => {
  await createKey(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'Account', exact: true }).click()
  const adding = page.getByRole('dialog')
  await adding.getByRole('radio', { name: 'New account' }).check()
  await adding.getByLabel('Name').fill('Spare')
  await adding.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await adding.getByLabel('Repeat password').fill(PASSWORD)
  await adding.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  await page.goto(`/?delegate=${DESTINATION}`)
  const dialog = page.getByRole('dialog', { name: 'Delegate votes' })
  await dialog.getByRole('tab', { name: 'Multiple' }).click()

  const delegating = dialog.getByRole('group', { name: 'Delegating as' })
  await delegating.getByRole('checkbox', { name: 'Ungrouped' }).click()
  await expect(delegating.getByRole('checkbox', { name: 'Spare' })).toBeChecked()
  // Clearing keeps the account the dialog opened on, since a delegation needs one
  await delegating.getByRole('button', { name: 'Clear all' }).click()
  await expect(delegating.getByRole('checkbox', { name: 'Spare' })).not.toBeChecked()
  await expect(delegating.getByRole('checkbox', { name: 'Vault' })).toBeChecked()
  await delegating.getByRole('button', { name: 'Select all' }).click()

  const tracks = dialog.getByRole('group', { name: 'Tracks' })
  await tracks.getByRole('button', { name: 'Select all' }).click()
  await expect(tracks.getByRole('checkbox', { checked: false })).toHaveCount(0)
  await tracks.getByRole('button', { name: 'Clear all' }).click()
  await expect(tracks.getByRole('checkbox', { checked: true })).toHaveCount(0)
  await tracks.getByRole('button', { name: 'Select all' }).click()

  // Nine track calls outweigh one transaction, so each account sends two, and
  // the fee is all four of them
  await expect(dialog.getByText(/Estimated fee .* for 2 accounts/)).toBeVisible()
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('All of it went through')).toBeVisible()

  await page.getByRole('button', { name: 'Activity' }).click()
  const sent = page.getByRole('region', { name: 'Sent from this tab' })
  await expect(sent.locator('article')).toHaveCount(4)
})

async function watchTheCorner({ page }: { page: Page }) {
  await createKey(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Done' }).click()

  await card(page).getByRole('button', { name: 'Send' }).click()
  const dialog = page.getByRole('dialog')
  await fillAddress(page, dialog, 'Address', DESTINATION)
  await dialog.getByPlaceholder(/0\.0/).fill('1')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  // Opposite corner from the outcomes, and below the header rather than over it
  const working = page.locator('[data-sonner-toast][data-type="loading"]')
  await expect(working).toBeVisible()
  const header = await page.locator('header').boundingBox()
  // Polled, since it slides in from above and only then sits where it belongs
  await expect
    .poll(async () => (await working.boundingBox())?.y ?? 0)
    .toBeGreaterThanOrEqual(header!.height)

  // Gone once the chain has settled it, leaving only what became of the call
  await expect(page.getByText('Transfer confirmed')).toBeVisible()
  await expect(working).toHaveCount(0)
}

test('a call on its way says where it has got to, clear of the header', watchTheCorner)

test.describe('on a phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true })

  test('a call on its way says where it has got to, clear of the header', watchTheCorner)
})
