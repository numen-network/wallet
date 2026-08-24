/**
 * Grouping, ordering and naming are the user's own filing system. None of it
 * exists on chain, so all of it lives here as plain data and goes to
 * localStorage. Every operation is a pure function over `Layout`, which is what
 * makes the drag interactions testable without a browser.
 */

export const STORAGE_KEY = 'numen-wallet-v1'

/**
 * Every account belongs to a group, so this is the group an account lands in
 * when nothing else claims it. It orders, renames and collapses like any other,
 * and it is the only one that cannot be deleted, because a new account has to
 * have somewhere to go.
 */
export const UNGROUPED_ID = 'ungrouped'

export interface Group {
  id: string
  name: string
  accounts: string[]
  collapsed: boolean
}

export interface WatchEntry {
  address: string
  evmAddress: string | null
  name: string
}

/** Its address is derived from the signatories, so the chain needs telling nothing. */
export interface MultisigEntry {
  address: string
  name: string
  threshold: number
  signatories: string[]
}

/** An account some local key may act for, once the proxy calls are wired. */
export interface ProxiedEntry {
  address: string
  name: string
  proxy: string
}

export interface Layout {
  groups: Group[]
  /** Address to user chosen name, overriding whatever the extension calls it. */
  names: Record<string, string>
  /** Addresses the user forgot. Hidden from the view, untouched on chain. */
  hidden: string[]
  watch: WatchEntry[]
  multisig: MultisigEntry[]
  proxied: ProxiedEntry[]
  /** Set once the user has authorised the extension, so later loads reconnect. */
  extensionConnected: boolean
}

export function emptyLayout(): Layout {
  return {
    groups: [{ id: UNGROUPED_ID, name: 'Ungrouped', accounts: [], collapsed: false }],
    names: {},
    hidden: [],
    watch: [],
    multisig: [],
    proxied: [],
    extensionConnected: false,
  }
}

/** Whether this is the group that catches accounts, which is to say undeletable. */
export function isSystemGroup(group: Group): boolean {
  return group.id === UNGROUPED_ID
}

export function groupOf(layout: Layout, address: string): Group | undefined {
  return layout.groups.find((g) => g.accounts.includes(address))
}

function ungrouped(layout: Layout): Group {
  const group = layout.groups.find((g) => g.id === UNGROUPED_ID)
  if (!group) throw new Error('Layout lost its system group')
  return group
}

function withGroups(layout: Layout, groups: Group[]): Layout {
  return { ...layout, groups }
}

/**
 * Folds the live account list into the stored layout. Anything the board has
 * not placed lands in Ungrouped, and an address never appears twice.
 *
 * Where an account sits is the user's arrangement, so nothing here takes one
 * away. Forgetting does that, and forgetting is something somebody asks for.
 */
export function reconcile(layout: Layout, addresses: string[]): Layout {
  const seen = new Set<string>()
  let doubled = false

  // Only a duplicate is worth taking out. An account this load has not produced
  // yet is late rather than gone, and an extension takes a moment to answer, so
  // dropping it here is what sends it to the end the moment it arrives
  const groups = layout.groups.map((group) => {
    const accounts = group.accounts.filter((address) => {
      if (seen.has(address)) return false
      seen.add(address)
      return true
    })
    if (accounts.length !== group.accounts.length) doubled = true
    return { ...group, accounts }
  })

  const fresh = addresses.filter((address) => !seen.has(address))
  // Same layout in means same object out, otherwise every render moves cards
  if (!doubled && !fresh.length) return layout

  const next = withGroups(layout, groups)
  ungrouped(next).accounts.push(...fresh)
  return next
}

/** Takes an address off the board, which is the one thing reconcile will not do. */
export function unplace(layout: Layout, address: string): Layout {
  return withGroups(
    layout,
    layout.groups.map((group) => ({
      ...group,
      accounts: group.accounts.filter((entry) => entry !== address),
    })),
  )
}

export function addGroup(layout: Layout, name: string): Layout {
  const group: Group = { id: newGroupId(layout), name, accounts: [], collapsed: false }
  return withGroups(layout, [...layout.groups, group])
}

export function removeGroup(layout: Layout, id: string): Layout {
  const target = layout.groups.find((g) => g.id === id)
  if (!target || isSystemGroup(target)) return layout

  const next = withGroups(
    layout,
    layout.groups.filter((g) => g.id !== id),
  )
  ungrouped(next).accounts.push(...target.accounts)
  return next
}

export function renameGroup(layout: Layout, id: string, name: string): Layout {
  if (!layout.groups.some((g) => g.id === id)) return layout

  return withGroups(
    layout,
    layout.groups.map((g) => (g.id === id ? { ...g, name } : g)),
  )
}

export function setCollapsed(layout: Layout, id: string, collapsed: boolean): Layout {
  return withGroups(
    layout,
    layout.groups.map((g) => (g.id === id ? { ...g, collapsed } : g)),
  )
}

/** Drops `address` at `index` inside `groupId`, pulling it out of wherever it was. */
export function moveAccount(layout: Layout, address: string, groupId: string, index: number): Layout {
  const target = layout.groups.find((g) => g.id === groupId)
  if (!target) return layout

  // A drag that lands where the card already sits must not produce a new
  // layout, or the card jitters under the pointer for the rest of the drag
  const settled = target.accounts.indexOf(address)
  if (settled !== -1 && settled === clamp(index, target.accounts.length - 1)) return layout

  const groups = layout.groups.map((group) => ({
    ...group,
    accounts: group.accounts.filter((a) => a !== address),
  }))

  const landing = groups.find((g) => g.id === groupId)
  if (!landing) return layout
  landing.accounts.splice(clamp(index, landing.accounts.length), 0, address)

  return withGroups(layout, groups)
}

export function moveGroup(layout: Layout, id: string, index: number): Layout {
  const group = layout.groups.find((g) => g.id === id)
  if (!group) return layout

  const rest = layout.groups.filter((g) => g.id !== id)
  rest.splice(clamp(index, rest.length), 0, group)
  return withGroups(layout, rest)
}

function clamp(index: number, max: number): number {
  if (index < 0) return 0
  return index > max ? max : index
}

/**
 * Ids outlive the tab that made them, so a counter is not enough, and
 * `crypto.randomUUID` is missing on a page served over plain http.
 */
function newGroupId(layout: Layout): string {
  const taken = new Set(layout.groups.map((g) => g.id))
  let id = ''
  do {
    id = `g${Math.random().toString(36).slice(2, 10)}`
  } while (taken.has(id))
  return id
}

export function loadLayout(): Layout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyLayout()
    return repair(JSON.parse(raw) as Partial<Layout>)
  } catch {
    return emptyLayout()
  }
}

export function saveLayout(layout: Layout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // A full or blocked storage costs the user their grouping, not their keys
  }
}

/** Stored layouts outlive the code that wrote them, so nothing here is trusted. */
function repair(stored: Partial<Layout>): Layout {
  const base = emptyLayout()
  const groups = Array.isArray(stored.groups)
    ? stored.groups
        .filter((g): g is Group => Boolean(g) && typeof g.id === 'string' && Array.isArray(g.accounts))
        .map((g) => ({
          id: g.id,
          name: String(g.name ?? 'Group'),
          accounts: g.accounts.filter((a): a is string => typeof a === 'string'),
          collapsed: Boolean(g.collapsed),
        }))
    : []

  if (!groups.some((g) => g.id === UNGROUPED_ID)) groups.push(...base.groups)

  return {
    groups,
    names: isRecord(stored.names) ? stored.names : {},
    hidden: Array.isArray(stored.hidden) ? stored.hidden.filter((a) => typeof a === 'string') : [],
    watch: named<WatchEntry>(stored.watch),
    multisig: named<MultisigEntry>(stored.multisig).filter((m) => Array.isArray(m.signatories)),
    proxied: named<ProxiedEntry>(stored.proxied).filter((p) => typeof p.proxy === 'string'),
    extensionConnected: Boolean(stored.extensionConnected),
  }
}

/** Anything stored against an address, with the address proven to be there. */
function named<T extends { address: string }>(stored: unknown): T[] {
  return Array.isArray(stored)
    ? (stored as T[]).filter((entry) => Boolean(entry) && typeof entry.address === 'string')
    : []
}

function isRecord(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
