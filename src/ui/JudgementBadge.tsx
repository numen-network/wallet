/**
 * The explorer's identity badge, drawn the same way here so one judgement reads
 * the same in both. A filled disc carries the mark, which is what makes it
 * legible at the size an address line leaves for it.
 */
export type Verdict = 'verified' | 'stale' | 'pending' | 'unjudged' | 'bad'

const QUESTION = 'M5.4 5.4c0-1 .7-1.7 1.6-1.7s1.6.7 1.6 1.65c0 1.3-1.6 1.35-1.6 2.65M7 10.3v.2'

const MARKS: Record<Verdict, { fill: string; mark: string }> = {
  verified: { fill: 'var(--color-good)', mark: 'M4 7.2 6.1 9.3 10 5.2' },
  unjudged: { fill: 'var(--color-dim)', mark: QUESTION },
  pending: { fill: 'var(--color-dim)', mark: QUESTION },
  stale: { fill: 'var(--color-warn)', mark: 'M7 3.6v4.2M7 10.2v.2' },
  bad: { fill: 'var(--color-bad)', mark: 'M4.6 4.6l4.8 4.8M9.4 4.6l-4.8 4.8' },
}

export function JudgementBadge({ verdict, title }: { verdict: Verdict; title?: string }) {
  const { fill, mark } = MARKS[verdict]

  return (
    <svg viewBox="0 0 14 14" className="size-3.5 shrink-0" role="img" aria-label={title}>
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
