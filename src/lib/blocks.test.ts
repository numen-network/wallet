import { describe, expect, it } from 'vitest'
import { waitFor, waitToTheMinute } from './blocks'

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

describe('how long a wait of a session or two is', () => {
  it('reads in minutes under an hour', () => {
    expect(waitToTheMinute(1, BLOCK_SECONDS)).toBe('about 1 minute')
    expect(waitToTheMinute(60, BLOCK_SECONDS)).toBe('about 10 minutes')
    expect(waitToTheMinute(354, BLOCK_SECONDS)).toBe('about 59 minutes')
  })

  it('reads the way a longer wait does from the hour up', () => {
    expect(waitToTheMinute(355, BLOCK_SECONDS)).toBe('about 1 hour')
    expect(waitToTheMinute(1_555_200, BLOCK_SECONDS)).toBe('about 180 days')
    expect(waitToTheMinute(0, BLOCK_SECONDS)).toBe('a moment')
  })
})
