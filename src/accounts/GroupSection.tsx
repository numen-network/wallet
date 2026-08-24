import { useSortable } from '@dnd-kit/sortable'
import { SortableContext, type SortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSymbol } from '@/chain/queries'
import type { AccountBalance } from '@/chain/types'
import { totalOf } from '@/chain/types'
import { formatAmount } from '@/lib/balance'
import { IconButton } from '@/ui/Button'
import { ChevronIcon, PencilIcon, TrashIcon } from '@/ui/icons'
import { Menu, type MenuSection } from '@/ui/Menu'
import { AccountCard, type CardActions } from './AccountCard'
import { isSystemGroup, type Group } from './layout'
import type { GroupView } from './useAccounts'

/**
 * Cards get no transform. The board moves them for real as the pointer travels,
 * so a strategy sliding them about as well would be two mechanisms drawing the
 * same reorder, and they disagree for as long as the slide takes.
 */
const settled: SortingStrategy = () => null

/** Sortable ids have to be unique across the whole board, groups take a prefix. */
export const groupSortableId = (id: string) => `group:${id}`
export const isGroupSortableId = (id: string) => id.startsWith('group:')
export const groupIdFrom = (sortableId: string) => sortableId.slice('group:'.length)

interface GroupSectionProps {
  view: GroupView
  balances: Record<string, AccountBalance>
  actions: CardActions
  dropTarget: boolean
  /** The only group on the board names nothing the header above it does not. */
  alone: boolean
  onToggle: (group: Group) => void
  onRename: (group: Group) => void
  onDelete: (group: Group) => void
}

export function GroupSection({
  view,
  balances,
  actions,
  dropTarget,
  alone,
  onToggle,
  onRename,
  onDelete,
}: GroupSectionProps) {
  const { group, accounts } = view
  const symbol = useSymbol()

  const { listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id: groupSortableId(group.id),
      data: { type: 'group', groupId: group.id },
    })

  const system = isSystemGroup(group)
  const menu: MenuSection[] = [
    { items: [{ label: 'Rename group', icon: <PencilIcon />, onSelect: () => onRename(group) }] },
  ]
  if (!system) {
    menu.push({
      items: [
        {
          label: 'Delete group',
          icon: <TrashIcon />,
          danger: true,
          onSelect: () => onDelete(group),
        },
      ],
    })
  }

  const sum = accounts.reduce((total, account) => {
    const balance = balances[account.address]
    return balance ? total + totalOf(balance) : total
  }, 0n)

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`mt-4 ${isDragging ? 'opacity-45' : ''}`}
    >
      {!alone && (
        <header
          ref={setActivatorNodeRef}
          {...listeners}
          className="flex touch-pan-y cursor-grab items-center gap-2 rounded-[6px] border border-line bg-panel px-2.5 py-2.5 select-none"
        >
          <IconButton
            type="button"
            data-nodrag
            aria-label={group.collapsed ? 'Expand group' : 'Collapse group'}
            aria-expanded={!group.collapsed}
            onClick={() => onToggle(group)}
          >
            <ChevronIcon
              className={`size-4 transition-transform ${group.collapsed ? '-rotate-90' : ''}`}
            />
          </IconButton>

          <h2
            className={`text-[12.5px] font-bold tracking-[0.08em] uppercase ${
              dropTarget ? 'text-accent' : ''
            }`}
          >
            {group.name}
          </h2>

          <span className="flex-1" />

          <span className="text-[12.5px]">
            {formatAmount(sum, { precision: 2 })} {symbol}
          </span>

          <Menu label="Group menu" sections={menu} />
        </header>
      )}

      {!group.collapsed && (
        <SortableContext items={accounts.map((account) => account.address)} strategy={settled}>
          <div
            className={`mt-0.5 grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-0.5 rounded-[6px] ${
              dropTarget ? 'outline-[1.5px] outline-dashed outline-accent outline-offset-2' : ''
            }`}
          >
            {accounts.map((account) => (
              <AccountCard
                key={account.address}
                account={account}
                balance={balances[account.address]}
                {...actions}
              />
            ))}

            {accounts.length === 0 && (
              <p
                className={`col-span-full rounded-[6px] border-[1.5px] border-dashed p-6 text-center text-[13px] ${
                  dropTarget ? 'border-accent text-accent' : 'border-line-strong text-dim'
                }`}
              >
                {system ? 'New accounts land here' : 'Drop accounts here'}
              </p>
            )}
          </div>
        </SortableContext>
      )}
    </section>
  )
}
