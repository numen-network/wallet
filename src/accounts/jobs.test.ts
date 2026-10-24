import { describe, expect, it } from 'vitest'
import type { Operation } from '@/chain/types'
import { actorOf, innerOf, progressOf, type Job } from './jobs'
import type { Submission } from './session'

const ALICE = 'nu3oNksEGXV3Tsr4sBeRUpcfA5zYp4VvZ7t9uKVPMAe2UCo98'
const BOB = 'nu2uaQWzSyDzXHrgd78sQL2871qL2LpPU6kHeeb4ETtXfnASg'
const ending: Operation = { kind: 'undelegate', track: 0 }

const entry = (id: string, fields: Partial<Submission>): Submission => ({
  id,
  address: ALICE,
  operation: ending,
  stage: 'signed',
  hash: '',
  at: 0,
  ...fields,
})

describe('progressOf', () => {
  it('waits on the slowest part still going', () => {
    const job: Job = {
      id: 'job',
      at: 0,
      parts: [
        { address: ALICE, operation: ending, submission: 'a' },
        { address: ALICE, operation: ending, submission: 'b' },
      ],
    }
    const progress = progressOf(job, [entry('a', { stage: 'finalized' }), entry('b', { stage: 'broadcast' })])

    expect(progress.over).toBe(1)
    expect(progress.stage).toBe('broadcast')
    expect(progress.failed).toEqual([])
  })

  it('counts a refusal as over and keeps what the chain said', () => {
    const job: Job = {
      id: 'job',
      at: 0,
      parts: [
        { address: ALICE, operation: ending, submission: 'a' },
        { address: ALICE, operation: ending, submission: 'b' },
      ],
    }
    const progress = progressOf(job, [
      entry('a', { stage: 'inBlock' }),
      entry('b', { stage: 'broadcast', error: 'This account cannot pay the fee', detail: '{"type":"Invalid"}' }),
    ])

    expect(progress.over).toBe(1)
    expect(progress.stage).toBe('inBlock')
    expect(progress.failed).toMatchObject([{ submission: 'b', detail: '{"type":"Invalid"}' }])
  })

  it('takes a part that was never signed as failed from the start', () => {
    const job: Job = {
      id: 'job',
      at: 0,
      parts: [
        { address: ALICE, operation: ending, submission: 'a' },
        { address: BOB, operation: ending, error: 'Wrong password' },
      ],
    }
    const progress = progressOf(job, [entry('a', { stage: 'finalized' })])

    expect(progress.over).toBe(2)
    expect(progress.failed).toMatchObject([{ address: BOB, error: 'Wrong password', stage: null }])
  })
})

describe('actorOf', () => {
  it('names the account a proxy or a multisig acts for, not the one that signed', () => {
    expect(actorOf({ address: ALICE, operation: ending })).toBe(ALICE)
    expect(actorOf({ address: ALICE, operation: { kind: 'asProxy', real: BOB, call: ending } })).toBe(BOB)
    expect(
      actorOf({
        address: ALICE,
        operation: { kind: 'multisigApprove', threshold: 2, others: [BOB], multisig: BOB, call: ending },
      }),
    ).toBe(BOB)
  })
})

describe('innerOf', () => {
  it('unwraps the call a proxy carries inside a multisig', () => {
    const wrapped: Operation = {
      kind: 'multisigApprove',
      threshold: 2,
      others: [BOB],
      multisig: BOB,
      call: { kind: 'asProxy', real: ALICE, call: ending },
    }
    expect(innerOf(wrapped)).toBe(ending)
  })
})
