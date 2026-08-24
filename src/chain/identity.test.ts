import { describe, expect, it } from 'vitest'
import { UNIT } from './config'
import {
  backing,
  botRegistrar,
  carriedBy,
  byteLength,
  checkedBy,
  unchecked,
  depositFor,
  dropped,
  EMPTY_IDENTITY,
  encodedSize,
  identityFrom,
  isQualified,
  labelOf,
  overlong,
  pendingWith,
  shortfall,
  type Registrar,
  type Registration,
  type Standing,
} from './identity'

const registration = (over: Partial<Registration> = {}): Registration => ({
  info: EMPTY_IDENTITY,
  judgements: [],
  deposit: 0n,
  ...over,
})

/** An account with a record of its own and no parent, which is the ordinary one. */
const standing = (over: Partial<Registration> = {}): Standing => ({
  own: registration(over),
  sub: null,
})

const checked = registration({
  info: { ...EMPTY_IDENTITY, display: 'Numen', telegram: '@numen' },
  judgements: [{ registrar: 0, judgement: 'Reasonable' }],
})

describe('finding the automated registrar', () => {
  const declares = (index: number, fields: bigint): Registrar => ({
    index,
    account: 'nuRegistrar',
    fee: UNIT,
    fields,
  })
  const TELEGRAM = 1n << 6n
  const DISCORD = 1n << 7n

  it('is the one declaring both channels, wherever it sits', () => {
    const found = botRegistrar([
      declares(0, 0n),
      declares(1, TELEGRAM),
      declares(2, TELEGRAM | DISCORD),
    ])
    expect(found?.index).toBe(2)
  })

  it('is nobody on a chain where nobody declares both', () => {
    expect(botRegistrar([declares(0, TELEGRAM), declares(1, DISCORD)])).toBeUndefined()
    expect(botRegistrar([])).toBeUndefined()
  })
})

describe('what the bot already stands behind', () => {
  const bot: Registrar = {
    index: 2,
    account: 'nuBot',
    fee: UNIT,
    fields: (1n << 6n) | (1n << 7n),
  }
  const info = { ...EMPTY_IDENTITY, display: 'Alice', telegram: 'alice', discord: 'alice_dc' }

  it('carries the channels of a record it judged', () => {
    const held = registration({
      info,
      judgements: [{ registrar: 2, judgement: 'Reasonable' }],
    })
    expect(carriedBy(held, bot)).toEqual({ telegram: 'alice', discord: 'alice_dc' })
  })

  it('carries nothing off a judgement from somebody else', () => {
    const held = registration({
      info,
      judgements: [{ registrar: 0, judgement: 'Reasonable' }],
    })
    expect(carriedBy(held, bot)).toEqual({})
  })

  it('carries nothing without a checked judgement', () => {
    const held = registration({
      info,
      judgements: [{ registrar: 2, judgement: 'FeePaid' }],
    })
    expect(carriedBy(held, bot)).toEqual({})
    expect(carriedBy(null, bot)).toEqual({})
    expect(carriedBy(held, undefined)).toEqual({})
  })

  it('carries only what the declaration covers', () => {
    const narrow: Registrar = { ...bot, fields: 1n << 6n }
    const held = registration({
      info,
      judgements: [{ registrar: 2, judgement: 'Reasonable' }],
    })
    expect(carriedBy(held, narrow)).toEqual({ telegram: 'alice' })
  })
})

describe('what the chain charges to hold an identity', () => {
  it('counts a variant byte for every field, filled in or not', () => {
    expect(encodedSize(EMPTY_IDENTITY)).toBe(8)
    expect(encodedSize({ ...EMPTY_IDENTITY, display: 'Alice', x: '@alice' })).toBe(19)
  })

  it('adds the byte price to the flat entry', () => {
    const base = 5n * UNIT + (17n * UNIT) / 100n
    const perByte = UNIT / 100n
    const info = { ...EMPTY_IDENTITY, display: 'Alice', x: '@alice' }
    expect(depositFor(info, base, perByte)).toBe(base + perByte * 19n)
  })

  it('measures a field in bytes, since that is what Data::Raw bounds', () => {
    expect(byteLength('中文')).toBe(6)
    expect(overlong({ ...EMPTY_IDENTITY, display: 'a'.repeat(33) })).toEqual(['display'])
    expect(overlong({ ...EMPTY_IDENTITY, display: '中'.repeat(11) })).toEqual(['display'])
    expect(overlong({ ...EMPTY_IDENTITY, display: '中'.repeat(10) })).toEqual([])
  })
})

describe('the qualified identity standard', () => {
  it('wants a checked judgement and a channel, not one of the two', () => {
    const channel = { ...EMPTY_IDENTITY, telegram: '@alice' }

    expect(isQualified(standing({ info: channel }))).toBe(false)
    expect(
      isQualified(standing({ judgements: [{ registrar: 0, judgement: 'Reasonable' }] })),
    ).toBe(false)
    expect(
      isQualified(
        standing({ info: channel, judgements: [{ registrar: 0, judgement: 'Reasonable' }] }),
      ),
    ).toBe(true)
  })

  it('takes KnownGood too, and nothing else', () => {
    const info = { ...EMPTY_IDENTITY, x: '@alice' }
    const withVerdict = (judgement: Registration['judgements'][number]['judgement']) =>
      isQualified(standing({ info, judgements: [{ registrar: 0, judgement }] }))

    expect(withVerdict('KnownGood')).toBe(true)
    expect(withVerdict('OutOfDate')).toBe(false)
    expect(withVerdict('LowQuality')).toBe(false)
    expect(withVerdict('Erroneous')).toBe(false)
    expect(withVerdict('FeePaid')).toBe(false)
  })

  it('ignores contact details that gate nothing', () => {
    const info = { ...EMPTY_IDENTITY, display: 'Alice', email: 'a@b.c', github: 'alice' }
    expect(
      isQualified(standing({ info, judgements: [{ registrar: 0, judgement: 'KnownGood' }] })),
    ).toBe(false)
  })
})

describe('a sub account, which answers to the parent it hangs off', () => {
  const sub = (registration: Registration | null, own: Registration | null = null): Standing => ({
    own,
    sub: { name: 'Payouts', parent: 'nu2uaQWz', registration },
  })

  it('passes the gate on the parent, the way the runtime reads it', () => {
    expect(isQualified(sub(checked))).toBe(true)
    expect(isQualified(sub(registration()))).toBe(false)
    expect(isQualified(sub(null))).toBe(false)
  })

  // The runtime asks the account's own record first, so a parent that falls
  // short cannot take away what the account already cleared on its own
  it('still passes on its own record when the parent falls short', () => {
    expect(isQualified(sub(registration(), checked))).toBe(true)
  })

  it('answers to the parent for its verdict', () => {
    expect(backing(sub(checked))).toBe(checked)
    expect(backing(standing())).not.toBe(checked)
    expect(backing(null)).toBeNull()
  })

  it('reads as parent over sub, and as nothing when the parent is unnamed', () => {
    expect(labelOf(sub(checked))).toBe('Numen/Payouts')
    expect(labelOf(sub(registration()))).toBe('')
    expect(labelOf(standing({ info: { ...EMPTY_IDENTITY, display: 'Alice' } }))).toBe('Alice')
    expect(labelOf(null)).toBe('')
  })

  // The verdict comes off the account's own record when it has one, so the name
  // beside it has to come off the same record
  it('names an account by its own record before its parent', () => {
    const both = sub(checked, registration({ info: { ...EMPTY_IDENTITY, display: 'Alice' } }))
    expect(labelOf(both)).toBe('Alice')
    expect(backing(both)).toBe(both.own)
  })

  it('takes the parent for what falls short', () => {
    expect(shortfall(sub(checked))).toBeNull()
    expect(shortfall(sub(registration()))).toMatch(/Add an X, Telegram or Discord/)
  })
})

describe('what to tell somebody who falls short', () => {
  it('names the next thing to do, in the order it gets done', () => {
    expect(shortfall(null)).toMatch(/no on chain identity/)
    expect(shortfall(standing())).toMatch(/Add an X, Telegram or Discord/)
    expect(shortfall(standing({ info: { ...EMPTY_IDENTITY, x: '@alice' } }))).toMatch(
      /Ask a registrar/,
    )
    expect(
      shortfall(
        standing({
          info: { ...EMPTY_IDENTITY, x: '@alice' },
          judgements: [{ registrar: 1, judgement: 'FeePaid' }],
        }),
      ),
    ).toMatch(/is checking it/)
    expect(
      shortfall(
        standing({
          info: { ...EMPTY_IDENTITY, x: '@alice' },
          judgements: [{ registrar: 0, judgement: 'Reasonable' }],
        }),
      ),
    ).toBeNull()
  })

  it('knows which registrar has already been paid', () => {
    expect(pendingWith(registration())).toBeNull()
    expect(
      pendingWith(registration({ judgements: [{ registrar: 3, judgement: 'FeePaid' }] })),
    ).toBe(3)
  })
})

describe('what a registrar says it checks', () => {
  const registrar = (fields: bigint) => ({ index: 0, account: 'nu7', fee: 0n, fields })

  it('reads the bit per field the runtime numbers them by', () => {
    // Telegram is bit 6, Discord bit 7
    expect(checkedBy(registrar((1n << 6n) | (1n << 7n)))).toEqual(['telegram', 'discord'])
    expect(checkedBy(registrar(1n << 5n))).toEqual(['x'])
    expect(checkedBy(registrar(1n))).toEqual(['display'])
  })

  it('claims nothing for a registrar that declared nothing', () => {
    expect(checkedBy(registrar(0n))).toEqual([])
    expect(checkedBy(undefined)).toEqual([])
  })

  it('leaves everything else over, the display name aside', () => {
    expect(unchecked(registrar((1n << 6n) | (1n << 7n)))).toEqual([
      'web',
      'email',
      'matrix',
      'github',
      'x',
    ])
    expect(unchecked(undefined)).toEqual(['web', 'email', 'matrix', 'github', 'x', 'telegram', 'discord'])
  })
})

describe('what a bot is allowed to put on chain', () => {
  it('writes the name beside the proved channels and blanks the rest', () => {
    expect(identityFrom('alice', { telegram: '@alice', discord: '' })).toEqual({
      ...EMPTY_IDENTITY,
      display: 'alice',
      telegram: '@alice',
    })
  })

  // Nobody proves a name, so an account may go on chain with only a handle
  it('takes an empty name', () => {
    expect(identityFrom('', { telegram: '', discord: 'alice' })).toEqual({
      ...EMPTY_IDENTITY,
      discord: 'alice',
    })
  })

  it('names what a verification would take off the record', () => {
    expect(
      dropped(
        registration({
          info: { ...EMPTY_IDENTITY, display: 'alice', telegram: '@alice', github: 'alice' },
        }),
      ),
    ).toEqual(['github'])
  })

  // X is a channel the runtime accepts but no bot of ours signs in to
  it('counts x among the losses, channel or not', () => {
    expect(dropped(registration({ info: { ...EMPTY_IDENTITY, x: '@alice' } }))).toEqual(['x'])
  })

  it('takes nothing off a record that is already only provable fields', () => {
    expect(
      dropped(registration({ info: { ...EMPTY_IDENTITY, display: 'alice', discord: 'alice' } })),
    ).toEqual([])
    expect(dropped(null)).toEqual([])
  })
})
