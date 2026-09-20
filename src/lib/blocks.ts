import { plural } from './plural'

/** Roughly how long a block count is, since a block count means nothing to read. */
export function waitFor(blocks: number, blockSeconds: number): string {
  if (blocks <= 0) return 'a moment'
  const hours = Math.ceil((blocks * blockSeconds) / 3600)
  if (hours < 24) return `about ${plural(hours, 'hour')}`
  const days = Math.ceil(hours / 24)
  return `about ${plural(days, 'day')}`
}

/** The same, down to the minute under an hour, for waits a session or two long. */
export function waitToTheMinute(blocks: number, blockSeconds: number): string {
  const minutes = Math.ceil((blocks * blockSeconds) / 60)
  if (blocks <= 0 || minutes >= 60) return waitFor(blocks, blockSeconds)
  return `about ${plural(minutes, 'minute')}`
}

const MONTH_DAYS = 30
const YEAR_DAYS = 365

/**
 * A wait in calendar units, since a payout months away reads as nothing in days.
 * A month is 30 days and a year 365, which is what anybody reading a schedule
 * takes them for.
 */
export function daySpan(blocks: number, blockSeconds: number): string {
  const days = Math.max(1, Math.ceil((blocks * blockSeconds) / 86400))
  if (days >= YEAR_DAYS) {
    const years = Math.floor(days / YEAR_DAYS)
    const months = Math.floor((days % YEAR_DAYS) / MONTH_DAYS)
    return months > 0 ? `${years}y ${months}mo` : `${years}y`
  }
  if (days >= MONTH_DAYS) {
    const months = Math.floor(days / MONTH_DAYS)
    const rest = days % MONTH_DAYS
    return rest > 0 ? `${months}mo ${rest}d` : `${months}mo`
  }
  return `${days}d`
}
