import { describe, expect, it } from 'vitest'
import { UNIT } from '@/chain/config'
import type { Delegation } from '@/chain/types'
import { planOf } from './DelegateModal'

const TO = 'nu3oNksEGXV3Tsr4sBeRUpcfA5zYp4VvZ7t9uKVPMAe2UCo98'
const ELSE = 'nu2uaQWzSyDzXHrgd78sQL2871qL2LpPU6kHeeb4ETtXfnASg'
const terms = { conviction: 'Locked1x' as const }
const wanted = (track: number): Delegation => ({ track, to: TO, conviction: 'Locked1x', amount: UNIT })

describe('planOf', () => {
  it('delegates on a track with nothing on it', () => {
    expect(planOf([0], terms, TO, UNIT, [])).toEqual([[{ kind: 'delegate', delegation: wanted(0) }]])
  })

  it('leaves a track alone that already delegates the same way', () => {
    const has = [{ track: 0, kind: 'delegating' as const, delegation: wanted(0) }]
    expect(planOf([0], terms, TO, UNIT, has)).toEqual([])
  })

  it('takes back a different delegation before making the new one', () => {
    const has = [{ track: 0, kind: 'delegating' as const, delegation: { ...wanted(0), to: ELSE } }]
    expect(planOf([0], terms, TO, UNIT, has)).toEqual([
      [
        { kind: 'undelegate', track: 0 },
        { kind: 'delegate', delegation: wanted(0) },
      ],
    ])
  })

  it('clears votes on referenda that are over before delegating', () => {
    const has = [{ track: 0, kind: 'voting' as const, ongoing: [], ended: [4, 7] }]
    expect(planOf([0], terms, TO, UNIT, has)).toEqual([
      [
        { kind: 'removeVote', track: 0, poll: 4 },
        { kind: 'removeVote', track: 0, poll: 7 },
        { kind: 'delegate', delegation: wanted(0) },
      ],
    ])
  })

  it('keeps off a track with a referendum still counting its vote', () => {
    const has = [{ track: 1, kind: 'voting' as const, ongoing: [9], ended: [4] }]
    expect(planOf([0, 1], terms, TO, UNIT, has)).toEqual([[{ kind: 'delegate', delegation: wanted(0) }]])
  })
})
