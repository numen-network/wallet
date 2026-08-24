import { create } from 'zustand'

/**
 * What a dialog has had typed into it, held for as long as the tab is open. A
 * click outside a form closes it, and a paragraph somebody wrote is not the
 * wallet's to throw away over a misclick.
 *
 * Nothing secret belongs in here. A password lives in the dialog that asks for
 * it and dies with it, which is the whole point of asking every time.
 */

interface DraftState {
  drafts: Record<string, unknown>
  put: (key: string, value: unknown) => void
  drop: (key: string) => void
}

const useDraftStore = create<DraftState>((set) => ({
  drafts: {},
  put: (key, value) => set((state) => ({ drafts: { ...state.drafts, [key]: value } })),
  drop: (key) =>
    set((state) => {
      const { [key]: _sent, ...rest } = state.drafts
      return { drafts: rest }
    }),
}))

/**
 * One draft a key. Key by account where the form is about one, since a dialog
 * opened on somebody else is a different form with the same fields.
 */
export function useDraft<T extends object>(key: string, empty: T) {
  const held = useDraftStore((state) => state.drafts[key]) as T | undefined
  const put = useDraftStore((state) => state.put)
  const drop = useDraftStore((state) => state.drop)
  const draft = held ?? empty

  return [
    draft,
    (patch: Partial<T>) => put(key, { ...draft, ...patch }),
    () => drop(key),
  ] as const
}
