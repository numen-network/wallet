import { describe, expect, it } from 'vitest'
import { readLink } from './link'

const GENESIS = `0x${'11'.repeat(32)}`
const DELEGATE = 'nu3oNksEGXV3Tsr4sBeRUpcfA5zYp4VvZ7t9uKVPMAe2UCo98'

describe('a link into the wallet', () => {
  it('reads a delegation and the chain it was made on', () => {
    expect(readLink(`?delegate=${DELEGATE}&genesis=${GENESIS}`)).toEqual({
      target: { kind: 'delegate', to: DELEGATE },
      genesis: GENESIS,
    })
  })

  it('reads a vote and the chain it was made on', () => {
    expect(readLink(`?vote=2&genesis=${GENESIS}`)).toEqual({
      target: { kind: 'vote', poll: 2 },
      genesis: GENESIS,
    })
  })

  it('reads a link that names no chain as one with no hash', () => {
    expect(readLink(`?delegate=${DELEGATE}`)).toEqual({
      target: { kind: 'delegate', to: DELEGATE },
      genesis: null,
    })
  })

  it('reads nothing from a vote on an index that is not a whole number', () => {
    expect(readLink(`?vote=two&genesis=${GENESIS}`)).toBeNull()
    expect(readLink(`?vote=&genesis=${GENESIS}`)).toBeNull()
    expect(readLink(`?vote=-1&genesis=${GENESIS}`)).toBeNull()
  })

  it('reads nothing from an address bar with no link on it', () => {
    expect(readLink('')).toBeNull()
    expect(readLink(`?genesis=${GENESIS}`)).toBeNull()
  })
})
