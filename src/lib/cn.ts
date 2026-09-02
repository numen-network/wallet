import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The wallet names its own shadows, and a name outside the built-in scale reads
 * as a shadow colour rather than a shadow. Listing them puts card, hover and
 * lift in the same group as lg and xs, so one replaces the other.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      shadow: [{ shadow: ['card', 'hover', 'lift'] }],
    },
  },
})

/**
 * Later class wins, whatever order the stylesheet happened to land in. Two
 * utilities on the same property otherwise let the build decide, and a caller
 * asking for a smaller button quietly gets a normal one.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
