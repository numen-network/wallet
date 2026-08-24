import { expect, test, type Page } from '@playwright/test'

/**
 * Runs against VITE_CHAIN=mock, so it needs no node. Accounts are seeded as
 * watch entries because those need no extension either, which keeps the whole
 * page reachable without a browser wallet installed.
 */
const VAULT = 'nu32czLMgUWfEXJgQPyWH3AMdjXbaBoqghDwtJbhaJf9UJJ5U'
const BRIDGE = 'nu2uaQWzSyDzXHrgd78sQL2871qL2LpPU6kHeeb4ETtXfnASg'
const SPARE = 'nu3oNksEGXV3Tsr4sBeRUpcfA5zYp4VvZ7t9uKVPMAe2UCo98'
const BRIDGE_EVM = '0x1234567890abcdef1234567890abcdef12345678'

const LAYOUT = {
  groups: [
    { id: 'main', name: 'Main', accounts: [VAULT, BRIDGE], collapsed: false },
    { id: 'ungrouped', name: 'Ungrouped', accounts: [SPARE], collapsed: false },
  ],
  names: {},
  hidden: [],
  watch: [
    { address: VAULT, evmAddress: null, name: 'Vault' },
    { address: BRIDGE, evmAddress: BRIDGE_EVM, name: 'Bridge' },
    { address: SPARE, evmAddress: null, name: 'Spare' },
  ],
  extensionConnected: false,
}

async function open(page: Page) {
  // Seeded once and then reloaded, so a later reload sees what the test changed
  await page.goto('/')
  await page.evaluate(
    (layout) => localStorage.setItem('numen-wallet-v1', JSON.stringify(layout)),
    LAYOUT,
  )
  await page.reload()
  await expect(page.getByText('Vault')).toBeVisible()
}

const card = (page: Page, name: string) => page.locator('article').filter({ hasText: name })

test('shows every seeded account under its group', async ({ page }) => {
  await open(page)

  await expect(page.getByRole('heading', { name: 'Main' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ungrouped' })).toBeVisible()
  await expect(page.locator('article')).toHaveCount(3)
})

test('one group needs no heading, a second one brings them back', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(
    (layout) => localStorage.setItem('numen-wallet-v1', JSON.stringify(layout)),
    {
      ...LAYOUT,
      groups: [
        { id: 'ungrouped', name: 'Ungrouped', accounts: [VAULT, BRIDGE, SPARE], collapsed: false },
      ],
    },
  )
  await page.reload()

  await expect(page.locator('article')).toHaveCount(3)
  await expect(page.locator('section h2')).toHaveCount(0)

  await page.getByRole('button', { name: 'Group', exact: true }).click()
  await page.getByLabel('Name').fill('Cold')
  await page.getByRole('button', { name: 'Create' }).click()

  await expect(page.locator('section h2')).toHaveText(['Ungrouped', 'Cold'])
})

test('the picker files accounts the way the board does', async ({ page }) => {
  // Main holds Bridge over Vault while the watch list declares Vault first, so
  // a list built off the declaration rather than off the group comes out in the
  // order the accounts were collected instead of the order they are read in
  await page.goto('/')
  await page.evaluate(
    (layout) => localStorage.setItem('numen-wallet-v1', JSON.stringify(layout)),
    {
      ...LAYOUT,
      groups: [
        { id: 'main', name: 'Main', accounts: [BRIDGE, VAULT], collapsed: false },
        { id: 'ungrouped', name: 'Ungrouped', accounts: [SPARE], collapsed: false },
      ],
    },
  )
  await page.reload()

  await page.getByRole('button', { name: 'Proxied' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Acting for', exact: true }).click()

  const offered = page.getByRole('option')
  await expect(offered.nth(0)).toContainText('Bridge')
  await expect(offered.nth(1)).toContainText('Vault')
  await expect(offered.nth(2)).toContainText('Spare')
})

test('shows the EVM row only for an account that has one', async ({ page }) => {
  await open(page)

  await expect(card(page, 'Bridge').getByText('EVM')).toBeVisible()
  await expect(card(page, 'Vault').getByText('EVM')).toHaveCount(0)
})

test('watch only accounts cannot send', async ({ page }) => {
  await open(page)

  await expect(card(page, 'Vault').getByRole('button', { name: 'Send' })).toBeDisabled()
  await expect(card(page, 'Vault').getByText('watch')).toBeVisible()
})

test('the header owns up to running on invented balances', async ({ page }) => {
  await open(page)

  await expect(page.getByText('mock data')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'RPC endpoint' })).toHaveAttribute(
    'title',
    /Nothing is connected/,
  )
})

test('the endpoint picker switches network and remembers the choice', async ({ page }) => {
  await open(page)
  await expect(page.getByText('tNUMN').first()).toBeVisible()

  await page.getByRole('combobox', { name: 'RPC endpoint' }).click()
  await page.getByRole('option', { name: 'Numen', exact: true }).click()
  await expect(page.getByText('NUMN', { exact: true }).first()).toBeVisible()

  await page.reload()
  const picker = page.getByRole('combobox', { name: 'RPC endpoint' })
  await expect(picker).toContainText('Numen')
  await expect(picker).not.toContainText('Local')
})

test('the header says how quickly the node is answering', async ({ page }) => {
  await open(page)

  await expect(page.getByRole('combobox', { name: 'RPC endpoint' })).toContainText('24 ms')
})

test('receive shows both addresses in full', async ({ page }) => {
  await open(page)
  await card(page, 'Bridge').getByRole('button', { name: 'Receive' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(BRIDGE)).toBeVisible()
  await expect(dialog.getByText(BRIDGE_EVM)).toBeVisible()
  await expect(dialog.locator('svg[aria-label^="QR code"]')).toHaveCount(2)
})

test('a dialog closes on escape and on a click outside it', async ({ page }) => {
  await open(page)

  await card(page, 'Vault').getByRole('button', { name: 'Receive' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await card(page, 'Vault').getByRole('button', { name: 'Receive' }).click()
  await page.mouse.click(30, 500)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a collapsed group survives a reload', async ({ page }) => {
  await open(page)

  await page.getByRole('button', { name: 'Collapse group' }).first().click()
  await expect(page.locator('article')).toHaveCount(1)

  await page.reload()
  await expect(page.locator('article')).toHaveCount(1)
})

test('renaming a group keeps the accounts under it', async ({ page }) => {
  await open(page)

  await page.getByRole('button', { name: 'Group menu' }).first().click()
  await page.getByRole('menuitem', { name: 'Rename group' }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('Cold storage')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByRole('heading', { name: 'Cold storage' })).toBeVisible()
  await expect(page.locator('article')).toHaveCount(3)
})

test('forgetting an account removes it for good', async ({ page }) => {
  await open(page)

  await card(page, 'Spare').getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Forget this account' }).click()
  await page.getByRole('button', { name: 'Forget' }).click()

  await expect(page.locator('article')).toHaveCount(2)
  await page.reload()
  await expect(page.locator('article')).toHaveCount(2)
})

const ungroupedSection = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Ungrouped' }) })

/** Lifts a card and holds the pointer over the Ungrouped header. */
async function dragVaultToUngrouped(page: Page) {
  const from = await card(page, 'Vault').boundingBox()
  const to = await page.getByRole('heading', { name: 'Ungrouped' }).boundingBox()
  if (!from || !to) throw new Error('Card or group not laid out')

  await page.mouse.move(from.x + from.width / 2, from.y + 20)
  await page.mouse.down()
  // A drag only lifts after 5px, and the board needs a few frames to settle
  for (let step = 1; step <= 10; step++) {
    await page.mouse.move(
      from.x + from.width / 2,
      from.y + 20 + ((to.y + 60 - from.y - 20) * step) / 10,
      { steps: 3 },
    )
  }
}

test('dragging a card into another group sticks', async ({ page }) => {
  await open(page)

  await dragVaultToUngrouped(page)
  await page.mouse.up()

  await expect(ungroupedSection(page).locator('article')).toHaveCount(2)
  await page.reload()
  await expect(ungroupedSection(page).locator('article')).toHaveCount(2)
})

test('escape puts a dragged card back', async ({ page }) => {
  await open(page)

  await dragVaultToUngrouped(page)
  await expect(ungroupedSection(page).locator('article')).toHaveCount(2)

  await page.keyboard.press('Escape')
  await page.mouse.up()

  await expect(ungroupedSection(page).locator('article')).toHaveCount(1)
  await page.reload()
  await expect(ungroupedSection(page).locator('article')).toHaveCount(1)
})

test('card text can be picked out by hand', async ({ page }) => {
  await open(page)

  const name = await card(page, 'Vault').getByText('Vault').boundingBox()
  if (!name) throw new Error('Card not laid out')

  await page.mouse.move(name.x + 1, name.y + name.height / 2)
  await page.mouse.down()
  await page.mouse.move(name.x + name.width - 1, name.y + name.height / 2, { steps: 12 })
  await page.mouse.up()

  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('Vault')
  // The same gesture on the card would have dragged it out of Main
  await expect(ungroupedSection(page).locator('article')).toHaveCount(1)
})

/** Drops one group header on another, which puts it in that one's place. */
async function dragGroupOnto(page: Page, name: string, target: string) {
  // A synthetic drag has none of the autoscrolling a pointer gets, so a group
  // sitting below the fold has to be brought up before it can be picked up
  await page.getByRole('heading', { name }).scrollIntoViewIfNeeded()
  const from = await page.getByRole('heading', { name }).boundingBox()
  const to = await page.getByRole('heading', { name: target }).boundingBox()
  if (!from || !to) throw new Error('Groups not laid out')

  await page.mouse.move(from.x + 60, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + 60, from.y + from.height / 2 - 20, { steps: 5 })
  await page.mouse.move(to.x + 60, to.y + 2, { steps: 10 })
  await page.mouse.up()
}

const headings = (page: Page) => page.locator('section h2')

test('dragging a group header reorders the board', async ({ page }) => {
  await open(page)

  await page.getByRole('button', { name: 'Group', exact: true }).click()
  await page.getByLabel('Name').fill('Cold')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(headings(page)).toHaveText(['Main', 'Ungrouped', 'Cold'])

  await dragGroupOnto(page, 'Cold', 'Main')

  await expect(headings(page)).toHaveText(['Cold', 'Main', 'Ungrouped'])
  await page.reload()
  await expect(headings(page)).toHaveText(['Cold', 'Main', 'Ungrouped'])
})

test('Ungrouped reorders like any other group', async ({ page }) => {
  await open(page)

  await dragGroupOnto(page, 'Ungrouped', 'Main')

  await expect(headings(page)).toHaveText(['Ungrouped', 'Main'])
  await page.reload()
  await expect(headings(page)).toHaveText(['Ungrouped', 'Main'])
})

test('a collapsed group still takes a drop', async ({ page }) => {
  await open(page)

  await ungroupedSection(page).getByRole('button', { name: 'Collapse group' }).click()
  await expect(ungroupedSection(page).locator('article')).toHaveCount(0)

  await dragVaultToUngrouped(page)
  await page.mouse.up()

  // A drop swallows any click landing within 50ms of it, so a person never
  // notices but a script has to wait the guard out
  await page.waitForTimeout(100)
  await ungroupedSection(page).getByRole('button', { name: 'Expand group' }).click()
  await expect(ungroupedSection(page).locator('article')).toHaveCount(2)
})

test('the explorer link carries the account it was opened from', async ({ page }) => {
  await open(page)

  // No explorer is running in a test, so the tab is answered with nothing
  await page.context().route('**/account/**', (route) => route.fulfill({ body: '' }))

  const opened = page.waitForEvent('popup')
  await card(page, 'Vault').getByRole('link', { name: 'View on the explorer' }).click()

  const popup = await opened
  await popup.waitForLoadState()
  expect(popup.url()).toBe(`http://127.0.0.1:3000/account/${VAULT}`)
  await popup.close()
})

test('an endpoint of your own joins the list and stays', async ({ page }) => {
  await open(page)

  const picker = page.getByRole('combobox', { name: 'RPC endpoint' })
  await page.getByRole('button', { name: 'Add an endpoint' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('wss://rpc.example.com').fill('http://rpc.example.com')
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(dialog.getByText(/websocket/)).toBeVisible()

  await dialog.getByPlaceholder('wss://rpc.example.com').fill('wss://node.example.com')
  await dialog.getByLabel('Name').fill('My node')
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()

  // Added and selected, since nobody adds one to leave it alone
  await expect(picker).toContainText('My node')
  await page.reload()
  await expect(picker).toContainText('My node')

  await page.getByRole('button', { name: 'Add an endpoint' }).click()
  await dialog.getByRole('button', { name: 'Forget My node' }).click()
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  await expect(picker).toContainText('Numen Local')
  await page.reload()
  await expect(picker).toContainText('Numen Local')
})

test('a card crosses a collapsed group and lands in the one after it', async ({ page }) => {
  await open(page)

  // Ungrouped holds Spare and sits below Main, collapsed
  await page
    .locator('section')
    .filter({ hasText: 'Ungrouped' })
    .getByRole('button', { name: 'Collapse group' })
    .click()

  const from = (await card(page, 'Vault').boundingBox())!
  const header = (await page.getByRole('heading', { name: 'Ungrouped' }).boundingBox())!

  await page.mouse.move(from.x + from.width / 2, from.y + 20)
  await page.mouse.down()
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(
      from.x + from.width / 2 + ((header.x + 40 - from.x - from.width / 2) * i) / 20,
      from.y + 20 + ((header.y + header.height / 2 - from.y - 20) * i) / 20,
    )
  }
  await page.mouse.up()

  // Dropped on the collapsed group, so it went in there rather than staying put
  await page.waitForTimeout(100)
  await ungroupedSection(page).getByRole('button', { name: 'Expand group' }).click()
  await expect(ungroupedSection(page).locator('article')).toHaveCount(2)
})

test('crossing the gap between two cards does not throw the card to the end', async ({ page }) => {
  // Three in a row, so the end of the group is somewhere the card has no
  // business being while the pointer sits between the first two
  await page.goto('/')
  await page.evaluate(
    (layout) => localStorage.setItem('numen-wallet-v1', JSON.stringify(layout)),
    { ...LAYOUT, groups: [{ id: 'ungrouped', name: 'Ungrouped', accounts: [VAULT, BRIDGE, SPARE], collapsed: false }] },
  )
  await page.reload()
  await expect(page.getByText('Vault')).toBeVisible()

  // The overlay following the pointer is outside any section, so this is the board
  const order = () =>
    page.locator('section article').evaluateAll((cards) =>
      cards.map((c) => c.textContent?.match(/(Vault|Bridge|Spare)/)?.[1] ?? '?').join(','),
    )

  const vault = (await card(page, 'Vault').boundingBox())!
  const bridge = (await card(page, 'Bridge').boundingBox())!

  await page.mouse.move(vault.x + vault.width / 2, vault.y + 20)
  await page.mouse.down()
  await page.mouse.move(vault.x + vault.width / 2 + 8, vault.y + 20)

  const seen: string[] = []
  for (let i = 0; i <= 30; i++) {
    await page.mouse.move(vault.x + vault.width / 2 + ((bridge.x - vault.x) * i) / 30, vault.y + 20)
    seen.push(await order())
  }
  await page.mouse.up()

  expect(seen).toContain('Bridge,Vault,Spare')
  expect(seen.filter((line) => line.endsWith(',Vault'))).toEqual([])
})

test('cards are never drawn away from the slot they are in', async ({ page }) => {
  // Enough for two rows, so a reorder moves cards across a row boundary
  const many = Array.from({ length: 6 }, (_, i) => `nu${i}${VAULT.slice(3)}`)
  await page.goto('/')
  await page.evaluate(
    (layout) => localStorage.setItem('numen-wallet-v1', JSON.stringify(layout)),
    {
      ...LAYOUT,
      groups: [{ id: 'ungrouped', name: 'Ungrouped', accounts: many, collapsed: false }],
      watch: many.map((address, i) => ({ address, evmAddress: null, name: `Card${i}` })),
    },
  )
  await page.reload()
  await expect(page.getByText('Card0')).toBeVisible()

  /**
   * The board moves cards for real while a drag runs, so nothing may also be
   * translated. A card carrying both is drawn a column away from where it is.
   */
  const shifted = () =>
    page.locator('section article').evaluateAll((cards) =>
      cards
        .map((c) => (c as HTMLElement).style.transform)
        .filter((t) => t && !t.startsWith('translate3d(0px, 0px')),
    )

  const first = (await card(page, 'Card0').boundingBox())!
  const last = (await card(page, 'Card5').boundingBox())!

  await page.mouse.move(first.x + first.width / 2, first.y + 20)
  await page.mouse.down()
  await page.mouse.move(first.x + first.width / 2 + 8, first.y + 20)

  const strays: string[][] = []
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(
      first.x + first.width / 2 + ((last.x - first.x) * i) / 20,
      first.y + 20 + ((last.y - first.y) * i) / 20,
    )
    strays.push(await shifted())
  }
  await page.mouse.up()

  expect(strays.flat()).toEqual([])
})

test('an address starts where the name above it does', async ({ page }) => {
  await open(page)

  // Nothing the registrars have touched, which is what leaves the identity mark
  // with nothing to draw and used to cost the address a flex gap
  const vault = card(page, 'Vault')
  const name = await vault.getByText('Vault', { exact: true }).boundingBox()
  const address = await vault.getByText('nu32czL…UJJ5U').boundingBox()

  expect(address?.x).toBe(name?.x)
})

test('one QR code goes behind a cover without moving the other', async ({ page }) => {
  await open(page)
  await card(page, 'Bridge').getByRole('button', { name: 'Receive' }).click()

  const dialog = page.getByRole('dialog')
  const numen = dialog.getByRole('img', { name: `QR code for ${BRIDGE}` })
  const evm = dialog.getByRole('img', { name: `QR code for ${BRIDGE_EVM}` })
  await expect(numen).toBeVisible()

  const before = await dialog.boundingBox()
  const evmBefore = await evm.boundingBox()
  await dialog.getByRole('button', { name: 'Hide the Numen QR code' }).click()

  await expect(numen).toHaveCount(0)
  await expect(evm).toBeVisible()
  // The cover stands where the code stood, so nothing around it shifts
  expect((await dialog.boundingBox())?.height).toBe(before?.height)
  expect(await evm.boundingBox()).toEqual(evmBefore)

  // Covering one is for whoever is watching now, so the next look starts clean
  await dialog.getByRole('button', { name: 'Done' }).click()
  await card(page, 'Bridge').getByRole('button', { name: 'Receive' }).click()
  await expect(page.getByRole('dialog').getByRole('img', { name: `QR code for ${BRIDGE}` })).toBeVisible()
})
