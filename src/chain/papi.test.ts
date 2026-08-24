import { describe, expect, it } from 'vitest'
import { toState } from './papi'

/**
 * The mock stores a state outright, so this is the only cover the derivation
 * gets short of a running node.
 */
const status = (over: {
  deciding?: { since: number; confirming?: number }
  in_queue?: boolean
}) => ({
  track: 0,
  proposal: { type: 'Inline', value: new Uint8Array() },
  submitted: 100,
  tally: { ayes: 0n, nays: 0n, support: 0n },
  in_queue: false,
  ...over,
})

describe('where an Ongoing referendum has got to', () => {
  it('has decided nothing until deciding is set', () => {
    expect(toState(status({}))).toBe('preparing')
  })

  it('is queued rather than preparing once a full track holds it back', () => {
    expect(toState(status({ in_queue: true }))).toBe('queued')
  })

  it('is deciding from the block deciding names', () => {
    expect(toState(status({ deciding: { since: 400 } }))).toBe('deciding')
    // in_queue outlives the wait, and deciding wins over it either way
    expect(toState(status({ deciding: { since: 400 }, in_queue: true }))).toBe('deciding')
  })

  it('is confirming once that block is set, block zero included', () => {
    expect(toState(status({ deciding: { since: 400, confirming: 900 } }))).toBe('confirming')
    expect(toState(status({ deciding: { since: 0, confirming: 0 } }))).toBe('confirming')
  })
})
