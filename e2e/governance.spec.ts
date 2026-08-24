import { expect, test, type Page } from '@playwright/test'
import { expectAddress, fillAddress, pickAddress } from './address'

/**
 * The referenda page against VITE_CHAIN=mock, which seeds three running
 * proposals. Opening one is gated on the identity standard, so the seeded key
 * has to clear it first.
 */
const PASSWORD = 'correct horse battery'
const BENEFICIARY = 'nu3oNksEGXV3Tsr4sBeRUpcfA5zYp4VvZ7t9uKVPMAe2UCo98'

async function createKey(page: Page, name = 'Vault') {
  await page.goto('/')
  // The empty state offers one, and once there is an account the board's own
  // pill is the way in
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

const governance = async (page: Page) => page.getByRole('button', { name: 'Governance' }).click()

// Each list is a tab, so only the open one is on the page
const tab = async (page: Page, name: string) => page.getByRole('button', { name }).click()

// Every list on this page is cards with a #index, so each is reached through
// the region it lives in rather than by walking every article
const referendum = (page: Page, index: number) =>
  page
    .getByRole('region', { name: 'Running referenda' })
    .locator('article')
    .filter({ hasText: `#${index}` })

test('the list shows what each referendum would pay and where it has got to', async ({ page }) => {
  await createKey(page)
  await governance(page)

  const running = referendum(page, 1)
  // Every state an Ongoing referendum passes through, since the badge is the
  // only place the list says where one has got to
  await expect(referendum(page, 0).getByText('preparing')).toBeVisible()
  await expect(referendum(page, 2).getByText('queued')).toBeVisible()
  await expect(running.getByText('deciding')).toBeVisible()
  await expect(referendum(page, 3).getByText('confirming')).toBeVisible()
  // A colour apiece, so the badge tells them apart without being read
  const badge = (index: number, state: string) =>
    referendum(page, index)
      .getByText(state)
      .evaluate((node) => getComputedStyle(node).color)
  const tones = await Promise.all([
    badge(0, 'preparing'),
    badge(2, 'queued'),
    badge(1, 'deciding'),
    badge(3, 'confirming'),
  ])
  expect(new Set(tones).size).toBe(4)
  // Nothing titled #0, so the track is the best name it has
  await expect(referendum(page, 0).getByText('Small spender')).toBeVisible()
  await expect(running.getByText(/Pay\s*250,000/)).toBeVisible()
  // A registrar has checked this beneficiary, so the chain's name for it stands
  // in for the address and the hover hands the address back
  const paid = running.getByRole('link', { name: 'Numen Explorer Team' })
  await expect(paid).toHaveAttribute('href', /\/account\/nu2uaQWz/)
  await expect(paid).toHaveAttribute(
    'title',
    'nu2uaQWzSyDzXHrgd78sQL2871qL2LpPU6kHeeb4ETtXfnASg\nTelegram @numen_explorer',
  )
  // Nobody has ever heard of #0's beneficiary, so its address shows whole
  await expect(
    referendum(page, 0).getByRole('link', { name: BENEFICIARY }),
  ).toHaveAttribute('href', /\/account\/nu3oNksE/)
  // #2's beneficiary registers nothing of its own and hangs off the same parent
  await expect(
    referendum(page, 2).getByRole('link', { name: 'Numen Explorer Team/Payouts' }),
  ).toHaveAttribute('href', /\/account\/nu6mvwk9/)
  // The title is what leads to the referendum, the number just names it
  await expect(
    running.getByRole('link', { name: 'Fund the block explorer for a year' }),
  ).toHaveAttribute('href', /\/referendum\/1$/)
})

test('a card says how the vote is going and what happens next', async ({ page }) => {
  await createKey(page)
  await governance(page)

  // 4.1M aye to 900k nay, and 2.6M of support against 12M active issuance. Both
  // curves have eased off two days into a fourteen day decision period
  const running = referendum(page, 1)
  await expect(running.getByText('Approval 82.00%/85.00%')).toBeVisible()
  await expect(running.getByText('Support 21.66%/43.14%')).toBeVisible()
  await expect(running.getByText('Decision ends in about 12 days')).toBeVisible()
  await expect(running.getByText(/Votes are counting/)).toBeVisible()

  // Three days in, and ahead of both curves, which is what confirming means
  await expect(referendum(page, 3).getByText('Approval 97.50%/80.18%')).toBeVisible()
  await expect(referendum(page, 3).getByText('Support 43.33%/39.71%')).toBeVisible()
  await expect(referendum(page, 3).getByText('Passes in about 12 hours')).toBeVisible()
  await expect(referendum(page, 3).getByText(/ahead by enough/)).toBeVisible()

  // Nothing has run for one that is not being decided, so both lines sit where
  // the fall begins
  await expect(referendum(page, 0).getByText('Approval 0.00%/100.00%')).toBeVisible()
  await expect(referendum(page, 0).getByText('Support 0.00%/50.00%')).toBeVisible()

  // Neither of the two that never started deciding has a period running, so
  // both count down to the timeout that ends an undecided referendum
  await expect(referendum(page, 0).getByText('Called off in about 14 days')).toBeVisible()
  await expect(referendum(page, 2).getByText('Called off in about 14 days')).toBeVisible()
  await expect(referendum(page, 2).getByText(/slot on this track is taken/)).toBeVisible()
})

test('the list is read nearest a decision first, or newest first', async ({ page }) => {
  await createKey(page)
  await governance(page)

  const order = async () =>
    (
      await page
        .getByRole('region', { name: 'Running referenda' })
        .locator('article')
        .allTextContents()
    ).map((card) => card.match(/#(\d+)/)?.[1])

  // #3 is confirming, #1 deciding, #2 queued, #0 preparing
  expect(await order()).toEqual(['3', '1', '2', '0'])

  await page.getByRole('combobox', { name: 'Sort' }).click()
  await page.getByRole('option', { name: 'Newest first' }).click()
  expect(await order()).toEqual(['3', '2', '1', '0'])
})

test('each list is a tab, and everything that adds one sits on the tab row', async ({ page }) => {
  await createKey(page)
  await governance(page)

  const propose = page.getByRole('button', { name: 'Referendum', exact: true })
  const bounty = page.getByRole('button', { name: 'Bounty', exact: true })

  // Referenda opens first
  await expect(page.getByRole('region', { name: 'Running referenda' })).toBeVisible()
  await expect(propose).toBeVisible()
  await expect(bounty).toBeVisible()

  // A tab swaps the list under the row and leaves the row itself alone
  await tab(page, 'Deposits to return')
  await expect(page.getByRole('region', { name: 'Running referenda' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Deposits to return' })).toBeVisible()
  await expect(propose).toBeVisible()
  await expect(bounty).toBeVisible()
})

test('a vote lands', async ({ page }) => {
  await createKey(page)
  await governance(page)

  await referendum(page, 1).getByRole('button', { name: 'Vote' }).click()

  const dialog = page.getByRole('dialog')
  // A mock balance is seeded from the address, so the amount has to be one any
  // freshly made account can cover
  await dialog.getByLabel('Amount').fill('1000')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  await expect(page.getByText('Vote counted')).toBeVisible()
})

/**
 * A multisig holds a balance and so holds a say, and the only thing standing
 * between it and a vote is somebody wrapping the call. The second picker is
 * where that is chosen, and the vote is the multisig's rather than the
 * signatory's.
 */
test('a multisig votes through its signatories', async ({ page }) => {
  await createKey(page)
  await createKey(page, 'Payouts')

  await page.getByRole('button', { name: 'Multisig' }).click()
  const setup = page.getByRole('dialog')
  await setup.getByLabel('Name').fill('Treasury')
  await pickAddress(page, setup, 'Signatory 1', 'Vault')
  await pickAddress(page, setup, 'Signatory 2', 'Payouts')
  await setup.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Multisig added')).toBeVisible()

  await governance(page)
  await referendum(page, 1).getByRole('button', { name: 'Vote' }).click()

  const dialog = page.getByRole('dialog')
  await pickAddress(page, dialog, 'Voting as', 'Treasury')
  await expect(dialog.getByText(/One of 2 signatures/)).toBeVisible()
  await dialog.getByLabel('Amount').fill('1000')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  // One signature of two, so what lands is a call waiting on the other
  await expect(page.getByText('Signature added')).toBeVisible()
  await page.getByRole('button', { name: 'Accounts' }).click()
  await page.locator('article').filter({ hasText: 'Treasury' }).getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Multisig approvals' }).click()
  await expect(page.getByRole('dialog').getByText('1 of 2 signed')).toBeVisible()
})

test('an abstain asks for no conviction', async ({ page }) => {
  await createKey(page)
  await governance(page)

  await referendum(page, 1).getByRole('button', { name: 'Vote' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Conviction', { exact: true })).toBeVisible()
  await dialog.getByRole('radio', { name: 'Abstain' }).check()
  await expect(dialog.getByText('Conviction', { exact: true })).toBeHidden()
})

test('a referendum with no decision deposit offers to place one', async ({ page }) => {
  await createKey(page)
  await governance(page)

  const waiting = referendum(page, 0)
  await expect(waiting.getByText('preparing')).toBeVisible()
  await waiting.getByRole('button', { name: 'Place decision deposit' }).click()

  const dialog = page.getByRole('dialog')
  // The track fixes what it costs, so the dialog has to say the number it is
  // about to lock rather than offer a box to type one in
  await expect(dialog.getByText('Small spender, decision deposit 100 tNUMN')).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: 'Amount' })).toHaveCount(0)

  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  await expect(page.getByText('Decision deposit placed')).toBeVisible()
  await expect(waiting.getByText('deciding')).toBeVisible()
})

test('proposing needs an identity a registrar has checked', async ({ page }) => {
  await createKey(page)
  await governance(page)

  await page.getByRole('button', { name: 'Referendum' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/does not clear|no on chain identity/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Sign and send' })).toBeDisabled()
})

test('closing the dialog by accident keeps what was typed into it', async ({ page }) => {
  await createKey(page)
  await governance(page)

  const propose = page.getByRole('button', { name: 'Referendum', exact: true })
  await propose.click()
  await page.getByRole('dialog').getByLabel('Title').fill('Fund the faucet for a year')
  await page.getByRole('dialog').getByLabel('Amount').fill('50000')

  // A click on the overlay, which is the misclick this is here for
  await page.mouse.click(20, 400)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await propose.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Title')).toHaveValue('Fund the faucet for a year')
  await expect(dialog.getByLabel('Amount')).toHaveValue('50000')
})

test('an amount past every cap is refused before it is signed', async ({ page }) => {
  await createKey(page)
  await governance(page)

  await page.getByRole('button', { name: 'Referendum' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Amount').fill('11000000')

  // The footnote names the track, and no track can carry this
  await expect(dialog.getByText(/spender, decision deposit/)).toBeHidden()
})

test('the amount decides the track', async ({ page }) => {
  await createKey(page)
  await governance(page)

  await page.getByRole('button', { name: 'Referendum' }).click()
  const dialog = page.getByRole('dialog')

  await dialog.getByLabel('Amount').fill('50000')
  await expect(dialog.getByText(/Small spender, decision deposit 100/)).toBeVisible()

  await dialog.getByLabel('Amount').fill('500000')
  await expect(dialog.getByText(/Medium spender, decision deposit 1,000/)).toBeVisible()

  await fillAddress(page, dialog, 'Paid to', BENEFICIARY)
  await expect(dialog.getByRole('button', { name: 'Sign and send' })).toBeDisabled()
})

test('the beneficiary follows whoever is signing until it is typed over', async ({ page }) => {
  await createKey(page, 'One')
  await createKey(page, 'Two')
  await governance(page)

  await page.getByRole('button', { name: 'Referendum' }).click()
  const dialog = page.getByRole('dialog')
  // A proposal pays whoever opened it, so it starts on the account that signs
  await expectAddress(dialog, 'Paid to', 'One')

  // Switching who signs moves it, since nobody has named anybody yet
  await pickAddress(page, dialog, 'Voting as', 'Two')
  await expectAddress(dialog, 'Paid to', 'Two')

  // Once somebody names a beneficiary it stays named, whoever signs
  await fillAddress(page, dialog, 'Paid to', BENEFICIARY)
  await pickAddress(page, dialog, 'Voting as', 'One')
  await expectAddress(dialog, 'Paid to', `${BENEFICIARY.slice(0, 7)}…${BENEFICIARY.slice(-5)}`)
})

test('an approved spend pays nobody until somebody claims it', async ({ page }) => {
  await createKey(page)
  await governance(page)

  await tab(page, 'Approved spends')
  const approved = page.getByRole('region', { name: 'Approved spends' })
  const spend = (index: number) => approved.locator('article').filter({ hasText: `#${index}` })

  // The window has not opened on one, has shut on another, and the third is
  // sitting there waiting for anybody at all to sign
  await expect(spend(1).getByText('not yet')).toBeVisible()
  await expect(spend(0).getByText('expired')).toBeVisible()
  const ready = spend(2)
  await expect(ready.getByText('ready')).toBeVisible()

  await ready.getByRole('button', { name: 'Pay out' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  await expect(page.getByText('Treasury spend paid')).toBeVisible()
  // Paid drops off the list, since the record left behind clears itself
  await expect(ready).toHaveCount(0)
  await expect(approved.locator('article')).toHaveCount(2)
})

test('a finished referendum gives its deposits back, except what losing costs', async ({
  page,
}) => {
  await createKey(page)
  await governance(page)

  await tab(page, 'Deposits to return')
  const owed = page.getByRole('region', { name: 'Deposits to return' })
  const closed = (index: number) => owed.locator('article').filter({ hasText: `#${index}` })

  // Rejected keeps the submission deposit and hands the decision one back
  const rejected = closed(11)
  await expect(rejected.getByText('kept, which is what rejected costs')).toBeVisible()
  await expect(rejected.getByRole('button', { name: 'Return it' })).toHaveCount(1)

  // Approved gives both back, so there are two buttons on that one
  const approved = closed(12)
  await expect(approved.getByRole('button', { name: 'Return it' })).toHaveCount(2)

  await approved.getByRole('button', { name: 'Return it' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Return the decision deposit')).toBeVisible()
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  await expect(page.getByText('Decision deposit returned')).toBeVisible()
  await expect(approved.getByRole('button', { name: 'Return it' })).toHaveCount(1)
})

test('a preimage nobody points at any more stops costing its noter', async ({ page }) => {
  await createKey(page)
  await governance(page)

  await tab(page, 'Deposits to return')
  const owed = page.getByRole('region', { name: 'Deposits to return' })
  const noted = owed.locator('article').filter({ hasText: 'bytes' })
  await expect(noted.getByText('214 bytes')).toBeVisible()

  await noted.getByRole('button', { name: 'Clear it' }).click()
  const dialog = page.getByRole('dialog')
  // Only the account that noted it may clear it, so there is nobody to pick
  await expect(dialog.getByText('Voting as')).toHaveCount(0)
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  await expect(page.getByText('Preimage cleared')).toBeVisible()
  await expect(noted).toHaveCount(0)
})

test('a bounty shows only the buttons the signer is entitled to press', async ({ page }) => {
  await createKey(page)
  await governance(page)

  await tab(page, 'Bounties')
  const bounties = page.getByRole('region', { name: 'Bounties' })
  const bounty = (index: number) => bounties.locator('article').filter({ hasText: `#${index}` })

  // Nobody here curates any of them, so nothing on this board is actionable
  // beyond the one whose delay is up, which anybody may hand over
  await expect(bounty(3).getByText('curator asked')).toBeVisible()
  await expect(bounty(3).getByRole('button')).toHaveCount(0)
  // #2 carries two pieces, one of them active as well, so the parent's own
  // badge is the first one on the card rather than the only one
  await expect(bounty(2).getByText('active').first()).toBeVisible()
  await expect(bounty(2).getByText('Write the faucet a status page')).toBeVisible()
  await expect(bounty(2).getByRole('button')).toHaveCount(0)
  await expect(bounty(0).getByText('looking for a curator')).toBeVisible()

  const awarded = bounty(1)
  await expect(awarded.getByText('awarded', { exact: true })).toBeVisible()
  await awarded.getByRole('button', { name: 'Pay it out' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/Anybody may sign this/)).toBeVisible()
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  await expect(page.getByText('Bounty paid out')).toBeVisible()
  await expect(awarded).toHaveCount(0)
})

test('voting locks the balance and the lock says what holds it', async ({ page }) => {
  await createKey(page)
  await governance(page)

  await referendum(page, 1).getByRole('button', { name: 'Vote' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Amount').fill('1000')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Vote counted')).toBeVisible()

  await page.getByRole('button', { name: 'Accounts' }).click()
  await page.locator('article').filter({ hasText: 'Vault' }).getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Release vote locks' }).click()

  dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Medium spender')).toBeVisible()
  // The vote is on a referendum that is still running, so nothing here takes it
  // back and there is nothing the track would free
  await expect(dialog.getByText('1 vote on a referendum still running')).toBeVisible()

  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(dialog.getByText('Nothing is free to unlock yet')).toBeVisible()
})

test('a whole board of deposits goes back in one signature', async ({ page }) => {
  await createKey(page)
  await governance(page)

  await tab(page, 'Deposits to return')
  const owed = page.getByRole('region', { name: 'Deposits to return' })
  await expect(owed.locator('article')).toHaveCount(4)

  await page.getByRole('button', { name: 'Return every deposit' }).click()
  const dialog = page.getByRole('dialog')
  // Five refunds, since being timed out costs the submission deposit, plus the
  // preimage, which is only its own noter's to clear
  await expect(dialog.getByText('5 deposits from finished referenda, and 1 preimage')).toBeVisible()
  await expect(dialog.getByText('over 6 calls')).toBeVisible()

  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  await expect(page.getByText('All of it went through')).toBeVisible()
  await expect(page.getByText('Nothing to hand back')).toBeVisible()
})

test('every ready spend is claimed at once', async ({ page }) => {
  await createKey(page)
  await governance(page)

  await tab(page, 'Approved spends')
  await page.getByRole('button', { name: 'Claim every ready spend' }).click()

  const dialog = page.getByRole('dialog')
  // One of the three is ready, the others are early and expired
  await expect(dialog.getByText('booked 1 payment nobody has claimed')).toBeVisible()

  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  // One of them is one call, not a batch of one, so it settles as a payout does
  await expect(page.getByText('Treasury spend paid')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Claim every ready spend' })).toHaveCount(0)
})

test('one signature takes back the finished votes and frees the track', async ({ page }) => {
  await createKey(page)
  await governance(page)

  // #1 is running, so the vote on it holds the lock and nothing can free it
  await referendum(page, 1).getByRole('button', { name: 'Vote' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Amount').fill('1000')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Vote counted')).toBeVisible()

  // Taking it back by hand leaves the conviction holding the balance, which is
  // the state the release dialog is for
  await referendum(page, 1).getByRole('button', { name: 'Take back' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(page.getByText('Vote taken back')).toBeVisible()

  await page.getByRole('button', { name: 'Accounts' }).click()
  await page
    .locator('article')
    .filter({ hasText: 'Vault' })
    .getByRole('button', { name: 'Account menu' })
    .click()
  await page.getByRole('menuitem', { name: 'Release vote locks' }).click()

  dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/left on the conviction/)).toBeVisible()
  await expect(dialog.getByText(/takes back/)).toHaveCount(0)
})

test('one ballot covers several referenda at once', async ({ page }) => {
  await createKey(page)
  await governance(page)

  await page.getByRole('button', { name: 'Vote on several' }).click()
  const dialog = page.getByRole('dialog')

  // Nothing is voted on until somebody says how it should go
  await dialog.getByRole('button', { name: 'Sign and send' }).click()
  await expect(dialog.getByText('Say how at least one of these should go')).toBeVisible()

  const say = async (index: number, how: string) => {
    await dialog.getByRole('combobox', { name: `Vote on referendum ${index}` }).click()
    await page.getByRole('option', { name: how, exact: true }).click()
  }
  await say(1, 'Aye')
  await say(3, 'Nay')

  await dialog.getByLabel('Amount').fill('1000')
  await dialog.getByLabel('Account password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign and send' }).click()

  await expect(page.getByText('All of it went through')).toBeVisible()
  // Both tallies moved. An aye on #1 barely shifts five million of approval but
  // does show in its support, and the nay on #3 takes its approval down
  await expect(referendum(page, 1).getByText('Support 21.67%/43.14%')).toBeVisible()
  await expect(referendum(page, 3).getByText('Approval 97.48%/80.18%')).toBeVisible()
})
