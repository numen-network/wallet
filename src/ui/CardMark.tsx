import type { ReactNode } from 'react'

/**
 * What names a card at a glance. The chain's own number for it, or the head of
 * its hash when there is none.
 */
export function CardMark({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[13px] font-bold text-dim">{children}</span>
}
