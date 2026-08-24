import type { ReactNode } from 'react'

/** What a page says where a list would be, when the list has nothing in it. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 rounded-[6px] border-[1.5px] border-dashed border-line-strong p-12 text-center text-sm text-lead">
      {children}
    </div>
  )
}
