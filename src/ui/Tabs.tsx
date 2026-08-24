export interface TabOption<T extends string> {
  id: T
  label: string
  /** Left out when there is nothing to count, so an empty tab reads as a plain word. */
  count?: number
}

/** A pill switch for a handful of exclusive choices, where a select would hide them. */
export function Tabs<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T
  options: readonly TabOption<T>[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={`flex gap-1 rounded-full border border-line bg-recess p-[3px] ${className}`}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-current={value === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-full px-3 py-[3px] text-[12px] font-semibold transition-colors ${
            value === option.id ? 'bg-panel text-ink shadow-card' : 'text-lead hover:text-ink'
          }`}
        >
          {option.label}
          {option.count ? <span className="pl-1.5 opacity-55">{option.count}</span> : null}
        </button>
      ))}
    </div>
  )
}
