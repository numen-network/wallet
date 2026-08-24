import type { Reach } from './types'

export type Quality = 'good' | 'fair' | 'poor'

/**
 * What a round trip has to beat. A wallet reads and writes one call at a time,
 * so anything under a tenth of a second is as good as instant, and past three
 * of them a click starts feeling like it missed.
 */
const GOOD_MS = 100
const FAIR_MS = 300

/**
 * How well the link is holding up. Peer count is left out on purpose, since a
 * node mining a chain of its own has none and serves every read perfectly.
 */
export function quality(reach: Reach): Quality {
  // Behind the chain outranks any round trip. The answers arrive fast and stale
  if (reach.syncing) return 'poor'
  if (reach.ms <= GOOD_MS) return 'good'
  return reach.ms <= FAIR_MS ? 'fair' : 'poor'
}
