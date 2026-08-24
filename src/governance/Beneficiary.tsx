import { IdentityVerdict } from '@/accounts/IdentityVerdict'
import { explorerAccount } from '@/chain/config'
import { backing, channelsOf, labelOf, LABELS } from '@/chain/identity'
import { useChain } from '@/chain/provider'
import { useStanding } from '@/chain/queries'

/**
 * Who gets the money is the question this page is about, whether it is still
 * being put or has already been answered, so the chain's own name for them
 * leads. An account no registrar has ever heard of falls back to its address,
 * where the whole thing shows rather than a middle elided one that hides the
 * part that differs. The name hides the address, so hovering it hands back the
 * address and every channel the identity claims, the way the explorer does it.
 */
export function Beneficiary({ address }: { address: string }) {
  const { network } = useChain()
  const { data: standing } = useStanding(address)
  const registration = backing(standing ?? null)
  const name = labelOf(standing ?? null)

  const behind =
    registration && name
      ? [
          address,
          ...channelsOf(registration.info).map(([field, value]) => `${LABELS[field]} ${value}`),
        ]
      : null

  return (
    <span className="inline-flex items-center gap-1 align-bottom">
      {standing && <IdentityVerdict standing={standing} />}
      <a
        href={explorerAccount(network, address)}
        target="_blank"
        rel="noopener"
        title={behind?.join('\n')}
        className={`break-all text-accent hover:underline ${name ? 'font-semibold' : 'font-mono'}`}
      >
        {name || address}
      </a>
    </span>
  )
}
