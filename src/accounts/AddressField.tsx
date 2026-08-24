import { useState, type ReactNode } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Command } from 'cmdk'
import { useBalances, useStanding, useSymbol } from '@/chain/queries'
import { labelOf } from '@/chain/identity'
import { resolveAddress, shorten } from '@/lib/address'
import { formatAmount } from '@/lib/balance'
import { Identicon } from '@/ui/Identicon'
import { ChevronIcon } from '@/ui/icons'
import { BOX } from '@/ui/Modal'
import { IdentityVerdict } from './IdentityVerdict'
import { useAccountsStore } from './store'

/**
 * Anything worth offering by name. Accounts are the usual case, but a proxy, a
 * registrar and an address MetaMask holds are each a name over an address too.
 */
export interface Pickable {
  address: string
  name: string
}

/**
 * As wide as whatever holds it, and no wider. A floor under the width made this
 * box the one thing in a dialog that would not fit, so it stuck out past the
 * fields above it and the dialog grew a sideways scrollbar to reach it. What is
 * in the box truncates on its own.
 */
const WIDE = 'w-full'

const ROW =
  'flex cursor-pointer items-center gap-3 rounded-[6px] px-3 py-2.5 text-[15px] select-none data-[selected=true]:bg-hover'

/**
 * What the chain says about the address, over the address itself. The name the
 * wallet gave an account is the wallet's own and says nothing about who holds
 * it, so the registrar's verdict comes with the identity rather than after it.
 * A display name on its own is only a claim, and picking the wrong address is
 * the mistake this list exists to prevent.
 */
function Chain({ address, shown }: { address: string; shown: string }) {
  const { data: standing } = useStanding(address)
  const named = standing ? labelOf(standing) : ''

  return (
    <span className="ml-auto pl-4 text-right">
      {named && standing && (
        <span className="flex items-center justify-end gap-1 text-[12.5px] font-semibold">
          <IdentityVerdict standing={standing} />
          <span className="max-w-[180px] truncate">{named}</span>
        </span>
      )}
      <span className="block font-mono text-[13px] text-dim">{shorten(shown)}</span>
    </span>
  )
}

/** The board's own filing, so a long list reads the way the accounts page does. */
function filed<T extends Pickable>(choices: readonly T[], groups: { name: string; accounts: string[] }[]) {
  // The group carries the order the board draws, so the walk is over the group
  // rather than over the choices. Filtering the choices instead files every
  // entry under the right heading in the order they happened to be collected
  const offered = new Map(choices.map((entry) => [entry.address, entry]))
  const known = groups
    .map((group) => ({
      name: group.name,
      items: group.accounts
        .map((address) => offered.get(address))
        .filter((entry): entry is T => entry !== undefined),
    }))
    .filter((section) => section.items.length > 0)

  const loose = choices.filter(
    (entry) => !groups.some((group) => group.accounts.includes(entry.address)),
  )

  return loose.length > 0 ? [...known, { name: '', items: loose }] : known
}

/**
 * Every account address in the wallet, in one box. A name over an address on
 * the left, what the chain says about it on the right, and everything worth
 * offering behind the arrow.
 *
 * The list, the search, the keyboard and the popover are cmdk's and Radix's.
 * What is left here is which accounts to offer and what to draw in the box.
 */
export function AddressField<T extends Pickable>({
  label,
  value,
  onChange,
  accounts,
  onPick,
  aside,
  className = WIDE,
  placeholder = 'nu… or 0x…',
  labelled = true,
  readOnly = false,
}: {
  label: string
  value: string
  onChange: (address: string) => void
  accounts: readonly T[]
  /** The whole entry rather than its address, for lists keyed by something else. */
  onPick?: (picked: T) => void
  /** The last word on the right, for whatever the chain says about it. */
  aside?: ReactNode
  className?: string
  placeholder?: string
  /** Off in a table, where the column heading has already said it once. */
  labelled?: boolean
  /** For the places only a listed entry will do, where the list is the answer. */
  readOnly?: boolean
}) {
  const symbol = useSymbol()
  const groups = useAccountsStore((state) => state.layout.groups)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')

  const resolved = resolveAddress(value)
  const known = accounts.find((entry) => entry.address === value || entry.address === resolved)
  // A list whose only entry is what is already there is not a choice
  const choices = accounts.filter((entry) => entry.address !== value)
  // Only what the box is pointed at, so nothing is read until it is a place
  const balances = useBalances(resolved ? [resolved] : [])
  const landing = resolved ? balances[resolved] : undefined
  const holds =
    landing &&
    `transferable ${formatAmount(landing.transferable, { precision: 4 })} ${symbol}`

  const take = (address: string) => {
    onChange(address)
    setTyped('')
    setOpen(false)
  }

  // Nothing to type and nothing to pick leaves nothing to open, so the box says
  // so rather than promising a choice it does not have
  const offers = !readOnly || choices.length > 0

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        type="button"
        aria-label={label}
        disabled={!offers}
        className={`flex items-center gap-3 py-2 pr-2 pl-3 text-left ${BOX} ${
          labelled ? 'mt-2.5 first:mt-0' : ''
        } ${className} data-[state=open]:border-accent`}
      >
        <Identicon address={resolved ?? ''} size={labelled ? 34 : 22} />

        <span className="min-w-0 flex-1">
          {labelled && (
            <span className="flex items-baseline gap-3 text-[11.5px] text-dim">
              {label}
              <span className="ml-auto truncate">{aside || holds}</span>
            </span>
          )}
          <span className="flex items-baseline gap-3">
            <span
              className={`min-w-0 flex-1 truncate text-[15px] ${
                known ? 'font-semibold' : 'font-mono'
              } ${value ? '' : 'text-hint'}`}
            >
              {known?.name || (resolved ? shorten(resolved) : value) || placeholder}
            </span>
            {/* Its own column whoever the address belongs to, so a table of
                these reads down the right as well as across */}
            {resolved && (
              <span className="shrink-0 font-mono text-[12.5px] text-dim">{shorten(resolved)}</span>
            )}
          </span>
        </span>

        {/* Kept in place rather than dropped, so a column of these lines up */}
        <ChevronIcon className={`size-4 shrink-0 text-dim ${offers ? '' : 'invisible'}`} />
      </Popover.Trigger>

      {/* Over the dialog layer, since a dialog overlay swallows whatever is under it */}
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="z-95 w-[var(--radix-popover-trigger-width)] rounded-[6px] border border-line bg-panel p-1.5 shadow-lift"
        >
          <Command
            // The list is names and addresses, and neither is worth fuzzy matching
            shouldFilter={!readOnly ? false : true}
            filter={(candidate, search) =>
              candidate.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }
          >
            {!readOnly && (
              <Command.Input
                value={typed}
                onValueChange={setTyped}
                placeholder={placeholder}
                className="w-full bg-transparent px-3 py-2 font-mono text-[15px] placeholder:text-hint focus:outline-none"
              />
            )}

            <Command.List className="max-h-[280px] overflow-y-auto">
              {!readOnly && typed !== '' && !resolveAddress(typed) && (
                <p className="px-3 py-2.5 text-[13.5px] text-bad">Not a Numen or EVM address</p>
              )}
              {!readOnly && resolveAddress(typed) && (
                <Command.Item value={typed} onSelect={() => take(typed)} className={ROW}>
                  <Identicon address={resolveAddress(typed)!} size={26} />
                  Use this address
                  <span className="ml-auto pl-4 font-mono text-[13px] text-dim">
                    {shorten(resolveAddress(typed)!)}
                  </span>
                </Command.Item>
              )}

              {filed(choices, groups).map((section) => (
                <Command.Group
                  key={section.name}
                  heading={section.name || undefined}
                  className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:tracking-[0.07em] [&_[cmdk-group-heading]]:text-dim [&_[cmdk-group-heading]]:uppercase"
                >
                  {section.items.map((entry) => (
                    <Command.Item
                      key={entry.address}
                      value={`${entry.name} ${entry.address}`}
                      onSelect={() => (onPick ? (onPick(entry), setOpen(false)) : take(entry.address))}
                      className={ROW}
                    >
                      {/* An EVM address has a face too, the one its Numen
                          account wears, which is the account being picked */}
                      <Identicon address={resolveAddress(entry.address) ?? ''} size={26} />
                      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                      <Chain address={resolveAddress(entry.address) ?? ''} shown={entry.address} />
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
