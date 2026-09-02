import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'danger'

// No border colour here, the variants own it.
const BASE =
  'inline-flex items-center justify-center gap-[7px] rounded-[4px] border px-3.5 py-[7px] text-[13.5px] font-semibold leading-tight whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45'

const VARIANTS: Record<Variant, string> = {
  primary: 'border-transparent bg-primary text-primary-foreground hover:not-disabled:bg-primary-hover',
  secondary: 'border-input bg-card hover:not-disabled:bg-accent',
  danger: 'border-transparent bg-destructive text-destructive-foreground',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export function Button({ variant = 'secondary', className, ...props }: ButtonProps) {
  return <button {...props} className={cn(BASE, VARIANTS[variant], className)} />
}

/** Square icon button used in card and group headers. */
export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        'relative grid size-7 shrink-0 place-items-center rounded-[6px] text-muted-foreground hover:bg-accent hover:text-foreground',
        className,
      )}
    />
  )
}
