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
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { CardMark } from '@/ui/CardMark'
import { Beneficiary } from './Beneficiary'

const TONE: Partial<Record<Bounty['state'], BadgeVariant>> = {
  active: 'muted',
  pendingPayout: 'primary',
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
    <Card variant="muted" size="sm">
      <CardHeader>
        <span className="font-mono text-[12.5px] font-bold text-dim">
          #{child.parent}.{child.index}
        </span>
        <CardTitle>{child.description || 'unnamed'}</CardTitle>
        <Badge>{CHILD_LABELS[child.state]}</Badge>
        <span className="font-mono text-[12.5px]">
          {formatAmount(child.value, { precision: 0 })} {symbol}
        </span>
      </CardHeader>

      {canSign && (
        <CardFooter>
          {asked && (
            <Button type="button" variant="outline" onClick={() => onAct(child, 'accept')}>
              Take it on
            </Button>
          )}
          {held && (
            <Button type="button" variant="outline" onClick={() => onAct(child, 'award')}>
              Award it
            </Button>
          )}
          {parentCurator && child.state === 'added' && (
            <Button type="button" variant="outline" onClick={() => onAct(child, 'propose')}>
              Name a curator
            </Button>
          )}
          {(held || asked) && (
            <Button type="button" variant="outline" onClick={() => onAct(child, 'unassign')}>
              Stand down
            </Button>
          )}
          {parentCurator && child.state !== 'pendingPayout' && (
            <Button type="button" variant="outline" onClick={() => onAct(child, 'close')}>
              Close it
            </Button>
          )}
          {childClaimable(child, height) && (
            <Button type="button" onClick={() => onAct(child, 'claim')}>
              Pay it out
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
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
    <Card>
      <CardHeader>
        <CardMark>#{bounty.index}</CardMark>
        <CardTitle>{bounty.description || 'unnamed'}</CardTitle>
        <Badge variant={TONE[bounty.state] ?? 'default'}>{BOUNTY_LABELS[bounty.state]}</Badge>
      </CardHeader>

      <CardContent>
        Pays <span className="font-mono font-semibold">{amount(bounty.value)}</span>, of which{' '}
        <span className="font-mono font-semibold">{amount(bounty.fee)}</span> goes to the curator
      </CardContent>

      {bounty.curator && (
        <CardContent className="flex flex-wrap items-center gap-x-2">
          <span className="text-muted-foreground">Curated by</span>
          <Beneficiary address={bounty.curator} />
        </CardContent>
      )}

      {bounty.beneficiary && (
        <CardContent className="flex flex-wrap items-center gap-x-2">
          <span className="text-muted-foreground">Awarded to</span>
          <Beneficiary address={bounty.beneficiary} />
        </CardContent>
      )}

      {bounty.state === 'pendingPayout' && (
        <CardDescription>
          {claimable(bounty, height)
            ? 'The delay is up, so anybody may hand it over'
            : `Claimable from block ${(bounty.until ?? 0).toLocaleString('en-US')}`}
        </CardDescription>
      )}

      {canSign && (
        <CardFooter>
          {asked.length > 0 && (
            <Button type="button" onClick={() => onAct(bounty, 'accept')}>
              Take it on
            </Button>
          )}
          {held.length > 0 && (
            <>
              <Button type="button" onClick={() => onAct(bounty, 'award')}>
                Award it
              </Button>
              <Button type="button" variant="outline" onClick={() => onAct(bounty, 'extend')}>
                Extend it
              </Button>
            </>
          )}
          {(held.length > 0 || asked.length > 0) && (
            <Button type="button" variant="outline" onClick={() => onAct(bounty, 'unassign')}>
              Stand down
            </Button>
          )}
          {held.length > 0 && (
            <Button type="button" variant="outline" onClick={() => onAct(bounty, 'addChild')}>
              Split off a piece
            </Button>
          )}
          {claimable(bounty, height) && (
            <Button type="button" onClick={() => onAct(bounty, 'claim')}>
              Pay it out
            </Button>
          )}
        </CardFooter>
      )}

      {children.length > 0 && (
        <div className="grid gap-1.5 pt-1">
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
    </Card>
  )
}
