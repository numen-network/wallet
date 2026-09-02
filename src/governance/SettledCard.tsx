import {
  OUTCOME_LABELS,
  refundsSubmission,
  type Held,
  type Settled,
} from '@/chain/governance'
import { useSymbol } from '@/chain/queries'
import { formatAmount } from '@/lib/balance'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { Beneficiary } from './Beneficiary'

const TONE: Partial<Record<Settled['outcome'], BadgeVariant>> = {
  approved: 'primary',
  rejected: 'destructive',
}

function Line({
  label,
  held,
  action,
}: {
  label: string
  held: Held
  action: React.ReactNode
}) {
  const symbol = useSymbol()

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold">
        {formatAmount(held.amount, { precision: 0 })} {symbol}
      </span>
      <span className="text-muted-foreground">to</span>
      <Beneficiary address={held.who} />
      {action}
    </div>
  )
}

interface CardProps {
  settled: Settled
  /** Nothing here is worth offering when no account on this page can sign. */
  canSign: boolean
  onRefundSubmission: (settled: Settled) => void
  onRefundDecision: (settled: Settled) => void
}

/**
 * A referendum that is over and still holding money. Whoever signs the refund
 * pays only the fee, since the deposit goes back to whoever put it down.
 */
export function SettledCard({
  settled,
  canSign,
  onRefundSubmission,
  onRefundDecision,
}: CardProps) {
  const back = refundsSubmission(settled)

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[13px] font-bold text-dim">#{settled.index}</span>
        <Badge variant={TONE[settled.outcome] ?? 'default'}>{OUTCOME_LABELS[settled.outcome]}</Badge>
      </div>

      {settled.decision && (
        <Line
          label="Decision deposit"
          held={settled.decision}
          action={
            canSign && (
              <Button type="button" onClick={() => onRefundDecision(settled)}>
                Return it
              </Button>
            )
          }
        />
      )}

      {settled.submission && (
        <Line
          label="Submission deposit"
          held={settled.submission}
          action={
            back ? (
              canSign && (
                <Button type="button" onClick={() => onRefundSubmission(settled)}>
                  Return it
                </Button>
              )
            ) : (
              <span className="text-[12.5px] text-dim">
                kept, which is what {OUTCOME_LABELS[settled.outcome]} costs
              </span>
            )
          }
        />
      )}
    </Card>
  )
}
