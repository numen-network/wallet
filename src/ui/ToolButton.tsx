import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ToolButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  label: string
}

/** The row of ways to add something, each one a pill with its glyph on a disc. */
export function ToolButton({ icon, label, className = '', ...props }: ToolButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center gap-2 rounded-full border border-line bg-panel py-1 pr-3.5 pl-1 text-[13px] font-semibold whitespace-nowrap shadow-card transition-colors hover:not-disabled:bg-hover disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
        {icon}
      </span>
      {label}
    </button>
  )
}
