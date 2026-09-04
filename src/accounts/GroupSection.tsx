import { useSortable } from '@dnd-kit/sortable'
import { SortableContext, type SortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSymbol } from '@/chain/queries'
import type { AccountBalance } from '@/chain/types'
import { totalOf } from '@/chain/types'
import { formatAmount } from '@/lib/balance'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CAPTION } from '@/components/ui/field'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Empty } from '@/components/ui/empty'
import { ChevronDown, Pencil, Trash2 } from 'lucide-react'
import { Menu, type MenuSection } from '@/ui/Menu'
import { AccountCard, type CardAction } from './AccountCard'
import { isSystemGroup, type Group } from './layout'
import type { Account } from './types'
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
  open: (action: CardAction, account: Account) => void
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
  open,
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
    { items: [{ label: 'Rename group', icon: <Pencil />, onSelect: () => onRename(group) }] },
  ]
  if (!system) {
    menu.push({
      items: [
        {
          label: 'Delete group',
          icon: <Trash2 />,
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
    <Collapsible asChild open={!group.collapsed} onOpenChange={() => onToggle(group)}>
      <section
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        className={cn('mt-4', isDragging && 'opacity-45')}
      >
        {!alone && (
          <Card
            asChild
            className="flex-row items-center gap-2 px-2.5 py-2.5 shadow-none select-none touch-pan-y cursor-grab"
          >
            <header ref={setActivatorNodeRef} {...listeners}>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  data-nodrag
                  aria-label={group.collapsed ? 'Expand group' : 'Collapse group'}
                >
                  <ChevronDown
                    className={cn('size-4 transition-transform', group.collapsed && '-rotate-90')}
                    strokeWidth={2.4}
                  />
                </Button>
              </CollapsibleTrigger>

              <h2 className={cn(CAPTION, 'text-[12.5px] text-foreground', dropTarget && 'text-primary')}>
                {group.name}
              </h2>

              <span className="flex-1" />

              <span className="text-[12.5px]">
                {formatAmount(sum, { precision: 2 })} {symbol}
              </span>

              <Menu label="Group menu" sections={menu} />
            </header>
          </Card>
        )}

        <CollapsibleContent>
          <SortableContext items={accounts.map((account) => account.address)} strategy={settled}>
            <div
              className={cn(
                'mt-0.5 grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-0.5 rounded-lg',
                dropTarget && 'outline-[1.5px] outline-dashed outline-primary outline-offset-2',
              )}
            >
              {accounts.map((account) => (
                <AccountCard
                  key={account.address}
                  account={account}
                  balance={balances[account.address]}
                  open={open}
                />
              ))}

              {accounts.length === 0 && (
                <Empty
                  className={cn(
                    'col-span-full mt-0 p-6 text-[13px]',
                    dropTarget ? 'border-primary text-primary' : 'text-dim',
                  )}
                >
                  {system ? 'New accounts land here' : 'Drop accounts here'}
                </Empty>
              )}
            </div>
          </SortableContext>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}
