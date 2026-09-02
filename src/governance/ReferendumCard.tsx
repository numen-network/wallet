import { useFacts, useSymbol } from '@/chain/queries'
import { explorerReferendum } from '@/chain/config'
import { useChain } from '@/chain/provider'
import {
  approval,
  countdown,
  STATE_LABELS,
  STATE_SAYS,
  support,
  thresholds,
  trackLabel,
  type ProposalSpend,
  type Referendum,
  type Track,
} from '@/chain/governance'
import { Beneficiary } from './Beneficiary'
import { formatAmount } from '@/lib/balance'
import { daySpan, waitFor } from '@/lib/blocks'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { ExplorerIcon } from '@/ui/icons'

/** One colour a state, in the order a referendum passes through them. */
const TONE: Record<Referendum['state'], BadgeVariant> = {
  preparing: 'default',
  queued: 'warn',
  deciding: 'primary',
  confirming: 'destructive',
}

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
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[13px] font-bold text-dim">#{referendum.index}</span>
        {/* The track names it while its metadata does not, which is all a
            referendum nobody titled has to go by */}
        <a
          href={explorerReferendum(network, referendum.index)}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1 text-[13px] font-semibold hover:text-primary"
        >
          {referendum.title ?? trackLabel(tracks, referendum.track)}
          <ExplorerIcon className="size-3" />
        </a>
        <Badge variant={TONE[referendum.state]}>{STATE_LABELS[referendum.state]}</Badge>
      </div>

      {/* What the proposer wrote, which the chain has been carrying all along
          and nothing here ever showed. The whole of it, since somebody is being
          asked to vote on it and a card is not worth hiding it for */}
      {referendum.description && (
        <p className="mt-2 text-[13px] whitespace-pre-line text-muted-foreground">{referendum.description}</p>
      )}

      <div className="mt-2 text-[13.5px]">
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
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
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
      </div>

      <p className="mt-1.5 text-[12.5px] text-muted-foreground">{STATE_SAYS[referendum.state]}</p>

      {canSign && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="primary" onClick={() => onVote(referendum)}>
            Vote
          </Button>
          <Button type="button" onClick={() => onRemoveVote(referendum)}>
            Take back
          </Button>
          {referendum.decisionDeposit === null && (
            <Button type="button" onClick={() => onDeposit(referendum)}>
              Place decision deposit
            </Button>
          )}
          {mine.includes(referendum.submitter) && (
            <Button type="button" onClick={() => onEdit(referendum)}>
              Edit the text
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
