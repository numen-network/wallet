import { describe as group, expect, it } from 'vitest'
import { UNIT } from '@/chain/config'
import type { Operation } from '@/chain/types'
import { describe } from './activity'

const TO = 'nu3oNksEGXV3Tsr4sBeRUpcfA5zYp4VvZ7t9uKVPMAe2UCo98'
const OTHER = 'nu2uaQWzSyDzXHrgd78sQL2871qL2LpPU6kHeeb4ETtXfnASg'

const pay = (to: string, whole: bigint): Operation => ({
  kind: 'transfer',
  to,
  amount: whole * UNIT,
})

const said = (operation: Operation) => describe(operation, 'tNUMN')

group('a call read out argument by argument', () => {
  it('names what it carries rather than writing a sentence', () => {
    expect(said(pay(TO, 1n))).toEqual({
      title: 'Transfer',
      fields: [
        { name: 'amount', value: '1.0000 tNUMN' },
        { name: 'to', value: 'nu3oNks…UCo98' },
      ],
    })
  })

  it('has nothing to write out for a call that carries nothing', () => {
    expect(said({ kind: 'vest' })).toEqual({ title: 'Release what has vested', fields: [] })
  })

  it('hangs what a wrapper adds off the end of what it wraps', () => {
    expect(said({ kind: 'asProxy', real: OTHER, call: pay(TO, 1n) })).toEqual({
      title: 'Transfer',
      fields: [
        { name: 'amount', value: '1.0000 tNUMN' },
        { name: 'to', value: 'nu3oNks…UCo98' },
        { name: 'as', value: 'nu2uaQW…fnASg' },
      ],
    })
  })
})

group('a batch in the log', () => {
  it('writes out every payment, since a count says nothing about where it went', () => {
    const written = said({ kind: 'batch', calls: [pay(TO, 1n), pay(OTHER, 2n)] })

    expect(written.title).toBe('Transfer')
    expect(written.fields).toEqual([
      { name: '1', value: '1.0000 tNUMN, nu3oNks…UCo98' },
      { name: '2', value: '2.0000 tNUMN, nu2uaQW…fnASg' },
    ])
  })

  it('reads as the call itself when it holds only one', () => {
    expect(said({ kind: 'batch', calls: [pay(TO, 1n)] })).toEqual(said(pay(TO, 1n)))
  })

  it('names each call when they are not all the same, since the values alone would not', () => {
    const written = said({
      kind: 'batch',
      calls: [
        { kind: 'removeVote', poll: 3, track: 0 },
        { kind: 'unlock', track: 0, target: TO },
      ],
    })

    expect(written.title).toBe('2 calls')
    expect(written.fields).toEqual([
      { name: 'Take back the vote on 3', value: 'Track 0' },
      { name: 'Unlock', value: 'Track 0, nu3oNks…UCo98' },
    ])
  })

  it('has something to say about a batch with nothing in it', () => {
    expect(said({ kind: 'batch', calls: [] })).toEqual({ title: 'Nothing', fields: [] })
  })
})

group('addresses in full', () => {
  const valueOf = (described: ReturnType<typeof said>, name: string) =>
    described.fields.find((field) => field.name === name)?.value

  it('shortens by default, since the log is a record rather than a check', () => {
    expect(valueOf(said(pay(TO, 1n)), 'to')).toBe('nu3oNks…UCo98')
  })

  /** Two addresses sharing a head and a tail are cheap to come by. */
  it('writes them out where somebody is about to sign', () => {
    const written = describe(pay(TO, 1n), 'tNUMN', undefined, { whole: true })

    expect(valueOf(written, 'to')).toBe(TO)
  })

  it('carries that down into the calls a batch holds', () => {
    const written = describe(
      { kind: 'batch', calls: [pay(TO, 1n), pay(OTHER, 2n)] },
      'tNUMN',
      undefined,
      { whole: true },
    )

    expect(written.fields[0]?.value).toContain(TO)
  })
})
