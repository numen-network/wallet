import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

const Disc = ({ icon }: { icon: ReactNode }) => (
  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
    {icon}
  </span>
)

interface ToolButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  label: string
  /** Only the glyph on a phone, where the header has no room for the word. */
  narrow?: boolean
}

/** A pill for something to do, its glyph on a disc. */
export function ToolButton({ icon, label, narrow = false, className, ...props }: ToolButtonProps) {
  return (
    <Button
      type="button"
      variant="pill"
      size="pill"
      {...props}
      className={cn(narrow && 'max-[560px]:pr-1', className)}
    >
      <Disc icon={icon} />
      <span className={cn(narrow && 'max-[560px]:sr-only')}>{label}</span>
    </Button>
  )
}

interface ToolLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  icon: ReactNode
  label: string
}

/** The same pill for somewhere to go rather than something to do. */
export function ToolLink({ icon, label, className, ...props }: ToolLinkProps) {
  return (
    <Button asChild variant="pill" size="pill" className={className}>
      <a {...props}>
        <Disc icon={icon} />
        {label}
      </a>
    </Button>
  )
}
