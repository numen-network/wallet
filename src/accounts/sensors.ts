import { MouseSensor, TouchSensor } from '@dnd-kit/core'
import type { MouseEvent, TouchEvent } from 'react'

/**
 * Buttons and menus inside a card must stay clickable, so a press that starts
 * on one never becomes a drag.
 */
function startsOnControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-nodrag]') !== null
}

/** Mouse drags start after 5px of travel, so a click stays a click. */
export class CardMouseSensor extends MouseSensor {
  static override activators = [
    {
      eventName: 'onMouseDown' as const,
      handler: ({ nativeEvent }: MouseEvent) =>
        nativeEvent.button !== 2 && !startsOnControl(nativeEvent.target),
    },
  ]
}

/**
 * Touch drags start after a hold. Moving before the hold completes is the user
 * scrolling the page, which must win, so the drag is abandoned instead.
 */
export class CardTouchSensor extends TouchSensor {
  static override activators = [
    {
      eventName: 'onTouchStart' as const,
      handler: ({ nativeEvent }: TouchEvent) =>
        nativeEvent.touches.length === 1 && !startsOnControl(nativeEvent.target),
    },
  ]
}

export const MOUSE_ACTIVATION = { distance: 5 }
export const TOUCH_ACTIVATION = { delay: 280, tolerance: 12 }
