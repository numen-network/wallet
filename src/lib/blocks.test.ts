import { describe, expect, it } from 'vitest'
import { waitFor } from './blocks'

/** Block time the cases below are written against. */
const BLOCK_SECONDS = 10

describe('how long a block count is', () => {
  it('reads in hours up to a day and in days past one', () => {
    expect(waitFor(360, BLOCK_SECONDS)).toBe('about 1 hour')
    expect(waitFor(361, BLOCK_SECONDS)).toBe('about 2 hours')
    expect(waitFor(8_640, BLOCK_SECONDS)).toBe('about 1 day')
    expect(waitFor(120_960, BLOCK_SECONDS)).toBe('about 14 days')
  })

  it('never counts a block that has already gone by', () => {
    expect(waitFor(0, BLOCK_SECONDS)).toBe('a moment')
    expect(waitFor(-5, BLOCK_SECONDS)).toBe('a moment')
  })
})
