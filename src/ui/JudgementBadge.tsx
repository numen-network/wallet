export type Verdict = 'verified' | 'stale' | 'pending' | 'unjudged' | 'bad'

export const TICK = 'M4 7.2 6.1 9.3 10 5.2'
export const CROSS = 'M4.6 4.6l4.8 4.8M9.4 4.6l-4.8 4.8'
const QUESTION = 'M5.4 5.4c0-1 .7-1.7 1.6-1.7s1.6.7 1.6 1.65c0 1.3-1.6 1.35-1.6 2.65M7 10.3v.2'
const BANG = 'M7 3.6v4.2M7 10.2v.2'

const MARKS: Record<Verdict, { fill: string; mark: string }> = {
  verified: { fill: 'var(--color-good)', mark: TICK },
  unjudged: { fill: 'var(--color-dim)', mark: QUESTION },
  pending: { fill: 'var(--color-dim)', mark: QUESTION },
  stale: { fill: 'var(--color-warn)', mark: BANG },
  bad: { fill: 'var(--color-bad)', mark: CROSS },
}

export function MarkDisc({
  fill,
  mark,
  title,
  className = 'size-3.5',
}: {
  fill: string
  mark: string
  title?: string | undefined
  className?: string
}) {
  return (
    <svg viewBox="0 0 14 14" className={`shrink-0 ${className}`} role="img" aria-label={title}>
      {title && <title>{title}</title>}
      <circle cx="7" cy="7" r="7" fill={fill} />
      <path
        d={mark}
        stroke="#fff"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The explorer's identity badge, drawn the same way here so one judgement reads
 * the same in both. A filled disc carries the mark, which is what makes it
 * legible at the size an address line leaves for it.
 */
export function JudgementBadge({ verdict, title }: { verdict: Verdict; title?: string }) {
  const { fill, mark } = MARKS[verdict]

  return <MarkDisc fill={fill} mark={mark} title={title} />
}
