import { Identicon as PolkadotIdenticon } from '@polkadot/react-identicon'

/**
 * The component polkadot.js apps renders, so an account wears the same face in
 * both. Its substrate theme is jdenticon, which is what that host draws, and it
 * shares nothing with the dotted polkadot theme beyond the account it hashes.
 *
 * Jdenticon fills a square, so the disc, the ring around it and the white behind
 * it all belong to whoever shows the thing. That ring is what makes a stray
 * account read as one face rather than four diamonds loose on the card.
 *
 * The cursor is handed back to the card, whose own says the thing is draggable.
 */
export function Identicon({ address, size = 38 }: { address: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-line-strong ring-inset"
      style={{ width: size, height: size }}
    >
      <PolkadotIdenticon
        value={address}
        size={size}
        theme="substrate"
        style={{ cursor: 'inherit' }}
      />
    </span>
  )
}
