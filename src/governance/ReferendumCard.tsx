import { useFacts, useSymbol } from '@/chain/queries'
import { explorerReferendum } from '@/chain/config'
import { useChain } from '@/chain/provider'
import {
  approval,
  countdown,
  support,
  thresholds,
  trackLabel,
  type ProposalSpend,
  type Referendum,
  type Track,
} from '@/chain/governance'
import { CardMark } from '@/ui/CardMark'
import { Beneficiary } from './Beneficiary'
import { formatAmount } from '@/lib/balance'
import { daySpan, waitFor } from '@/lib/blocks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="text-dim">
      {label} <span className="font-semibold text-foreground">{children}</span>
    </span>
  )
}

/** What the curve asks for at this point, which the tally has to beat. */
function Needs({ percent }: { percent: number | undefined }) {
  if (percent === undefined) return null
  return <span className="font-normal text-dim">/{percent.toFixed(2)}%</span>
}

/** When the treasury lets a booking go, which is the whole point of splitting one up. */
function due(validFrom: number | null, height: number, blockSeconds: number): string {
  return validFrom == null || validFrom <= height ? 'immediately' : `in ${daySpan(validFrom - height, blockSeconds)}`
}

/**
 * What a referendum pays. One booking reads as a sentence, several read as the
 * schedule they are, since the dates are what splitting them up was for.
 */
function Spending({
  spends,
  symbol,
  height,
  blockSeconds,
}: {
  spends: ProposalSpend[]
  symbol: string
  height: number
  blockSeconds: number | undefined
}) {
  const [first] = spends
  if (spends.length === 1 && first) {
    return (
      <>
        Pay <span className="font-mono font-semibold">{formatAmount(first.amount, { precision: 2 })} {symbol}</span> to{' '}
        <Beneficiary address={first.beneficiary} />
      </>
    )
  }

  const total = spends.reduce((sum, spend) => sum + spend.amount, 0n)
  return (
    <>
      Pay <span className="font-mono font-semibold">{formatAmount(total, { precision: 2 })} {symbol}</span> over{' '}
      {spends.length} payouts
      <ul className="mt-1.5 space-y-0.5 text-[12.5px]">
        {spends.map((spend, index) => (
          <li key={index} className="text-muted-foreground">
            <span className="font-mono">{formatAmount(spend.amount, { precision: 2 })} {symbol}</span>{' '}
            to <Beneficiary address={spend.beneficiary} />
            {blockSeconds !== undefined && (
              <span className="text-dim"> {due(spend.validFrom, height, blockSeconds)}</span>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

interface CardProps {
  referendum: Referendum
  tracks: Track[] | undefined
  height: number
  /** The support curve's denominator, undefined until the chain hands it over. */
  issuance: bigint | undefined
  /** Nothing here is worth offering when no account on this page can sign. */
  canSign: boolean
  /** This page's own addresses, which is who may edit what a referendum says. */
  mine: string[]
  onVote: (referendum: Referendum) => void
  onRemoveVote: (referendum: Referendum) => void
  onDeposit: (referendum: Referendum) => void
  onEdit: (referendum: Referendum) => void
}

export function ReferendumCard({
  referendum,
  tracks,
  height,
  issuance,
  canSign,
  mine,
  onVote,
  onRemoveVote,
  onDeposit,
  onEdit,
}: CardProps) {
  const { network } = useChain()
  const symbol = useSymbol()
  const { data: facts } = useFacts()
  const proposal = referendum.proposal
  const clock = facts ? countdown(referendum, tracks, height, facts.undecidingTimeout) : null
  const needs = thresholds(referendum, tracks, height)

  return (
    <Card>
      <CardHeader>
        <CardMark>#{referendum.index}</CardMark>
        {/* The track names it while its metadata does not, which is all a
            referendum nobody titled has to go by */}
        <CardTitle>{referendum.title ?? trackLabel(tracks, referendum.track)}</CardTitle>
        <Button asChild variant="link" size="sm" className="p-0 font-normal">
          <a href={explorerReferendum(network, referendum.index)} target="_blank" rel="noopener">
            View on explorer
          </a>
        </Button>
      </CardHeader>

      <CardContent>
        {proposal.kind === 'spend' ? (
          <Spending
            spends={proposal.spends}
            symbol={symbol}
            height={height}
            blockSeconds={facts?.blockSeconds}
          />
        ) : (
          <span className="text-muted-foreground">{proposal.label}</span>
        )}
      </CardContent>

      <CardContent className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
        <Stat label="Approval">
          {approval(referendum.tally).toFixed(2)}%<Needs percent={needs?.approval} />
        </Stat>
        {issuance !== undefined && (
          <Stat label="Support">
            {support(referendum.tally, issuance).toFixed(2)}%<Needs percent={needs?.support} />
          </Stat>
        )}
        {clock && facts && (
          <Stat label={clock.label}>{waitFor(clock.blocks, facts.blockSeconds)}</Stat>
        )}
      </CardContent>

      {canSign && (
        <CardFooter>
          <Button type="button" onClick={() => onVote(referendum)}>
            Vote
          </Button>
          <Button type="button" variant="outline" onClick={() => onRemoveVote(referendum)}>
            Take back
          </Button>
          {referendum.decisionDeposit === null && (
            <Button type="button" variant="outline" onClick={() => onDeposit(referendum)}>
              Place decision deposit
            </Button>
          )}
          {mine.includes(referendum.submitter) && (
            <Button type="button" variant="outline" onClick={() => onEdit(referendum)}>
              Edit the text
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  )
}
