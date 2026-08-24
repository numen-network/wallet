import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Fragment, type ReactNode } from 'react'
import { IconButton } from './Button'
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

const ITEM =
  'flex cursor-pointer items-center gap-2 rounded-[6px] px-2.5 py-[7px] text-[13.5px] outline-none select-none data-highlighted:bg-hover'

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
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {trigger ?? (
          <IconButton type="button" data-nodrag aria-label={label}>
            <DotsIcon />
          </IconButton>
        )}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        {/*
          A card with everything switched on runs past the bottom of a short
          window, and an item nobody can reach is an item that is not there.

          Over the dialog layer rather than under it. A menu opened inside a
          dialog sits beneath its overlay otherwise, which swallows every click.

          data-nodrag matters here even though the menu is portalled out of the
          card. React sends events up the component tree rather than the DOM
          tree, so a press in here still reaches whatever the card listens with,
          and dragging to read an item would pick the card up instead.
        */}
        <DropdownMenu.Content
          data-nodrag
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className={`z-95 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto rounded-[6px] border border-line bg-panel p-1.5 shadow-lift ${className}`}
        >
          {sections.map((section, index) => (
            <Fragment key={section.label ?? index}>
              {index > 0 && (
                <DropdownMenu.Separator className="mx-1 my-1.5 border-t border-line" />
              )}
              <DropdownMenu.Group>
                {section.label && (
                  <DropdownMenu.Label className="px-2.5 py-1 text-[10.5px] font-bold tracking-[0.07em] text-dim uppercase">
                    {section.label}
                  </DropdownMenu.Label>
                )}
                {section.items.map((item) => (
                  <DropdownMenu.Item
                    key={item.label}
                    onSelect={item.onSelect}
                    className={`${ITEM} ${item.danger ? 'text-bad' : ''}`}
                  >
                    <span className={item.danger ? '' : 'text-lead'}>{item.icon}</span>
                    {item.label}
                    {item.aside && (
                      <span className="ml-auto pl-4 font-mono text-[11.5px] text-dim">
                        {item.aside}
                      </span>
                    )}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Group>
            </Fragment>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
