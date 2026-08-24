import { create } from 'zustand'
import * as vault from '@/signing/vault'
import type { VaultKey } from '@/signing/vault'
import * as layout from './layout'
import type { Layout, MultisigEntry, ProxiedEntry, WatchEntry } from './layout'

/**
 * Client state only. Balances belong to the chain and never enter this store,
 * mixing the two is how a stale number ends up next to a live one. The vault
 * slice mirrors the encrypted keys so the board re-renders when one lands, the
 * keys themselves stay in `signing/vault`.
 */
interface AccountsState {
  layout: Layout
  keys: VaultKey[]
  /** Layout as it was when the current drag started, for Escape to restore. */
  beforeDrag: Layout | null

  reconcile: (addresses: string[]) => void
  renameAccount: (address: string, name: string) => void
  forgetAccount: (address: string) => void
  addWatch: (entry: WatchEntry) => void
  addMultisig: (entry: MultisigEntry) => void
  addProxied: (entry: ProxiedEntry) => void

  importSuri: (name: string, suri: string, password: string) => string
  deriveKey: (
    parent: string,
    parentPassword: string,
    path: string,
    name: string,
    password: string,
  ) => string
  importJson: (json: unknown, password: string) => string

  addGroup: (name: string) => void
  removeGroup: (id: string) => void
  renameGroup: (id: string, name: string) => void
  toggleCollapse: (id: string) => void

  moveAccount: (address: string, groupId: string, index: number) => void
  moveGroup: (id: string, index: number) => void

  beginDrag: () => void
  cancelDrag: () => void
  endDrag: () => void

  setExtensionConnected: (connected: boolean) => void
}

export const useAccountsStore = create<AccountsState>((set, get) => {
  /**
   * Every layout change goes through here, so persistence is never forgotten.
   * A drag rewrites the layout on every pointer move and only where it ends is
   * worth keeping, so the write waits for the drop rather than hitting disk
   * once per mouse move.
   */
  const update = (change: (current: Layout) => Layout) =>
    set((state) => {
      const next = change(state.layout)
      if (next === state.layout) return state
      if (state.beforeDrag === null) layout.saveLayout(next)
      return { layout: next }
    })

  const refreshKeys = () => set({ keys: vault.listKeys() })

  return {
    layout: layout.loadLayout(),
    keys: vault.listKeys(),
    beforeDrag: null,

    reconcile: (addresses) => update((l) => layout.reconcile(l, addresses)),

    renameAccount: (address, name) =>
      update((l) => ({ ...l, names: { ...l.names, [address]: name } })),

    /**
     * A watched or injected account is only hidden, the key lives elsewhere. A
     * local key has nowhere else to live, so forgetting it deletes it.
     */
    forgetAccount: (address) => {
      const keyed = vault.hasKey(address)
      if (keyed) {
        vault.removeKey(address)
        refreshKeys()
      }

      // Its place on the board goes with it either way, since reconcile keeps
      // one for anything it does not see and this is what says it is gone
      update((l) =>
        layout.unplace(
          keyed
            ? l
            : {
                ...l,
                hidden: l.hidden.includes(address) ? l.hidden : [...l.hidden, address],
                watch: l.watch.filter((w) => w.address !== address),
                multisig: l.multisig.filter((m) => m.address !== address),
                proxied: l.proxied.filter((p) => p.address !== address),
              },
          address,
        ),
      )
    },

    addWatch: (entry) =>
      update((l) => ({
        ...l,
        hidden: l.hidden.filter((a) => a !== entry.address),
        watch: l.watch.some((w) => w.address === entry.address) ? l.watch : [...l.watch, entry],
      })),

    addMultisig: (entry) =>
      update((l) => ({
        ...l,
        hidden: l.hidden.filter((a) => a !== entry.address),
        multisig: l.multisig.some((m) => m.address === entry.address)
          ? l.multisig
          : [...l.multisig, entry],
      })),

    addProxied: (entry) =>
      update((l) => ({
        ...l,
        hidden: l.hidden.filter((a) => a !== entry.address),
        proxied: l.proxied.some((p) => p.address === entry.address)
          ? l.proxied
          : [...l.proxied, entry],
      })),

    importSuri: (name, suri, password) => {
      const address = vault.importSuri(name, suri, password)
      refreshKeys()
      return address
    },

    deriveKey: (parent, parentPassword, path, name, password) => {
      const address = vault.deriveKey(parent, parentPassword, path, name, password)
      refreshKeys()
      return address
    },

    importJson: (json, password) => {
      const address = vault.importJson(json, password)
      refreshKeys()
      return address
    },

    addGroup: (name) => update((l) => layout.addGroup(l, name)),
    removeGroup: (id) => update((l) => layout.removeGroup(l, id)),
    renameGroup: (id, name) => update((l) => layout.renameGroup(l, id, name)),

    toggleCollapse: (id) =>
      update((l) => {
        const group = l.groups.find((g) => g.id === id)
        return group ? layout.setCollapsed(l, id, !group.collapsed) : l
      }),

    moveAccount: (address, groupId, index) =>
      update((l) => layout.moveAccount(l, address, groupId, index)),

    moveGroup: (id, index) => update((l) => layout.moveGroup(l, id, index)),

    beginDrag: () => set({ beforeDrag: get().layout }),

    endDrag: () => {
      const { layout: settled, beforeDrag } = get()
      if (beforeDrag !== null && settled !== beforeDrag) layout.saveLayout(settled)
      set({ beforeDrag: null })
    },

    cancelDrag: () => {
      const snapshot = get().beforeDrag
      if (snapshot) {
        layout.saveLayout(snapshot)
        set({ layout: snapshot })
      }
      set({ beforeDrag: null })
    },

    setExtensionConnected: (extensionConnected) => update((l) => ({ ...l, extensionConnected })),
  }
})
