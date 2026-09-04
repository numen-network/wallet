import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { Button } from '@/components/ui/button'

const Disc = ({ icon }: { icon: ReactNode }) => (
  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
    {icon}
  </span>
)

interface ToolButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  label: string
}

/** A pill for something to do, its glyph on a disc. */
export function ToolButton({ icon, label, className, ...props }: ToolButtonProps) {
  return (
    <Button type="button" variant="pill" size="pill" {...props} className={className}>
      <Disc icon={icon} />
      {label}
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
