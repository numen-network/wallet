import { describe, expect, it } from 'vitest'
import type { Bounty } from '@/chain/bounties'
import { UNIT } from '@/chain/config'
import { readBounty, type BountyDraft } from './MotionFields'

const CURATOR = 'nu3oNksEGXV3Tsr4sBeRUpcfA5zYp4VvZ7t9uKVPMAe2UCo98'

const bounty = (index: number, state: Bounty['state']): Bounty => ({
  index,
  description: '',
  proposer: CURATOR,
  value: 1_000n * UNIT,
  fee: 0n,
  bond: 0n,
  curatorDeposit: 0n,
  state,
  curator: null,
  beneficiary: null,
  until: null,
})

const BOUNTIES = [bounty(0, 'proposed'), bounty(1, 'funded'), bounty(2, 'active')]

const read = (draft: Partial<BountyDraft>) =>
  readBounty({ bounty: 0, curator: '', fee: '', ...draft }, BOUNTIES)

describe('the call a bounty referendum runs', () => {
  it('funds a proposed bounty and leaves its curator for later', () => {
    expect(read({}).motion).toEqual({ kind: 'approveBounty', bounty: 0 })
  })

  it('funds a proposed bounty and names its curator in one go', () => {
    expect(read({ curator: CURATOR, fee: '100' }).motion).toEqual({
      kind: 'approveBountyWithCurator',
      bounty: 0,
      curator: CURATOR,
      fee: 100n * UNIT,
    })
  })

  it('names the curator of a funded bounty, even at a zero fee', () => {
    expect(read({ bounty: 1, curator: CURATOR, fee: '0' }).motion).toEqual({
      kind: 'proposeCurator',
      bounty: 1,
      curator: CURATOR,
      fee: 0n,
    })
  })

  it('wants a curator for a funded bounty', () => {
    expect(read({ bounty: 1 }).problem).toBe('Give it the account that would curate it')
  })

  it('wants the curator and fee together or not at all', () => {
    expect(read({ fee: '100' }).problem).toBe('Give it the account that would curate it')
    expect(read({ curator: CURATOR }).problem).toBe('Enter an amount')
  })

  it('turns away a fee as big as the bounty itself', () => {
    expect(read({ curator: CURATOR, fee: '1000' }).problem).toBe(
      'The curator fee has to be less than what the bounty pays',
    )
  })

  it('asks for a bounty governance can still act on', () => {
    expect(read({ bounty: 2, curator: CURATOR, fee: '1' }).problem).toBe('Pick the bounty')
    expect(read({ bounty: null }).problem).toBe('Pick the bounty')
  })
})
