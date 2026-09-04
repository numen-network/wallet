import {
  OUTCOME_LABELS,
  refundsSubmission,
  type Held,
  type Settled,
} from '@/chain/governance'
import { useSymbol } from '@/chain/queries'
import { formatAmount } from '@/lib/balance'
import { NOTE } from '@/components/ui/field'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { CardMark } from '@/ui/CardMark'
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
    <CardContent className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold">
        {formatAmount(held.amount, { precision: 0 })} {symbol}
      </span>
      <span className="text-muted-foreground">to</span>
      <Beneficiary address={held.who} />
      {action}
    </CardContent>
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
      <CardHeader>
        <CardMark>#{settled.index}</CardMark>
        <Badge variant={TONE[settled.outcome] ?? 'default'}>{OUTCOME_LABELS[settled.outcome]}</Badge>
      </CardHeader>

      {settled.decision && (
        <Line
          label="Decision deposit"
          held={settled.decision}
          action={
            canSign && (
              <Button type="button" variant="outline" onClick={() => onRefundDecision(settled)}>
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
                <Button type="button" variant="outline" onClick={() => onRefundSubmission(settled)}>
                  Return it
                </Button>
              )
            ) : (
              <span className={NOTE}>
                kept, which is what {OUTCOME_LABELS[settled.outcome]} costs
              </span>
            )
          }
        />
      )}
    </Card>
  )
}
