import { createContext, useContext, useRef, useState, type ReactNode } from 'react'

/**
 * What a dialog had in its fields, by name. A send that fails after the dialog
 * has closed brings the dialog back with them, so nobody types a form twice.
 */
export type Fields = Record<string, unknown>

interface Scope {
  seed: Fields
  values: Fields
  reopen: (seed: Fields) => void
}

const ScopeContext = createContext<Scope | null>(null)

/**
 * Which dialog a page has open, and a way to open it again as it was. Every
 * open remounts, so a dialog brought back reads its seed afresh even where the
 * same one is already showing.
 */
export function useDialog<M>(initial: M | null | (() => M | null) = null) {
  const [state, setState] = useState(() => ({
    modal: initial instanceof Function ? initial() : initial,
    seed: {} as Fields,
    key: 0,
  }))
  const open = (modal: M | null, seed: Fields = {}) =>
    setState((was) => ({ modal, seed, key: was.key + 1 }))
  const { modal, seed, key } = state

  return {
    modal,
    open,
    close: () => open(null),
    scope: { key, seed, reopen: (fields: Fields) => open(modal, fields) },
  }
}

/** Wraps whatever dialog a page renders, so its fields can be read back. */
export function FormScope({
  seed,
  reopen,
  children,
}: {
  seed: Fields
  reopen: (seed: Fields) => void
  children: ReactNode
}) {
  const values = useRef<Fields>({}).current
  return <ScopeContext value={{ seed, values, reopen }}>{children}</ScopeContext>
}

/** useState for a dialog's field, under a name unique within the dialog. */
export function useField<T>(name: string, initial: T | (() => T)) {
  const scope = useContext(ScopeContext)
  const [value, setValue] = useState<T>(() =>
    scope && name in scope.seed
      ? (scope.seed[name] as T)
      : initial instanceof Function
        ? initial()
        : initial,
  )
  if (scope) scope.values[name] = value
  return [value, setValue] as const
}

/** What a dialog holds under a name kept by something other than useField. */
export function useSeeded<T>(name: string, value: T | undefined): T | undefined {
  const scope = useContext(ScopeContext)
  const held = value ?? (scope?.seed[name] as T | undefined)
  if (scope && held !== undefined) scope.values[name] = held
  return held
}

/**
 * The fields as they stand, and a way to bring the dialog back with them.
 * Null outside a FormScope, where there is nothing to bring back.
 */
export function useReopen() {
  const scope = useContext(ScopeContext)
  if (!scope) return null
  return {
    snapshot: (): Fields => ({ ...scope.values }),
    reopen: scope.reopen,
  }
}
