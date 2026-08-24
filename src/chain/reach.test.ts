import { describe, expect, it } from 'vitest'
import { quality } from './reach'
import type { Reach } from './types'

const answering = (over: Partial<Reach> = {}): Reach => ({
  ms: 20,
  peers: 3,
  syncing: false,
  ...over,
})

describe('what the link is worth', () => {
  it('grades a round trip', () => {
    expect(quality(answering({ ms: 20 }))).toBe('good')
    expect(quality(answering({ ms: 100 }))).toBe('good')
    expect(quality(answering({ ms: 101 }))).toBe('fair')
    expect(quality(answering({ ms: 300 }))).toBe('fair')
    expect(quality(answering({ ms: 301 }))).toBe('poor')
  })

  it('calls a node that is catching up poor however fast it answers', () => {
    expect(quality(answering({ ms: 5, syncing: true }))).toBe('poor')
  })

  it('holds nothing against a node mining a chain of its own', () => {
    expect(quality(answering({ peers: 0 }))).toBe('good')
  })
})
