import {
  awaitsChildCurator,
  awaitsCurator,
  BOUNTY_LABELS,
  CHILD_LABELS,
  childClaimable,
  claimable,
  runsChild,
  runsIt,
  type Bounty,
  type ChildBounty,
} from '@/chain/bounties'
import { useSymbol } from '@/chain/queries'
import { formatAmount } from '@/lib/balance'
import { Button } from '@/ui/Button'
import { Beneficiary } from './Beneficiary'

const TONE: Partial<Record<Bounty['state'], string>> = {
  active: 'border-line-strong text-lead',
  pendingPayout: 'border-accent text-accent',
}

export type BountyAct = 'accept' | 'award' | 'claim' | 'unassign' | 'extend' | 'addChild'
export type ChildAct = 'accept' | 'award' | 'claim' | 'unassign' | 'propose' | 'close'

interface CardProps {
  bounty: Bounty
  children: ChildBounty[]
  height: number
  /** Every account here, since which buttons show depends on who is curator. */
  mine: string[]
  canSign: boolean
  onAct: (bounty: Bounty, call: BountyAct) => void
  onChildAct: (child: ChildBounty, call: ChildAct) => void
}

/**
 * A piece of a bounty. The parent's curator carves it out and names who runs
 * it, and that curator awards it, so nothing here waits on governance.
 */
function Child({
  child,
  height,
  mine,
  parentCurator,
  canSign,
  onAct,
}: {
  child: ChildBounty
  height: number
  mine: string[]
  parentCurator: boolean
  canSign: boolean
  onAct: (child: ChildBounty, call: ChildAct) => void
}) {
  const symbol = useSymbol()
  const held = mine.some((address) => runsChild(child, address))
  const asked = mine.some((address) => awaitsChildCurator(child, address))

  return (
    <div className="rounded-[4px] border border-line bg-recess px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12.5px] font-bold text-dim">
          #{child.parent}.{child.index}
        </span>
        <span className="text-[12.5px] font-semibold">{child.description || 'unnamed'}</span>
        <span className="text-[11px] font-bold tracking-[0.06em] text-dim uppercase">
          {CHILD_LABELS[child.state]}
        </span>
        <span className="font-mono text-[12.5px]">
          {formatAmount(child.value, { precision: 0 })} {symbol}
        </span>
      </div>

      {canSign && (
        <div className="mt-2 flex flex-wrap gap-2">
          {asked && (
            <Button type="button" onClick={() => onAct(child, 'accept')}>
              Take it on
            </Button>
          )}
          {held && (
            <Button type="button" onClick={() => onAct(child, 'award')}>
              Award it
            </Button>
          )}
          {parentCurator && child.state === 'added' && (
            <Button type="button" onClick={() => onAct(child, 'propose')}>
              Name a curator
            </Button>
          )}
          {(held || asked) && (
            <Button type="button" onClick={() => onAct(child, 'unassign')}>
              Stand down
            </Button>
          )}
          {parentCurator && child.state !== 'pendingPayout' && (
            <Button type="button" onClick={() => onAct(child, 'close')}>
              Close it
            </Button>
          )}
          {childClaimable(child, height) && (
            <Button type="button" variant="primary" onClick={() => onAct(child, 'claim')}>
              Pay it out
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The treasury pays a bounty through a curator rather than straight out. Which
 * of these buttons appears comes down to who this wallet holds, since only the
 * curator runs one and only they may hand it over.
 */
export function BountyCard({
  bounty,
  children,
  height,
  mine,
  canSign,
  onAct,
  onChildAct,
}: CardProps) {
  const symbol = useSymbol()
  const held = mine.filter((address) => runsIt(bounty, address))
  const asked = mine.filter((address) => awaitsCurator(bounty, address))
  const amount = (planck: bigint) => `${formatAmount(planck, { precision: 0 })} ${symbol}`

  return (
    <article className="rounded-[6px] border border-line bg-panel p-3.5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[13px] font-bold text-dim">#{bounty.index}</span>
        <span className="text-[13px] font-semibold">{bounty.description || 'unnamed'}</span>
        <span
          className={`rounded-full border px-[7px] py-0.5 text-[10px] font-bold tracking-[0.06em] uppercase ${
            TONE[bounty.state] ?? 'border-line-strong text-dim'
          }`}
        >
          {BOUNTY_LABELS[bounty.state]}
        </span>
      </div>

      <div className="mt-2 text-[13.5px]">
        Pays <span className="font-mono font-semibold">{amount(bounty.value)}</span>, of which{' '}
        <span className="font-mono font-semibold">{amount(bounty.fee)}</span> goes to the curator
      </div>

      {bounty.curator && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[13.5px]">
          <span className="text-lead">Curated by</span>
          <Beneficiary address={bounty.curator} />
        </div>
      )}

      {bounty.beneficiary && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[13.5px]">
          <span className="text-lead">Awarded to</span>
          <Beneficiary address={bounty.beneficiary} />
        </div>
      )}

      {bounty.state === 'pendingPayout' && (
        <p className="mt-1.5 text-[12.5px] text-dim">
          {claimable(bounty, height)
            ? 'The delay is up, so anybody may hand it over'
            : `Claimable from block ${(bounty.until ?? 0).toLocaleString('en-US')}`}
        </p>
      )}

      {canSign && (
        <div className="mt-3 flex flex-wrap gap-2">
          {asked.length > 0 && (
            <Button type="button" variant="primary" onClick={() => onAct(bounty, 'accept')}>
              Take it on
            </Button>
          )}
          {held.length > 0 && (
            <>
              <Button type="button" variant="primary" onClick={() => onAct(bounty, 'award')}>
                Award it
              </Button>
              <Button type="button" onClick={() => onAct(bounty, 'extend')}>
                Extend it
              </Button>
            </>
          )}
          {(held.length > 0 || asked.length > 0) && (
            <Button type="button" onClick={() => onAct(bounty, 'unassign')}>
              Stand down
            </Button>
          )}
          {held.length > 0 && (
            <Button type="button" onClick={() => onAct(bounty, 'addChild')}>
              Split off a piece
            </Button>
          )}
          {claimable(bounty, height) && (
            <Button type="button" variant="primary" onClick={() => onAct(bounty, 'claim')}>
              Pay it out
            </Button>
          )}
        </div>
      )}

      {children.length > 0 && (
        <div className="mt-3 grid gap-1.5">
          {children.map((child) => (
            <Child
              key={child.index}
              child={child}
              height={height}
              mine={mine}
              parentCurator={held.length > 0}
              canSign={canSign}
              onAct={onChildAct}
            />
          ))}
        </div>
      )}
    </article>
  )
}
