
/**
 * On chain identity, as numen_runtime::identity_info::IdentityInfo has it. The
 * field order is the encoding order, so it has to match the runtime struct.
 *
 * Only x, telegram and discord gate anything. The rest are contact details.
 */

export const IDENTITY_FIELDS = [
  'display',
  'web',
  'email',
  'matrix',
  'github',
  'x',
  'telegram',
  'discord',
] as const

export type IdentityField = (typeof IDENTITY_FIELDS)[number]

export type IdentityInfo = Record<IdentityField, string>

export const EMPTY_IDENTITY: IdentityInfo = {
  display: '',
  web: '',
  email: '',
  matrix: '',
  github: '',
  x: '',
  telegram: '',
  discord: '',
}

/** The channels the runtime's qualified identity standard accepts. */
export const CHANNELS = ['x', 'telegram', 'discord'] as const satisfies readonly IdentityField[]

/**
 * All an automatic registration carries. Every other field is a claim nobody
 * checked, so the automatic registrar refuses to judge a record holding one and
 * the wallet never puts one there.
 */
export const PROVABLE = ['display', 'telegram', 'discord'] as const

/**
 * What the identity site says it proved, which is all it is allowed to say. The
 * name is not in here. A bot can prove a handle belongs to whoever signed in,
 * it has no way to prove what they are called.
 */
export type Proven = Pick<IdentityInfo, 'telegram' | 'discord'>

const provable = new Set<string>(PROVABLE)

/** One call writes the whole record, so anything else on it goes. */
export function dropped(registration: Registration | null): IdentityField[] {
  if (!registration) return []
  return IDENTITY_FIELDS.filter(
    (field) => !provable.has(field) && registration.info[field] !== '',
  )
}

export const identityFrom = (display: string, proven: Proven): IdentityInfo => ({
  ...EMPTY_IDENTITY,
  display,
  ...proven,
})

/** Data::Raw stops at Raw32, so a field is bounded in bytes rather than characters. */
export const FIELD_MAX_BYTES = 32

export const byteLength = (text: string): number => new TextEncoder().encode(text).length

export type Judgement =
  | 'Unknown'
  | 'FeePaid'
  | 'Reasonable'
  | 'KnownGood'
  | 'OutOfDate'
  | 'LowQuality'
  | 'Erroneous'

/**
 * What a registrar may hand down, and what each one claims. FeePaid is not one
 * of them, it is the chain's own note that a request has been paid for, and
 * provide_judgement turns it down.
 */
export const VERDICTS: { value: Judgement; says: string }[] = [
  { value: 'Reasonable', says: 'The data looks right. Nobody was met and no formal KYC was run' },
  { value: 'KnownGood', says: 'The registrar knows this account directly and vouches for all of it' },
  { value: 'OutOfDate', says: 'It was right once. Nothing malicious, and editing the identity lifts it' },
  { value: 'LowQuality', says: 'Too vague to be worth anything. Editing the identity lifts it' },
  { value: 'Erroneous', says: 'It is wrong, possibly on purpose. An edit will not lift this one' },
  { value: 'Unknown', says: 'No opinion, which is where every identity starts' },
]

/** One registrar's verdict on the identity as it stood when they gave it. */
export interface Verdict {
  registrar: number
  judgement: Judgement
}

export interface Registration {
  info: IdentityInfo
  judgements: Verdict[]
  deposit: bigint
}

/**
 * A sub account hangs off a parent through Identity.SuperOf. It registers
 * nothing of its own as a rule, so the name it goes by and the judgement on it
 * both come from the parent.
 */
export interface SubIdentity {
  /** What the parent calls this one, which is the second half of the label. */
  name: string
  parent: string
  registration: Registration | null
}

/** One account hanging off this one, as the parent named it. */
export interface Sub {
  address: string
  name: string
}

/** What the chain holds from a parent for the subs it has taken on. */
export interface Subs {
  deposit: bigint
  list: Sub[]
}

/** Everything the chain says about who an address is. */
export interface Standing {
  own: Registration | null
  sub: SubIdentity | null
}

/** The registration an address answers to, which is the parent's when it is a sub. */
export function backing(standing: Standing | null): Registration | null {
  return standing?.own ?? standing?.sub?.registration ?? null
}

/**
 * What to call the address. The account's own record leads, the same way its
 * verdict does, since a name from one record beside a verdict from the other
 * describes nobody. Only an account with none of its own reads as parent over
 * sub, the way the explorer writes it, and a parent nobody named leaves the sub
 * with nothing to hang on.
 */
export function labelOf(standing: Standing | null): string {
  if (standing?.own) return standing.own.info.display
  const parent = standing?.sub?.registration?.info.display
  return standing?.sub && parent ? `${parent}/${standing.sub.name}` : ''
}

export interface Registrar {
  index: number
  account: string
  fee: bigint
  /**
   * Which fields this registrar says it will check, one bit per field in the
   * order IDENTITY_FIELDS has them. Zero means it has never said.
   */
  fields: bigint
}

/** What this registrar has declared it checks. Declaring nothing claims nothing. */
export function checkedBy(registrar: Registrar | undefined): IdentityField[] {
  if (!registrar) return []
  return IDENTITY_FIELDS.filter((_, bit) => ((registrar.fields >> BigInt(bit)) & 1n) === 1n)
}

/**
 * The automated registrar, found by what it declares on chain rather than told
 * by anyone. It is the one claiming to check both channels a robot can sign
 * into, and a chain where nobody claims that has no automatic checking yet.
 */
export function botRegistrar(registrars: Registrar[]): Registrar | undefined {
  return registrars.find((entry) => {
    const declared = checkedBy(entry)
    return declared.includes('telegram') && declared.includes('discord')
  })
}

/**
 * The handles the bot already stands behind on this record. Its judge inherits
 * an unchanged handle off the parent block free of charge, so these need no
 * fresh sign in and no payment to survive a rewrite.
 */
export function carriedBy(
  registration: Registration | null,
  bot: Registrar | undefined,
): Partial<Proven> {
  if (!registration || !bot) return {}
  const judged = registration.judgements.some(
    (verdict) => verdict.registrar === bot.index && isChecked(verdict.judgement),
  )
  if (!judged) return {}

  const held: Partial<Proven> = {}
  for (const field of checkedBy(bot)) {
    if ((field === 'telegram' || field === 'discord') && registration.info[field] !== '') {
      held[field] = registration.info[field]
    }
  }
  return held
}

/** Everything else the account may fill in, the name it goes by aside. */
export const unchecked = (registrar: Registrar | undefined): IdentityField[] => {
  const checked = checkedBy(registrar)
  return IDENTITY_FIELDS.filter((field) => field !== 'display' && !checked.includes(field))
}

/** The two a registrar gives to an identity it has actually checked. */
const CHECKED: Judgement[] = ['Reasonable', 'KnownGood']

export const isChecked = (judgement: Judgement): boolean => CHECKED.includes(judgement)

/**
 * The qualified identity standard from numen/runtime/src/configs/governance.rs.
 * A registrar has to have checked the identity, and it has to carry a channel
 * somebody can be reached on. Both, or the registration gates nothing.
 */
function qualifies(registration: Registration | null): boolean {
  if (!registration) return false
  return (
    registration.judgements.some((verdict) => isChecked(verdict.judgement)) &&
    CHANNELS.some((channel) => registration.info[channel] !== '')
  )
}

/**
 * The gate itself, which the runtime asks of an account rather than of a
 * registration. A sub passes on the parent's record, since the SuperOf link
 * keeps the owner traceable, and it is read after the account's own.
 */
export function isQualified(standing: Standing | null): boolean {
  return qualifies(standing?.own ?? null) || qualifies(standing?.sub?.registration ?? null)
}

/**
 * What the registrars have made of this identity, as the explorer reads it. A
 * bad verdict wins over a good one, since the point is to warn rather than to
 * flatter, and one registrar cannot undo what another found.
 */
export type IdentityState = 'verified' | 'stale' | 'pending' | 'unjudged' | 'bad'

export function identityState(registration: Registration): IdentityState {
  const given = registration.judgements.map((verdict) => verdict.judgement)

  if (given.some((judgement) => judgement === 'Erroneous' || judgement === 'LowQuality')) {
    return 'bad'
  }
  if (given.some(isChecked)) return 'verified'
  if (given.includes('OutOfDate')) return 'stale'
  if (given.includes('FeePaid')) return 'pending'
  return 'unjudged'
}

export const STATE_WORDS: Record<IdentityState, string> = {
  verified: 'Checked by a registrar',
  stale: 'A registrar marked this out of date',
  pending: 'A registrar is being paid to check this',
  unjudged: 'No registrar has checked this',
  bad: 'A registrar rejected this',
}

/** Why the account falls short, in the order it has to fix them. */
export function shortfall(standing: Standing | null): string | null {
  const registration = backing(standing)
  if (!registration) return 'This account has no on chain identity yet'
  if (!CHANNELS.some((channel) => registration.info[channel] !== '')) {
    return 'Add an X, Telegram or Discord handle'
  }
  if (!registration.judgements.some((verdict) => isChecked(verdict.judgement))) {
    return pendingWith(registration) === null
      ? 'Ask a registrar to check it'
      : 'A registrar is checking it'
  }
  return null
}

/** The registrar already being paid to look at this, if there is one. */
export function pendingWith(registration: Registration | null): number | null {
  const paid = registration?.judgements.find((verdict) => verdict.judgement === 'FeePaid')
  return paid ? paid.registrar : null
}

/**
 * IdentityInfo encodes as one variant byte per field followed by the raw bytes,
 * which is what the chain charges for on top of the flat entry.
 */
export function encodedSize(info: IdentityInfo): number {
  return IDENTITY_FIELDS.reduce((total, field) => total + 1 + byteLength(info[field]), 0)
}

export function depositFor(info: IdentityInfo, base: bigint, perByte: bigint): bigint {
  return base + perByte * BigInt(encodedSize(info))
}

export const isEmpty = (info: IdentityInfo): boolean =>
  IDENTITY_FIELDS.every((field) => info[field] === '')

/** Fields somebody typed past what Data::Raw can hold. */
export function overlong(info: IdentityInfo): IdentityField[] {
  return IDENTITY_FIELDS.filter((field) => byteLength(info[field]) > FIELD_MAX_BYTES)
}

/** What an account filled in past its name, in the order the runtime holds them. */
export function channelsOf(info: IdentityInfo): [IdentityField, string][] {
  return IDENTITY_FIELDS.filter((field) => field !== 'display' && info[field] !== '').map(
    (field): [IdentityField, string] => [field, info[field]],
  )
}

export const LABELS: Record<IdentityField, string> = {
  display: 'Display name',
  web: 'Website',
  email: 'Email',
  matrix: 'Matrix',
  github: 'GitHub',
  x: 'X',
  telegram: 'Telegram',
  discord: 'Discord',
}

export const PLACEHOLDERS: Record<IdentityField, string> = {
  display: 'The name this account goes by',
  web: 'https://example.com',
  email: 'you@example.com',
  matrix: '@you:matrix.org',
  github: 'you',
  x: '@you',
  telegram: '@you',
  discord: 'you',
}
