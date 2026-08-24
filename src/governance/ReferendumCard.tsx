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
  type Referendum,
  type Track,
} from '@/chain/governance'
import { Beneficiary } from './Beneficiary'
import { formatAmount } from '@/lib/balance'
import { waitFor } from '@/lib/blocks'
import { Button } from '@/ui/Button'
import { ExplorerIcon } from '@/ui/icons'

/** One colour a state, in the order a referendum passes through them. */
const TONE: Record<Referendum['state'], string> = {
  preparing: 'border-line-strong text-dim',
  queued: 'border-warn-deep text-warn-deep',
  deciding: 'border-accent text-accent',
  confirming: 'border-bad text-bad',
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="text-dim">
      {label} <span className="font-semibold text-ink">{children}</span>
    </span>
  )
}

/** What the curve asks for at this point, which the tally has to beat. */
function Needs({ percent }: { percent: number | undefined }) {
  if (percent === undefined) return null
  return <span className="font-normal text-dim">/{percent.toFixed(2)}%</span>
}

interface CardProps {
  referendum: Referendum
  tracks: Track[] | undefined
  height: number
  /** The support curve's denominator, undefined until the chain hands it over. */
  issuance: bigint | undefined
  /** Nothing here is worth offering when no account on this page can sign. */
  canSign: boolean
  onVote: (referendum: Referendum) => void
  onRemoveVote: (referendum: Referendum) => void
  onDeposit: (referendum: Referendum) => void
}

export function ReferendumCard({
  referendum,
  tracks,
  height,
  issuance,
  canSign,
  onVote,
  onRemoveVote,
  onDeposit,
}: CardProps) {
  const { network } = useChain()
  const symbol = useSymbol()
  const { data: facts } = useFacts()
  const proposal = referendum.proposal
  const clock = facts ? countdown(referendum, tracks, height, facts.undecidingTimeout) : null
  const needs = thresholds(referendum, tracks, height)

  return (
    <article className="rounded-[6px] border border-line bg-panel p-3.5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[13px] font-bold text-dim">#{referendum.index}</span>
        {/* The track names it while its metadata does not, which is all a
            referendum nobody titled has to go by */}
        <a
          href={explorerReferendum(network, referendum.index)}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1 text-[13px] font-semibold hover:text-accent"
        >
          {referendum.title ?? trackLabel(tracks, referendum.track)}
          <ExplorerIcon className="size-3" />
        </a>
        <span
          className={`rounded-full border px-[7px] py-0.5 text-[10px] font-bold tracking-[0.06em] uppercase ${TONE[referendum.state]}`}
        >
          {STATE_LABELS[referendum.state]}
        </span>
      </div>

      {/* What the proposer wrote, which the chain has been carrying all along
          and nothing here ever showed. The whole of it, since somebody is being
          asked to vote on it and a card is not worth hiding it for */}
      {referendum.description && (
        <p className="mt-2 text-[13px] whitespace-pre-line text-lead">{referendum.description}</p>
      )}

      <div className="mt-2 text-[13.5px]">
        {proposal.kind === 'spend' ? (
          <>
            Pay{' '}
            <span className="font-mono font-semibold">
              {formatAmount(proposal.amount, { precision: 2 })} {symbol}
            </span>{' '}
            to <Beneficiary address={proposal.beneficiary} />
          </>
        ) : (
          <span className="text-lead">{proposal.label}</span>
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

      <p className="mt-1.5 text-[12.5px] text-lead">{STATE_SAYS[referendum.state]}</p>

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
        </div>
      )}
    </article>
  )
}
