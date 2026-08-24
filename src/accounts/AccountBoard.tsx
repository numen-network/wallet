import { useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { AccountBalance } from '@/chain/types'
import { AccountCardGhost, type CardActions } from './AccountCard'
import {
  GroupSection,
  groupIdFrom,
  groupSortableId,
  isGroupSortableId,
} from './GroupSection'
import { groupOf, type Group } from './layout'
import { CardMouseSensor, CardTouchSensor, MOUSE_ACTIVATION, TOUCH_ACTIVATION } from './sensors'
import { useAccountsStore } from './store'
import type { Account } from './types'
import type { GroupView } from './useAccounts'

interface BoardProps {
  groups: GroupView[]
  byAddress: Map<string, Account>
  balances: Record<string, AccountBalance>
  actions: CardActions
  onRenameGroup: (group: Group) => void
  onDeleteGroup: (group: Group) => void
}

/**
 * A card looks for the card under the pointer first and falls back to the
 * group, which is what lets an empty or collapsed group take a drop. A group
 * only ever measures itself against other groups.
 */
const collision: CollisionDetection = (args) => {
  if (args.active.data.current?.type === 'group') {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => isGroupSortableId(String(c.id))),
    })
  }

  const hits = pointerWithin(args)
  const candidates = hits.length ? hits : rectIntersection(args)
  const card = candidates.find((hit) => !isGroupSortableId(String(hit.id)))
  return card ? [card] : candidates.filter((hit) => isGroupSortableId(String(hit.id)))
}

export function AccountBoard({
  groups,
  byAddress,
  balances,
  actions,
  onRenameGroup,
  onDeleteGroup,
}: BoardProps) {
  const [dragging, setDragging] = useState<Account | null>(null)
  const [dropGroupId, setDropGroupId] = useState<string | null>(null)
  /**
   * Where the board last said the card would land. The drop reads this rather
   * than asking dnd-kit again, so a card always ends up under the highlight the
   * user was looking at.
   */
  const landed = useRef<{ groupId: string; index: number } | null>(null)
  const beginDrag = useAccountsStore((s) => s.beginDrag)
  const endDrag = useAccountsStore((s) => s.endDrag)
  const cancelDrag = useAccountsStore((s) => s.cancelDrag)
  const moveAccount = useAccountsStore((s) => s.moveAccount)
  const moveGroup = useAccountsStore((s) => s.moveGroup)
  const toggleCollapse = useAccountsStore((s) => s.toggleCollapse)

  const sensors = useSensors(
    useSensor(CardMouseSensor, { activationConstraint: MOUSE_ACTIVATION }),
    useSensor(CardTouchSensor, { activationConstraint: TOUCH_ACTIVATION }),
  )

  /** Where the dragged card belongs given whatever it currently hovers. */
  const landingFor = (address: string, overId: string) => {
    const layout = useAccountsStore.getState().layout

    if (isGroupSortableId(overId)) {
      const group = layout.groups.find((g) => g.id === groupIdFrom(overId))
      if (!group) return null

      // The gutter between two cards belongs to the group rather than to either
      // card. Reading it as the end of the group would throw the card down there
      // and back every time the pointer crossed two pixels of gap.
      const settled = group.accounts.indexOf(address)
      return { groupId: group.id, index: settled === -1 ? group.accounts.length : settled }
    }

    const group = groupOf(layout, overId)
    return group ? { groupId: group.id, index: group.accounts.indexOf(overId) } : null
  }

  const finish = () => {
    setDragging(null)
    setDropGroupId(null)
    landed.current = null
    document.body.classList.remove('dragging')
  }

  const onDragStart = ({ active }: DragStartEvent) => {
    beginDrag()
    document.body.classList.add('dragging')
    if (active.data.current?.type === 'card') {
      setDragging(byAddress.get(String(active.id)) ?? null)
    }
  }

  /**
   * Driven by every pointer move rather than by dnd-kit deciding the target
   * changed. It stops reporting a change once the dragged card is remounted
   * under a new parent, which is what moving it between groups does, so a drag
   * that had crossed one group could never be told about the next.
   */
  const onDragMove = ({ active, over }: DragMoveEvent) => {
    if (!over || active.data.current?.type !== 'card') return

    const landing = landingFor(String(active.id), String(over.id))
    if (!landing) return

    setDropGroupId(landing.groupId)
    landed.current = landing

    // A collapsed group draws none of its cards, so moving the card in now
    // would unmount the node being dragged, and dnd-kit reports no further
    // target once that happens. The highlight goes there, the card waits.
    const target = useAccountsStore.getState().layout.groups.find((g) => g.id === landing.groupId)
    if (target?.collapsed) return

    moveAccount(String(active.id), landing.groupId, landing.index)
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.data.current?.type === 'group') {
      dropGroup(String(active.id), String(over.id))
    } else if (active.data.current?.type === 'card' && landed.current) {
      const { groupId, index } = landed.current
      moveAccount(String(active.id), groupId, index)
    }
    endDrag()
    finish()
  }

  const dropGroup = (activeId: string, overId: string) => {
    const order = useAccountsStore.getState().layout.groups.map((g) => g.id)
    moveGroup(groupIdFrom(activeId), order.indexOf(groupIdFrom(overId)))
  }

  const onDragCancel = () => {
    cancelDrag()
    finish()
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      // A card leaving a group resizes it and shifts every group below, so a
      // rect measured when the drag began describes somewhere the group no
      // longer is
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <SortableContext
        items={groups.map((view) => groupSortableId(view.group.id))}
        strategy={verticalListSortingStrategy}
      >
        {groups.map((view) => (
          <GroupSection
            key={view.group.id}
            view={view}
            balances={balances}
            actions={actions}
            dropTarget={dragging !== null && dropGroupId === view.group.id}
            alone={groups.length === 1}
            onToggle={(group) => toggleCollapse(group.id)}
            onRename={onRenameGroup}
            onDelete={onDeleteGroup}
          />
        ))}
      </SortableContext>

      <DragOverlay>
        {dragging && (
          <AccountCardGhost
            account={dragging}
            balance={balances[dragging.address]}
            {...actions}
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}
