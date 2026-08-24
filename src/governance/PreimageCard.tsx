import type { NotedPreimage } from '@/chain/governance'
import { useSymbol } from '@/chain/queries'
import { formatAmount } from '@/lib/balance'
import { Button } from '@/ui/Button'
import { Beneficiary } from './Beneficiary'

/**
 * Bytes still on chain at somebody's expense. Opening a referendum puts its
 * title and description up as one of these, and ending the referendum drops
 * only the pointer, so the deposit outlives what it was for.
 */
export function PreimageCard({
  preimage,
  canSign,
  onClear,
}: {
  preimage: NotedPreimage
  canSign: boolean
  onClear: (preimage: NotedPreimage) => void
}) {
  const symbol = useSymbol()

  return (
    <article className="rounded-[6px] border border-line bg-panel p-3.5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[13px] font-bold text-dim">
          {preimage.hash.slice(0, 12)}…
        </span>
        <span className="text-[13px] font-semibold">
          {preimage.len.toLocaleString('en-US')} bytes
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
        <span className="text-lead">Preimage deposit</span>
        <span className="font-mono font-semibold">
          {formatAmount(preimage.amount, { precision: 2 })} {symbol}
        </span>
        <span className="text-lead">from</span>
        <Beneficiary address={preimage.who} />
        {canSign && (
          <Button type="button" onClick={() => onClear(preimage)}>
            Clear it
          </Button>
        )}
      </div>
    </article>
  )
}
