import { useId } from 'react'
import { useSymbol } from '@/chain/queries'
import { totalOf, type AccountBalance } from '@/chain/types'
import { cn } from '@/lib/cn'
import { formatAmount } from '@/lib/balance'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { CAPTION, FieldLegend, FieldSet, NOTE } from '@/components/ui/field'
import { Identicon } from '@/ui/Identicon'
import type { Voters } from '@/governance/Voter'
import { filed } from './AddressField'
import { useAccountsStore } from './store'
import { signsAlone, type Account } from './types'

/** The well a list of ticks sits in, clear of the head floated above it. */
export const TICK_BOX = 'clear-both rounded-lg border border-border bg-card'

/**
 * A tick list's legend, with what it adds up to and a way to tick or clear the
 * lot. The legend floats rather than sharing a row, since it only names the
 * fieldset while it is the fieldset's own child.
 */
export function TickHead({
  label,
  note,
  all,
  onAll,
}: {
  label: string
  note?: string
  /** Everything is ticked, so the button clears rather than ticks. */
  all: boolean
  /** Null where there is nothing to tick or clear. */
  onAll: (() => void) | null
}) {
  return (
    <>
      <FieldLegend className="float-left mr-3 whitespace-nowrap">{label}</FieldLegend>
      <div className="mb-1.5 flex items-baseline justify-end gap-3">
        <span className={cn('truncate whitespace-nowrap', NOTE)}>{note}</span>
        {onAll && (
          <Button type="button" variant="link" size="xs" className="h-auto shrink-0 p-0" onClick={onAll}>
            {all ? 'Clear all' : 'Select all'}
          </Button>
        )}
      </div>
    </>
  )
}

/**
 * Ticks all of them, or clears them once all are ticked. A multisig or a
 * proxied account brings a signatory of its own, so only accounts that sign for
 * themselves go together, and the pick never empties.
 */
function toggled(picked: Voters, entries: Account[]): Voters {
  const base: Account[] = picked.every(signsAlone) ? picked : []
  const joining = entries.filter(signsAlone)
  const next = joining.every((entry) => base.includes(entry))
    ? base.filter((entry) => !joining.includes(entry))
    : [...base, ...joining.filter((entry) => !base.includes(entry))]
  const [first, ...rest] = next
  return first ? [first, ...rest] : picked
}

function tickOf(picked: Account[], entries: Account[]) {
  const ticked = entries.filter((entry) => picked.includes(entry)).length
  if (ticked === 0) return false
  return ticked === entries.length ? true : 'indeterminate'
}

/**
 * Every account at once, filed under the board's groups, a group ticked whole
 * from its heading.
 */
export function AccountsList({
  label,
  value,
  onChange,
  accounts,
  balances,
}: {
  label: string
  value: Voters
  onChange: (picked: Voters) => void
  accounts: Voters
  balances: Record<string, AccountBalance>
}) {
  const symbol = useSymbol()
  const groups = useAccountsStore((state) => state.layout.groups)
  const id = useId()
  const held = value.reduce((sum, account) => {
    const balance = balances[account.address]
    return balance ? sum + totalOf(balance) : sum
  }, 0n)
  const alone = accounts.filter(signsAlone)
  const all = tickOf(value, alone) === true

  return (
    <FieldSet className="gap-0">
      <TickHead
        label={label}
        note={`${value.length}/${accounts.length} · ${formatAmount(held, { precision: 2 })} ${symbol}`}
        all={all}
        // A delegation needs an account, so clearing keeps the one picked first
        onAll={alone.length < 2 ? null : () => onChange(all ? [value[0]] : toggled(value, alone))}
      />

      <div className={cn(TICK_BOX, 'max-h-80 overflow-auto')}>
        <div className="grid grid-cols-4 gap-0.5 p-1 max-[560px]:grid-cols-2">
          {filed(accounts, groups).map((section) => (
            <div key={section.name} role="group" aria-label={section.name || undefined} className="contents">
              <GroupRow
                id={`${id}-${section.name}`}
                name={section.name}
                tick={tickOf(value, section.items.filter(signsAlone))}
                disabled={!section.items.some(signsAlone)}
                onToggle={() => onChange(toggled(value, section.items))}
              />
              {section.items.map((entry) => (
                <label
                  key={entry.address}
                  htmlFor={`${id}-${entry.address}`}
                  className={cn(
                    'flex h-8 min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 hover:bg-muted',
                    value.includes(entry) && 'bg-primary/5',
                  )}
                >
                  <Checkbox
                    id={`${id}-${entry.address}`}
                    checked={value.includes(entry)}
                    onCheckedChange={() =>
                      onChange(signsAlone(entry) ? toggled(value, [entry]) : [entry])
                    }
                  />
                  <Identicon address={entry.address} size={18} />
                  <span className="truncate text-[13.5px] font-medium">{entry.name}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>
    </FieldSet>
  )
}

/** Paler than an account's tick, so a heading never reads as one more account. */
function GroupRow({
  id,
  name,
  tick,
  disabled,
  onToggle,
}: {
  id: string
  name: string
  tick: boolean | 'indeterminate'
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <label
      htmlFor={id}
      className={cn('col-span-full flex h-7 items-center gap-1.5 px-1.5 pt-1', !disabled && 'cursor-pointer')}
    >
      <Checkbox
        id={id}
        checked={tick}
        disabled={disabled}
        onCheckedChange={onToggle}
        className="data-checked:border-primary/40 data-checked:bg-primary/15 data-checked:text-primary data-[state=indeterminate]:border-primary/40 data-[state=indeterminate]:bg-primary/15 data-[state=indeterminate]:text-primary dark:data-checked:bg-primary/25"
      />
      <span className={CAPTION}>{name}</span>
    </label>
  )
}
