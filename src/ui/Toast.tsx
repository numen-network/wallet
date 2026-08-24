import { Toaster, toast as sonner } from 'sonner'
import { SyncIcon } from './icons'

/**
 * Sonner does the stacking, the timers, the swipe and the live region. What is
 * left here is the wallet's own policy, which is how long a message is worth
 * and what it looks like.
 */

/** Something went through. Long enough to catch, short enough to ignore. */
export function toast(text: string): void {
  sonner(text)
}

/** Something went wrong, so it stays long enough to read twice. */
export function toastProblem(text: string): void {
  sonner.error(text, { duration: 8_000 })
}

/**
 * A call on its way, named so that two of them in the air stay apart. It sits
 * in the far corner from the outcomes, holds until something replaces the
 * stage, and only leaves when told. Calling this again under the same key
 * moves the same notice along rather than piling up a second one.
 */
export function toastWorking(key: string, what: string, stage: string): void {
  sonner.loading(what, {
    id: key,
    description: stage,
    position: 'top-right',
    duration: Infinity,
  })
}

/** The call is over, whichever way it went. */
export function toastSettled(key: string): void {
  sonner.dismiss(key)
}

/**
 * Shape only. Colour belongs to the kinds below, since two utilities setting
 * the same property would leave the stylesheet order to pick a winner.
 *
 * Sonner lays each toast out absolutely against a list of its own width, so a
 * message narrower than the list would sit against its left edge. Margins
 * centre it between both edges without touching the transform the animation
 * rides on. Anything a kind wants wider than this asks for a minimum, since a
 * second width would only race this one.
 */
const TOAST =
  'flex w-fit inset-x-0 mx-auto items-center gap-2 rounded-[4px] px-4 py-2.5 text-[13.5px] font-semibold shadow-lift'

export function ToastHost() {
  return (
    <Toaster
      position="bottom-center"
      duration={2_200}
      // Every notice stays readable. Stacked into a pile they only come apart
      // on hover, which hides whatever landed while somebody was reading
      expand
      // Clear of the header, which is where a working notice would otherwise
      // land on top of the tabs
      offset={{ top: 60 }}
      icons={{ loading: <SyncIcon className="mt-[3px] size-3.5 animate-spin text-accent" /> }}
      // Its own styles are dropped rather than overridden, so nothing depends
      // on which stylesheet the browser happened to read last
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: TOAST,
          // Sonner's own box for the icon goes with its styles, and its loader
          // is positioned against whatever is nearest, so the slot has to be
          // both a box and that anchor
          icon: 'relative flex size-3.5 shrink-0 items-center justify-center',
          // What the call is stays put in bold, what it is doing changes under
          // it, so the notice does not rewrite itself on every stage
          description: 'text-[11.5px] font-medium text-lead',
          default: 'bg-ink text-ground',
          error: 'bg-bad text-bad-ink',
          // Still going, so it reads as part of the page rather than a verdict.
          // A width of its own keeps the box still while the words underneath
          // it change length
          loading:
            'min-w-[188px] items-start gap-2.5 rounded-[6px] border border-line bg-panel text-ink',
        },
      }}
    />
  )
}
