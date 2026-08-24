import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger'

// No border colour here, the variants own it. Two utilities setting the same
// property let the stylesheet order decide the winner rather than this file.
const BASE =
  'inline-flex items-center justify-center gap-[7px] rounded-[4px] border px-3.5 py-[7px] text-[13.5px] font-semibold leading-tight whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45'

const VARIANTS: Record<Variant, string> = {
  primary: 'border-transparent bg-accent text-accent-ink hover:not-disabled:bg-accent-hover',
  secondary: 'border-line-strong bg-panel hover:not-disabled:bg-hover',
  danger: 'border-transparent bg-bad text-bad-ink',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export function Button({ variant = 'secondary', className = '', ...props }: ButtonProps) {
  return <button {...props} className={`${BASE} ${VARIANTS[variant]} ${className}`} />
}

/** Square icon button used in card and group headers. */
export function IconButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`relative grid size-7 shrink-0 place-items-center rounded-[6px] text-lead hover:bg-hover hover:text-ink ${className}`}
    />
  )
}
