import { Fragment, type ReactNode } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { DotsIcon } from './icons'

export interface MenuItem {
  label: string
  icon: ReactNode
  onSelect: () => void
  danger?: boolean
  /** Pushed to the far side, for the address a name belongs to and the like. */
  aside?: ReactNode
}

/**
 * A heading and the items it covers. Sections carry their own dividers, so a
 * caller lists what belongs together rather than placing the lines by hand. The
 * last section usually goes unlabelled, which is where anything destructive sits.
 */
export interface MenuSection {
  label?: string
  items: MenuItem[]
}

const ITEM = 'cursor-pointer gap-2 rounded-lg px-2.5 py-[7px] text-[13.5px]'

export function Menu({
  label,
  sections,
  trigger,
  className = 'min-w-[210px]',
}: {
  label: string
  sections: MenuSection[]
  /** What opens it, for the places a row of dots is the wrong shape. */
  trigger?: ReactNode
  /** For a menu that has to line up with something wider than its trigger. */
  className?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="ghost" size="icon" data-nodrag aria-label={label}>
            <DotsIcon />
          </Button>
        )}
      </DropdownMenuTrigger>

      {/*
        data-nodrag matters here even though the menu is portalled out of the
        card. React sends events up the component tree rather than the DOM
        tree, so a press in here still reaches whatever the card listens with,
        and dragging to read an item would pick the card up instead.
      */}
      <DropdownMenuContent
        data-nodrag
        align="end"
        sideOffset={6}
        collisionPadding={8}
        className={cn('p-1.5', className)}
      >
        {sections.map((section, index) => (
          <Fragment key={section.label ?? index}>
            {index > 0 && <DropdownMenuSeparator className="mx-1 my-1.5" />}
            <DropdownMenuGroup>
              {section.label && (
                <DropdownMenuLabel className="px-2.5 py-1 text-[10.5px] font-bold tracking-[0.07em] text-dim uppercase">
                  {section.label}
                </DropdownMenuLabel>
              )}
              {section.items.map((item) => (
                <DropdownMenuItem
                  key={item.label}
                  onSelect={item.onSelect}
                  variant={item.danger ? 'destructive' : 'default'}
                  className={ITEM}
                >
                  <span className={item.danger ? '' : 'text-muted-foreground'}>{item.icon}</span>
                  {item.label}
                  {item.aside && (
                    <span className="ml-auto pl-4 font-mono text-[11.5px] text-dim">
                      {item.aside}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
