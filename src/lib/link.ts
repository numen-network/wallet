const DELEGATE_PARAM = 'delegate'
const VOTE_PARAM = 'vote'
const GENESIS_PARAM = 'genesis'

/** The query a link into the wallet carries, taken off the address bar once read. */
export const LINK_PARAMS = [DELEGATE_PARAM, VOTE_PARAM, GENESIS_PARAM]

/** What a link into the wallet opens. */
export type LinkTarget = { kind: 'delegate'; to: string } | { kind: 'vote'; poll: number }

/**
 * A link into the wallet, with the genesis hash of the chain it was made on.
 * The wallet opens on whichever chain it last used, a custom endpoint included,
 * and only the hash tells whether the link belongs on it.
 */
export interface Link {
  target: LinkTarget
  genesis: string | null
}

export function readLink(search: string): Link | null {
  const params = new URLSearchParams(search)
  const genesis = params.get(GENESIS_PARAM)
  const to = params.get(DELEGATE_PARAM)
  if (to !== null) return { target: { kind: 'delegate', to }, genesis }
  const poll = params.get(VOTE_PARAM)
  if (poll === null || !/^\d+$/.test(poll)) return null
  return { target: { kind: 'vote', poll: Number(poll) }, genesis }
}
