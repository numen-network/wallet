import type { ReactNode } from 'react'
import { Field as Box, FieldLabel, FieldTitle } from '@/components/ui/field'
import { cn } from '@/lib/cn'

/*
  The box a value sits in. A field draws its own, and anything laid out as a
  table of values draws one per cell. The padding lives here too, so a column
  of boxes comes out one height without anyone measuring.
*/
export const BOX = 'rounded-md border border-input bg-muted px-3 py-2 focus-within:border-primary'

/** What a control wears inside a box, which is nothing of its own. */
export const INSIDE = 'w-full justify-between bg-transparent text-[15px]'

/**
 * Label above the value in one box, with room on the right for whatever the
 * chain says about what is being typed. Reading the two together beats reading
 * a label, then a box, then a line underneath it. Without a label it is the
 * bare box, for a cell in a table of values.
 */
export function Field({
  label,
  aside,
  className,
  children,
}: {
  label?: string
  aside?: ReactNode
  className?: string
  children: ReactNode
}) {
  if (!label) return <Box className={cn(BOX, className)}>{children}</Box>

  return (
    <FieldLabel className={cn('mt-2.5 first:mt-0', className)}>
      <Box className={BOX}>
        <FieldTitle>
          {label}
          {aside && <span className="ml-auto truncate">{aside}</span>}
        </FieldTitle>
        {children}
      </Box>
    </FieldLabel>
  )
}
