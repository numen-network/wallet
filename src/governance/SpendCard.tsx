import { SPEND_LABELS, spendState, type Spend } from '@/chain/governance'
import { useSymbol } from '@/chain/queries'
import { formatAmount } from '@/lib/balance'
import { Button } from '@/ui/Button'
import { Beneficiary } from './Beneficiary'

const TONE: Partial<Record<ReturnType<typeof spendState>, string>> = {
  ready: 'border-accent text-accent',
  expired: 'border-bad text-bad',
}

interface CardProps {
  spend: Spend
  height: number
  /** Nothing here is worth offering when no account on this page can sign. */
  canSign: boolean
  onPayout: (spend: Spend) => void
}

/**
 * A passed referendum leaves the money in the treasury. Somebody has to claim
 * it, anybody may, and the window shuts whether or not they do.
 */
export function SpendCard({ spend, height, canSign, onPayout }: CardProps) {
  const symbol = useSymbol()
  const state = spendState(spend, height)

  return (
    <article className="rounded-[6px] border border-line bg-panel p-3.5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[13px] font-bold text-dim">#{spend.index}</span>
        <span className="text-[13px] font-semibold">
          {formatAmount(spend.amount, { precision: 2 })} {symbol}
        </span>
        <span
          className={`rounded-full border px-[7px] py-0.5 text-[10px] font-bold tracking-[0.06em] uppercase ${
            TONE[state] ?? 'border-line-strong text-dim'
          }`}
        >
          {SPEND_LABELS[state]}
        </span>
      </div>

      <div className="mt-2 text-[13.5px]">
        To <Beneficiary address={spend.beneficiary} />
      </div>

      <p className="mt-1.5 text-[12.5px] text-dim">
        {state === 'waiting'
          ? `Claimable from block ${spend.validFrom.toLocaleString('en-US')}`
          : state === 'ready'
            ? `Claimable until block ${spend.expireAt.toLocaleString('en-US')}, after which the treasury keeps it`
            : state === 'expired'
              ? 'Nobody claimed it in time, so the treasury kept it'
              : 'The money has moved, and the record clears itself'}
      </p>

      {canSign && state === 'ready' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="primary" onClick={() => onPayout(spend)}>
            Pay out
          </Button>
        </div>
      )}
    </article>
  )
}
