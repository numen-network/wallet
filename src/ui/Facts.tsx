import { Fragment, type ReactNode } from 'react'

export interface Fact {
  name: string
  value: ReactNode
  /** What went wrong rather than what was asked for, which is worth the colour. */
  bad?: boolean
}

/**
 * Named values, a row apiece. A call written out argument by argument is one,
 * and so is anything else the wallet would otherwise squeeze into a sentence
 * and leave the reader to pick apart. Nothing goes in here without its name,
 * since a bare hex string on its own says nothing about what it is.
 */
export function Facts({ rows }: { rows: Fact[] }) {
  if (rows.length === 0) return null

  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px]">
      {rows.map((row, index) => (
        // Indexed, since two rows may share a name and neither is the odd one
        <Fragment key={index}>
          <dt className={row.bad ? 'text-bad' : 'text-dim'}>{row.name}</dt>
          <dd className={`font-mono break-all ${row.bad ? 'text-bad' : 'text-lead'}`}>
            {row.value}
          </dd>
        </Fragment>
      ))}
    </dl>
  )
}
