import { CONTROL } from './shell'

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
    <div
      className={`flex ${CONTROL} items-stretch gap-1 rounded-full border border-border bg-muted p-[3px] ${className}`}
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-current={value === option.id}
          onClick={() => onChange(option.id)}
          className={`flex items-center rounded-full px-3 text-[12px] font-semibold transition-colors ${
            value === option.id ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {option.label}
          {option.count ? <span className="pl-1.5 opacity-55">{option.count}</span> : null}
        </button>
      ))}
    </div>
  )
}
