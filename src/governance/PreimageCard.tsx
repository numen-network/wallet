import type { NotedPreimage } from '@/chain/governance'
import { useSymbol } from '@/chain/queries'
import { formatAmount } from '@/lib/balance'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CardMark } from '@/ui/CardMark'
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
    <Card>
      <CardHeader>
        <CardMark>{preimage.hash.slice(0, 12)}…</CardMark>
        <CardTitle>{preimage.len.toLocaleString('en-US')} bytes</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-muted-foreground">Preimage deposit</span>
        <span className="font-mono font-semibold">
          {formatAmount(preimage.amount, { precision: 2 })} {symbol}
        </span>
        <span className="text-muted-foreground">from</span>
        <Beneficiary address={preimage.who} />
        {canSign && (
          <Button type="button" variant="outline" onClick={() => onClear(preimage)}>
            Clear it
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
