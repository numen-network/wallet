/**
 * JSON with bigint in it, which JSON.stringify refuses on its own. An amount
 * goes out as its digits with an n on the end, the way the language writes
 * the literal, and comes back as the bigint it was.
 */
export const replaceBigInt = (_key: string, value: unknown): unknown =>
  typeof value === 'bigint' ? `${value}n` : value

export const reviveBigInt = (_key: string, value: unknown): unknown =>
  typeof value === 'string' && /^\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value
