/** Roughly how long a block count is, since a block count means nothing to read. */
export function waitFor(blocks: number, blockSeconds: number): string {
  if (blocks <= 0) return 'a moment'
  const hours = Math.ceil((blocks * blockSeconds) / 3600)
  if (hours < 24) return `about ${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.ceil(hours / 24)
  return `about ${days} day${days === 1 ? '' : 's'}`
}
