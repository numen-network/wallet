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
  feePaidTo,
  identityFrom,
  isQualified,
  labelOf,
  overlong,
  pendingWith,
  pictured,
  shortfall,
  type Registrar,
  type Registration,
  type Ruling,
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
  const sits = (index: number, account: string): Registrar => ({
    index,
    account,
    fee: UNIT,
    fields: 0n,
  })

  it('is the account the network names, wherever it sits', () => {
    const found = botRegistrar([sits(0, 'nuRegistrar'), sits(1, 'nuBot')], 'nuBot')
    expect(found?.index).toBe(1)
  })

  it('is nobody on a chain whose list does not hold it', () => {
    expect(botRegistrar([sits(0, 'nuRegistrar')], 'nuBot')).toBeUndefined()
    expect(botRegistrar([], 'nuBot')).toBeUndefined()
  })
})

describe('what the bot already stands behind', () => {
  const bot: Registrar = {
    index: 2,
    account: 'nuBot',
    fee: UNIT,
    fields: (1n << 8n) | (1n << 9n),
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
      judgements: [{ registrar: 2, judgement: 'FeePaid', fee: UNIT }],
    })
    expect(carriedBy(held, bot)).toEqual({})
    expect(carriedBy(null, bot)).toEqual({})
    expect(carriedBy(held, undefined)).toEqual({})
  })

  it('carries both whatever the chain says it declares', () => {
    const silent: Registrar = { ...bot, fields: 0n }
    const held = registration({
      info,
      judgements: [{ registrar: 2, judgement: 'Reasonable' }],
    })
    expect(carriedBy(held, silent)).toEqual({ telegram: 'alice', discord: 'alice_dc' })
  })
})

describe('what the chain charges to hold an identity', () => {
  it('counts a length byte for every field, filled in or not', () => {
    expect(encodedSize(EMPTY_IDENTITY)).toBe(10)
    expect(encodedSize({ ...EMPTY_IDENTITY, display: 'Alice', x: '@alice' })).toBe(21)
  })

  // Only the about field is long enough for a compact length to take a second
  // byte
  it('widens the length prefix once a field passes 63 bytes', () => {
    expect(encodedSize({ ...EMPTY_IDENTITY, about: 'a'.repeat(63) })).toBe(73)
    expect(encodedSize({ ...EMPTY_IDENTITY, about: 'a'.repeat(64) })).toBe(75)
  })

  it('adds the byte price to the flat entry', () => {
    const base = 5n * UNIT + (17n * UNIT) / 100n
    const perByte = UNIT / 100n
    const info = { ...EMPTY_IDENTITY, display: 'Alice', x: '@alice' }
    expect(depositFor(info, base, perByte)).toBe(base + perByte * 21n)
  })

  it('measures a field in bytes, since that is what the runtime bounds', () => {
    expect(byteLength('中文')).toBe(6)
    expect(overlong({ ...EMPTY_IDENTITY, display: 'a'.repeat(33) })).toEqual(['display'])
    expect(overlong({ ...EMPTY_IDENTITY, display: '中'.repeat(11) })).toEqual(['display'])
    expect(overlong({ ...EMPTY_IDENTITY, display: '中'.repeat(10) })).toEqual([])
  })

  it('bounds each field on its own', () => {
    expect(overlong({ ...EMPTY_IDENTITY, avatar: 'a'.repeat(128) })).toEqual([])
    expect(overlong({ ...EMPTY_IDENTITY, avatar: 'a'.repeat(129) })).toEqual(['avatar'])
    expect(overlong({ ...EMPTY_IDENTITY, about: 'a'.repeat(2048) })).toEqual([])
    expect(overlong({ ...EMPTY_IDENTITY, about: 'a'.repeat(2049) })).toEqual(['about'])
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
    const withVerdict = (judgement: Ruling) =>
      isQualified(standing({ info, judgements: [{ registrar: 0, judgement }] }))

    expect(withVerdict('KnownGood')).toBe(true)
    expect(withVerdict('OutOfDate')).toBe(false)
    expect(withVerdict('LowQuality')).toBe(false)
    expect(withVerdict('Erroneous')).toBe(false)
    expect(
      isQualified(
        standing({ info, judgements: [{ registrar: 0, judgement: 'FeePaid', fee: UNIT }] }),
      ),
    ).toBe(false)
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
          judgements: [{ registrar: 1, judgement: 'FeePaid', fee: UNIT }],
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
      pendingWith(registration({ judgements: [{ registrar: 3, judgement: 'FeePaid', fee: UNIT }] })),
    ).toBe(3)
  })

  it('reads back what one registrar stands to collect', () => {
    const held = registration({
      judgements: [
        { registrar: 1, judgement: 'FeePaid', fee: UNIT / 2n },
        { registrar: 3, judgement: 'Reasonable' },
      ],
    })

    expect(feePaidTo(held, 1)).toBe(UNIT / 2n)
    expect(feePaidTo(held, 3)).toBeNull()
    expect(feePaidTo(held, 7)).toBeNull()
    expect(feePaidTo(null, 1)).toBeNull()
  })

  it('picks its own request out of several', () => {
    const held = registration({
      judgements: [
        { registrar: 0, judgement: 'FeePaid', fee: UNIT },
        { registrar: 1, judgement: 'FeePaid', fee: UNIT / 2n },
      ],
    })

    expect(feePaidTo(held, 1)).toBe(UNIT / 2n)
  })
})

describe('what a registrar says it checks', () => {
  const registrar = (fields: bigint) => ({ index: 0, account: 'nu7', fee: 0n, fields })

  it('reads the bit per field the runtime numbers them by', () => {
    // Telegram is bit 6, Discord bit 7
    expect(checkedBy(registrar((1n << 8n) | (1n << 9n)))).toEqual(['telegram', 'discord'])
    expect(checkedBy(registrar(1n << 7n))).toEqual(['x'])
    expect(checkedBy(registrar(1n))).toEqual(['display'])
  })

  it('claims nothing for a registrar that declared nothing', () => {
    expect(checkedBy(registrar(0n))).toEqual([])
    expect(checkedBy(undefined)).toEqual([])
  })

  it('leaves everything else over, the profile aside', () => {
    expect(unchecked(registrar((1n << 8n) | (1n << 9n)))).toEqual([
      'web',
      'email',
      'github',
      'matrix',
      'x',
    ])
    expect(unchecked(undefined)).toEqual([
      'web',
      'email',
      'github',
      'matrix',
      'x',
      'telegram',
      'discord',
    ])
  })
})

describe('what a bot is allowed to put on chain', () => {
  it('writes the name beside the proved channels and blanks the rest', () => {
    expect(
      identityFrom({ display: 'alice', avatar: '', about: '' }, { telegram: '@alice', discord: '' }),
    ).toEqual({
      ...EMPTY_IDENTITY,
      display: 'alice',
      telegram: '@alice',
    })
  })

  // The bot cannot check a profile and does not have to. An automatic write
  // carries what the account already said about itself
  it('carries the profile through', () => {
    expect(
      identityFrom(
        { display: 'alice', avatar: 'https://example.com/a.png', about: 'Runs a validator.' },
        { telegram: '@alice', discord: '' },
      ),
    ).toEqual({
      ...EMPTY_IDENTITY,
      display: 'alice',
      avatar: 'https://example.com/a.png',
      about: 'Runs a validator.',
      telegram: '@alice',
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

  it('leaves the profile alone', () => {
    expect(
      dropped(
        registration({
          info: {
            ...EMPTY_IDENTITY,
            display: 'alice',
            avatar: 'https://example.com/a.png',
            about: 'Runs a validator.',
            telegram: '@alice',
          },
        }),
      ),
    ).toEqual([])
  })

  it('takes nothing off a record that is already only kept fields', () => {
    expect(
      dropped(registration({ info: { ...EMPTY_IDENTITY, display: 'alice', discord: 'alice' } })),
    ).toEqual([])
    expect(dropped(null)).toEqual([])
  })
})

// The automatic registrar marks a record whose avatar shows nothing, so the
// dialog has to catch the address before it gets signed
describe('an avatar the record can actually show', () => {
  it('takes the picture formats the registrar names', () => {
    for (const avatar of [
      'https://example.com/alice.png',
      'https://example.com/alice.jpg',
      'https://example.com/alice.jpeg',
      'https://example.com/alice.gif',
      'https://example.com/alice.webp',
    ]) {
      expect(pictured(avatar)).toBe(true)
    }
  })

  it('takes a record wearing no avatar', () => {
    expect(pictured('')).toBe(true)
  })

  it('turns down anything that is not an https picture', () => {
    for (const avatar of [
      'http://example.com/alice.png',
      'example.com/alice.png',
      'https://example.com/alice',
      'https://example.com/alice.svg',
      'https://example.com/alice.png?size=64',
    ]) {
      expect(pictured(avatar)).toBe(false)
    }
  })
})
