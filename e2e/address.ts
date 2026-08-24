import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Every account address in the wallet is one combobox, so every test that puts
 * an address anywhere goes through here. The box itself is a button, the typing
 * happens in the list it opens, and the list is portalled to the page.
 */

const open = async (scope: Locator, label: string) => {
  await scope.getByRole('button', { name: label, exact: true }).click()
}

/** Types an address nobody has saved and takes it. */
export async function fillAddress(page: Page, scope: Locator, label: string, address: string) {
  await open(scope, label)
  await page.getByPlaceholder('nu… or 0x…').fill(address)
  await page.getByText('Use this address').click()
}

/** Takes one of the accounts on offer, by the name the wallet calls it. */
export async function pickAddress(page: Page, scope: Locator, label: string, name: string | RegExp) {
  await open(scope, label)
  await page.getByRole('option', { name }).first().click()
}

/** What the box is showing, which is a name when it knows one. */
export async function expectAddress(scope: Locator, label: string, shown: string | RegExp) {
  await expect(scope.getByRole('button', { name: label, exact: true })).toContainText(shown)
}
