import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { CONTROL } from './shell'

const PILL =
  `inline-flex ${CONTROL} items-center gap-2 rounded-full border border-line bg-panel pr-3.5 pl-1 text-[13px] font-semibold whitespace-nowrap shadow-card transition-colors hover:not-disabled:bg-hover disabled:cursor-not-allowed disabled:opacity-45`

const Disc = ({ icon }: { icon: ReactNode }) => (
  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
    {icon}
  </span>
)

interface ToolButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  label: string
}

/** A pill for something to do, its glyph on a disc. */
export function ToolButton({ icon, label, className = '', ...props }: ToolButtonProps) {
  return (
    <button type="button" {...props} className={`${PILL} ${className}`}>
      <Disc icon={icon} />
      {label}
    </button>
  )
}

interface ToolLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  icon: ReactNode
  label: string
}

/** The same pill for somewhere to go rather than something to do. */
export function ToolLink({ icon, label, className = '', ...props }: ToolLinkProps) {
  return (
    <a {...props} className={`${PILL} ${className}`}>
      <Disc icon={icon} />
      {label}
    </a>
  )
}
