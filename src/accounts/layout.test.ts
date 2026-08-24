import { beforeEach, describe, expect, it } from 'vitest'
import {
  addGroup,
  emptyLayout,
  loadLayout,
  moveAccount,
  moveGroup,
  reconcile,
  removeGroup,
  renameGroup,
  unplace,
  saveLayout,
  setCollapsed,
  STORAGE_KEY,
  UNGROUPED_ID,
  type Layout,
} from './layout'

const ids = (layout: Layout) => layout.groups.map((g) => g.id)
const accountsIn = (layout: Layout, id: string) =>
  layout.groups.find((g) => g.id === id)?.accounts ?? []

function seed(): Layout {
  const base = emptyLayout()
  return {
    ...base,
    groups: [
      { id: 'main', name: 'Main', accounts: ['a', 'b'], collapsed: false },
      { id: 'cold', name: 'Cold', accounts: ['c'], collapsed: false },
      { id: UNGROUPED_ID, name: 'Ungrouped', accounts: ['d'], collapsed: false },
    ],
  }
}

describe('reconcile', () => {
  it('files accounts it has never seen under Ungrouped', () => {
    const next = reconcile(seed(), ['a', 'b', 'c', 'd', 'e'])
    expect(accountsIn(next, UNGROUPED_ID)).toEqual(['d', 'e'])
  })

  /**
   * An extension answers a moment after the page does. Taking its accounts out
   * while it is still connecting is what used to move them to the end of the
   * board on every reload.
   */
  it('keeps a place for an account this load has not produced yet', () => {
    const next = reconcile(seed(), ['a', 'd'])
    expect(accountsIn(next, 'main')).toEqual(['a', 'b'])
    expect(accountsIn(next, 'cold')).toEqual(['c'])
    expect(accountsIn(next, UNGROUPED_ID)).toEqual(['d'])
  })

  it('leaves an account where it was when it comes back', () => {
    const half = reconcile(seed(), ['a', 'b'])
    const whole = reconcile(half, ['a', 'b', 'c', 'd'])
    expect(accountsIn(whole, 'cold')).toEqual(['c'])
    expect(accountsIn(whole, UNGROUPED_ID)).toEqual(['d'])
  })

  it('files an account once even if the layout listed it twice', () => {
    const doubled = seed()
    doubled.groups[1]!.accounts.push('a')
    const next = reconcile(doubled, ['a', 'b', 'c', 'd'])
    expect(accountsIn(next, 'main')).toEqual(['a', 'b'])
    expect(accountsIn(next, 'cold')).toEqual(['c'])
  })

  it('returns the very same layout when nothing moved', () => {
    const layout = seed()
    expect(reconcile(layout, ['a', 'b', 'c', 'd'])).toBe(layout)
  })
})

describe('unplace', () => {
  it('takes an account off the board wherever it was sitting', () => {
    const next = unplace(seed(), 'c')
    expect(accountsIn(next, 'cold')).toEqual([])
    expect(accountsIn(next, 'main')).toEqual(['a', 'b'])
  })

  /** Which is what makes reconcile safe to leave every other place alone. */
  it('lets it come back as a stranger rather than to its old seat', () => {
    const back = reconcile(unplace(seed(), 'c'), ['a', 'b', 'c', 'd'])
    expect(accountsIn(back, 'cold')).toEqual([])
    expect(accountsIn(back, UNGROUPED_ID)).toEqual(['d', 'c'])
  })
})

describe('groups', () => {
  it('adds new groups at the end', () => {
    expect(addGroup(seed(), 'Mining').groups.at(-1)?.name).toBe('Mining')
  })

  it('drops a deleted group’s accounts into Ungrouped', () => {
    const next = removeGroup(seed(), 'main')
    expect(ids(next)).toEqual(['cold', UNGROUPED_ID])
    expect(accountsIn(next, UNGROUPED_ID)).toEqual(['d', 'a', 'b'])
  })

  it('deletes the last user group just like any other', () => {
    const single = removeGroup(removeGroup(seed(), 'main'), 'cold')
    expect(ids(single)).toEqual([UNGROUPED_ID])
    expect(accountsIn(single, UNGROUPED_ID)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('refuses to delete Ungrouped, since a new account has to land somewhere', () => {
    const layout = seed()
    expect(removeGroup(layout, UNGROUPED_ID)).toBe(layout)
  })

  it('renames Ungrouped like any other group', () => {
    expect(renameGroup(seed(), UNGROUPED_ID, 'Loose').groups.at(-1)?.name).toBe('Loose')
  })

  it('remembers a collapsed group', () => {
    expect(setCollapsed(seed(), 'main', true).groups[0]?.collapsed).toBe(true)
  })
})

describe('moveAccount', () => {
  it('moves a card into another group at the position it was dropped', () => {
    const next = moveAccount(seed(), 'a', 'cold', 0)
    expect(accountsIn(next, 'cold')).toEqual(['a', 'c'])
    expect(accountsIn(next, 'main')).toEqual(['b'])
  })

  it('reorders inside one group', () => {
    const next = moveAccount(seed(), 'a', 'main', 1)
    expect(accountsIn(next, 'main')).toEqual(['b', 'a'])
  })

  it('appends when dropped past the end', () => {
    const next = moveAccount(seed(), 'a', 'cold', 99)
    expect(accountsIn(next, 'cold')).toEqual(['c', 'a'])
  })

  it('returns the very same layout when the card is already there', () => {
    const layout = seed()
    expect(moveAccount(layout, 'a', 'main', 0)).toBe(layout)
  })

  it('ignores a group that does not exist', () => {
    const layout = seed()
    expect(moveAccount(layout, 'a', 'gone', 0)).toBe(layout)
  })
})

describe('moveGroup', () => {
  it('reorders groups', () => {
    expect(ids(moveGroup(seed(), 'cold', 0))).toEqual(['cold', 'main', UNGROUPED_ID])
  })

  it('moves Ungrouped like any other group', () => {
    expect(ids(moveGroup(seed(), UNGROUPED_ID, 0))).toEqual([UNGROUPED_ID, 'main', 'cold'])
  })

  it('appends when dropped past the end', () => {
    expect(ids(moveGroup(seed(), 'main', 99))).toEqual(['cold', UNGROUPED_ID, 'main'])
  })

  it('ignores a group that does not exist', () => {
    const layout = seed()
    expect(moveGroup(layout, 'gone', 0)).toBe(layout)
  })
})

describe('storage', () => {
  beforeEach(() => localStorage.clear())

  it('starts with nothing but Ungrouped', () => {
    expect(ids(loadLayout())).toEqual([UNGROUPED_ID])
  })

  it('survives a round trip', () => {
    const layout = { ...seed(), names: { a: 'Vault' } }
    saveLayout(layout)
    const loaded = loadLayout()
    expect(ids(loaded)).toEqual(['main', 'cold', UNGROUPED_ID])
    expect(loaded.names).toEqual({ a: 'Vault' })
  })

  it('rebuilds a layout that lost its system group', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ groups: [{ id: 'main', name: 'Main', accounts: ['a'] }] }),
    )
    expect(ids(loadLayout())).toEqual(['main', UNGROUPED_ID])
  })

  it('keeps the name the user gave the system group', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ groups: [{ id: UNGROUPED_ID, name: 'Renamed', accounts: [] }] }),
    )
    expect(loadLayout().groups[0]?.name).toBe('Renamed')
  })

  it('falls back to an empty layout rather than throwing on junk', () => {
    localStorage.setItem(STORAGE_KEY, '{ not json')
    expect(ids(loadLayout())).toEqual([UNGROUPED_ID])
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ groups: 'nope', names: [] }))
    expect(ids(loadLayout())).toEqual([UNGROUPED_ID])
  })
})
