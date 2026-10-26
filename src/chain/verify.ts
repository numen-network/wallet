import type { Network } from './config'
import { BOT_CHANNELS, type Proven } from './identity'

/**
 * The handshake with the identity site, which is where the social sign in and
 * the registrar key live. The wallet cannot do either itself. Proving a handle
 * needs a bot token, and judging needs the registrar's key, so both would be
 * readable by anyone who opened the console.
 *
 * Nothing here fetches. The wallet opens a window, the site works, the window
 * posts back what it proved. A reply carries one sign in, good for an hour and
 * spent by one judgement, so the dialog holds every channel it wants on the
 * record before signing once.
 */

export type Provider = (typeof BOT_CHANNELS)[number]

export const PROVIDERS = BOT_CHANNELS

export const PROVIDER_NAMES: Record<Provider, string> = {
  telegram: 'Telegram',
  discord: 'Discord',
}

/** One sign in the site stands behind, until it expires. */
export interface Verified {
  proven: Proven
  expiresAt: number
}

/** A channel this dialog already proved, held until the one signature. */
export interface Check {
  handle: string
  expiresAt: number
}

export type Checks = Partial<Record<Provider, Check>>

/** The checks still standing, since a sign in is only good for an hour. */
export function alive(checks: Checks, now = Date.now()): Checks {
  const held: Checks = {}
  for (const provider of PROVIDERS) {
    const check = checks[provider]
    if (check && check.expiresAt > now) held[provider] = check
  }
  return held
}

/** How much longer a sign in has, rounded up so the last part minute counts. */
export const minutesLeft = (expiresAt: number, now = Date.now()): number =>
  Math.max(0, Math.ceil((expiresAt - now) / 60_000))

/** Minutes a sign in should have left at signing, so it outlasts the trip into a block. */
export const SPARE_MINUTES = 10

/** Which of `providers` hold a sign in too close to running out to sign with. */
export function runningOut(
  checks: Checks,
  providers: readonly Provider[],
  now = Date.now(),
): Provider[] {
  return providers.filter((provider) => {
    const check = checks[provider]
    return check !== undefined && minutesLeft(check.expiresAt, now) <= SPARE_MINUTES
  })
}

export const provenFrom = (checks: Checks): Proven => ({
  telegram: checks.telegram?.handle ?? '',
  discord: checks.discord?.handle ?? '',
})

/** What comes back through the window, and the only shape worth reading. */
interface Reply {
  kind: 'numen-identity'
  address: string
  proven?: Proven
  expiresAt?: number
  refused?: string
}

export class VerifyError extends Error {}

const WINDOW = 'width=520,height=680,menubar=no,toolbar=no'

/** How often to look at a window that will not tell us it was closed. */
const WATCH_MS = 400

/**
 * What the wallet signs before a sign in opens, the shape the identity site
 * checks. The provider and the time ride inside, so one signature opens one
 * channel for a few minutes.
 */
export const ownerMessage = (address: string, provider: Provider, at: number): string =>
  `numen-identity\n${address}\n${provider}\n${at}`

export function verify(
  network: Network,
  provider: Provider,
  address: string,
  sign: (message: string) => Promise<string>,
): Promise<Verified> {
  const origin = new URL(network.identitySite).origin
  // The window opens on the click itself. Signing may sit behind an extension
  // prompt, and a window opened after that wait is one the browser blocks
  const popup = window.open('', 'numen-identity', WINDOW)
  if (!popup) return Promise.reject(new VerifyError('The browser blocked the sign in window'))

  return new Promise<Verified>((resolve, reject) => {
    const stop = (settle: () => void) => {
      window.removeEventListener('message', read)
      clearInterval(watch)
      settle()
    }

    /** Origin is what the browser guarantees, and only the identity site can claim it. */
    const read = (event: MessageEvent) => {
      if (event.origin !== origin) return
      const reply = event.data as Reply
      if (reply?.kind !== 'numen-identity' || reply.address !== address) return

      popup.close()
      const { proven, expiresAt, refused } = reply
      if (proven && typeof expiresAt === 'number') {
        stop(() => resolve({ proven, expiresAt }))
      } else {
        stop(() => reject(new VerifyError(refused ?? `${PROVIDER_NAMES[provider]} said no`)))
      }
    }

    const watch = setInterval(() => {
      if (popup.closed) stop(() => reject(new VerifyError('That window closed with nothing proved')))
    }, WATCH_MS)

    window.addEventListener('message', read)

    const at = Date.now()
    Promise.resolve()
      .then(() => sign(ownerMessage(address, provider, at)))
      .then(
        (sig) => {
          if (popup.closed) return
          const url = new URL(`${origin}/verify`)
          url.searchParams.set('provider', provider)
          url.searchParams.set('address', address)
          url.searchParams.set('at', String(at))
          url.searchParams.set('sig', sig)
          popup.location.href = url.href
        },
        (problem: unknown) => {
          stop(() => reject(problem))
          popup.close()
        },
      )
  })
}
