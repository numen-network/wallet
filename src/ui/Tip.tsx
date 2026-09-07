import { useRef, useState, type ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Hover text for the thing inside, and nothing at all when there is none to
 * show. A disabled control fires no pointer events, so one of those goes in
 * a span first. Nothing that opens a portal goes inside, since React bubbles
 * the portal's pointer events up through here and Radix reads them as hovering.
 *
 * Only a pointer resting on the thing opens it. Focus never does, so a dialog
 * or a select handing focus back does not put the tip up over what it just
 * closed. A press means the thing was used rather than read, and the hover
 * before it may still have Radix counting down to open, so nothing opens
 * again until the pointer has left and come back.
 */
export function Tip({ text, children }: { text: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pressed = useRef(false)
  if (!text) return children

  return (
    <Tooltip open={open} onOpenChange={(next) => setOpen(next && !pressed.current)}>
      <TooltipTrigger
        asChild
        onPointerEnter={() => {
          pressed.current = false
        }}
        onPointerDownCapture={() => {
          pressed.current = true
          setOpen(false)
        }}
        onFocus={(event) => event.preventDefault()}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  )
}
