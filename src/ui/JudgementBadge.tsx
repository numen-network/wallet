import type { CSSProperties } from 'react'
import { CircleAlert, CircleCheck, CircleQuestionMark, CircleX, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

export type Verdict = 'verified' | 'stale' | 'pending' | 'unjudged' | 'bad'

export const TICK = CircleCheck
export const CROSS = CircleX

const MARKS: Record<Verdict, { fill: string; mark: LucideIcon }> = {
  verified: { fill: 'var(--color-good)', mark: TICK },
  unjudged: { fill: 'var(--color-dim)', mark: CircleQuestionMark },
  pending: { fill: 'var(--color-dim)', mark: CircleQuestionMark },
  stale: { fill: 'var(--color-warn)', mark: CircleAlert },
  bad: { fill: 'var(--color-destructive)', mark: CROSS },
}

/**
 * A filled disc carrying the mark in white, which is what makes it legible at
 * the size an address line leaves for it. Lucide draws the disc as an outline,
 * so the fill goes on its circle and the white on everything drawn over it.
 */
export function MarkDisc({
  fill,
  mark: Mark,
  title,
  className = 'size-3.5',
}: {
  fill: string
  mark: LucideIcon
  title?: string | undefined
  className?: string
}) {
  return (
    <Mark
      className={cn('shrink-0 [&>circle]:fill-[var(--fill)] [&>circle]:stroke-[var(--fill)] [&>:not(circle)]:stroke-white', className)}
      style={{ '--fill': fill } as CSSProperties}
      strokeWidth={2.6}
      role="img"
      aria-label={title}
    >
      {title && <title>{title}</title>}
    </Mark>
  )
}

/** The explorer's identity badge in the same colours, so one judgement reads alike in both. */
export function JudgementBadge({ verdict, title }: { verdict: Verdict; title?: string }) {
  const { fill, mark } = MARKS[verdict]

  return <MarkDisc fill={fill} mark={mark} title={title} />
}
