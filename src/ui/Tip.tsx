import { useRef, useState, type ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

let lastPress = 0
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => (lastPress = Date.now()), true)
}

/**
 * Hover text for the thing inside, and nothing at all when there is none to
 * show. A disabled control fires no pointer events, so one of those goes in
 * a span first. Nothing that opens a portal goes inside, since React bubbles
 * the portal's pointer events up through here and Radix reads them as hovering.
 *
 * Pressing the thing ends the reading. Radix would close on the press too,
 * but a select swallows it before it bubbles here, then opens on the delay it
 * had already started, and opens again on the focus it hands back when its
 * list closes. So nothing opens over a trigger left inert under a layer, and
 * focus only opens it when no press put it there.
 */
export function Tip({ text, children }: { text: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLElement | null>(null)
  if (!text) return children

  const inert = () =>
    trigger.current !== null && getComputedStyle(trigger.current).pointerEvents === 'none'

  return (
    <Tooltip open={open} onOpenChange={(next) => setOpen(next && !inert())}>
      <TooltipTrigger
        asChild
        onPointerDownCapture={(event) => {
          trigger.current = event.currentTarget
          setOpen(false)
        }}
        onFocus={(event) => {
          if (Date.now() - lastPress < 1_000) event.preventDefault()
        }}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  )
}
