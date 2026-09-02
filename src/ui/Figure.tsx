/** One number worth reading on its own, with the words that say what it is. */
export function Figure({ label, value, lit = false }: { label: string; value: string; lit?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-muted px-2.5 py-2">
      <div className="text-[11.5px] text-dim">{label}</div>
      <div className={`mt-0.5 font-mono text-[15px] font-semibold ${lit ? 'text-primary' : ''}`}>
        {value}
      </div>
    </div>
  )
}
