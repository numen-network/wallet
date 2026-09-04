import { SPEND_LABELS, spendState, type Spend } from '@/chain/governance'
import { useSymbol } from '@/chain/queries'
import { formatAmount } from '@/lib/balance'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Beneficiary } from './Beneficiary'

const TONE: Partial<Record<ReturnType<typeof spendState>, BadgeVariant>> = {
  ready: 'primary',
  expired: 'destructive',
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
    <Card>
      <CardHeader>
        <span className="font-mono text-[13px] font-bold text-dim">#{spend.index}</span>
        <CardTitle>
          {formatAmount(spend.amount, { precision: 2 })} {symbol}
        </CardTitle>
        <Badge variant={TONE[state] ?? 'default'}>{SPEND_LABELS[state]}</Badge>
      </CardHeader>

      <CardContent>
        To <Beneficiary address={spend.beneficiary} />
      </CardContent>

      <CardDescription>
        {state === 'waiting'
          ? `Claimable from block ${spend.validFrom.toLocaleString('en-US')}`
          : state === 'ready'
            ? `Claimable until block ${spend.expireAt.toLocaleString('en-US')}, after which the treasury keeps it`
            : state === 'expired'
              ? 'Nobody claimed it in time, so the treasury kept it'
              : 'The money has moved, and the record clears itself'}
      </CardDescription>

      {canSign && state === 'ready' && (
        <CardFooter>
          <Button type="button" onClick={() => onPayout(spend)}>
            Pay out
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
