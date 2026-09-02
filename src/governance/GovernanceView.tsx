import { useState, type ReactNode } from 'react'
import type { Account } from '@/accounts/types'
import {
  spendState,
  SORT_LABELS,
  SORTS,
  type Held,
  type NotedPreimage,
  type Referendum,
  type Settled,
  type Sort,
  type Spend,
} from '@/chain/governance'
import { explorerGovernance } from '@/chain/config'
import { useChain } from '@/chain/provider'
import {
  useActiveIssuance,
  useBounties,
  useChildBounties,
  useHead,
  usePreimages,
  useReferenda,
  useSettled,
  useSpends,
  useTracks,
} from '@/chain/queries'
import type { AccountBalance } from '@/chain/types'
import { Empty } from '@/ui/Empty'
import { ArrowUpRight, Coins, Plus, LockOpen, Vote } from 'lucide-react'
import { PILL, Select } from '@/ui/Select'
import { SHELL } from '@/ui/shell'
import { Tabs, type TabOption } from '@/ui/Tabs'
import { ToolButton, ToolLink } from '@/ui/ToolButton'
import { voters } from './Voter'
import {
  DepositModal,
  EditTextModal,
  PayoutModal,
  PreimageModal,
  ProposeModal,
  RefundModal,
} from './ProposeModal'
import { ReferendumCard } from './ReferendumCard'
import type { Bounty, ChildBounty } from '@/chain/bounties'
import { BountyCard } from './BountyCard'
import { BountyModal, ProposeBountyModal, type BountyCall } from './BountyModal'
import { PreimageCard } from './PreimageCard'
import { ClaimAllModal, ReturnAllModal } from './SweepModal'
import { SettledCard } from './SettledCard'
import { SpendCard } from './SpendCard'
import { RemoveVoteModal, VoteManyModal, VoteModal } from './VoteModal'

type Modal =
  | { kind: 'vote'; referendum: Referendum }
  | { kind: 'removeVote'; referendum: Referendum }
  | { kind: 'deposit'; referendum: Referendum }
  | { kind: 'editText'; referendum: Referendum }
  | { kind: 'payout'; spend: Spend }
  | { kind: 'refund'; poll: number; held: Held; call: 'refundSubmission' | 'refundDecision' }
  | { kind: 'preimage'; preimage: NotedPreimage }
  | { kind: 'bounty'; target: Bounty | ChildBounty; call: BountyCall }
  | { kind: 'proposeBounty' }
  | { kind: 'propose' }
  | { kind: 'voteAll' }
  | { kind: 'claimAll' }
  | { kind: 'returnAll' }

type Tab = 'referenda' | 'spends' | 'bounties' | 'deposits'

const TABS: readonly TabOption<Tab>[] = [
  { id: 'referenda', label: 'Referenda' },
  { id: 'spends', label: 'Approved spends' },
  { id: 'bounties', label: 'Bounties' },
  { id: 'deposits', label: 'Deposits to return' },
]

const SORT_OPTIONS = Object.entries(SORT_LABELS).map(([value, label]) => ({ value, label }))

/**
 * Every track here is a spender track, so this page is the treasury's queue.
 * Nothing on it belongs to one account, which is why the account doing the
 * signing is picked inside each dialog rather than carried in from a card.
 */
export function GovernanceView({
  accounts,
  balances,
}: {
  accounts: Account[]
  balances: Record<string, AccountBalance>
}) {
  const { network } = useChain()
  const mine = accounts.map((account) => account.address)
  const { data: referenda, isPending } = useReferenda()
  const { data: tracks } = useTracks()
  const { data: spends } = useSpends()
  const { data: settled } = useSettled()
  const { data: preimages } = usePreimages(mine)
  const { data: bounties } = useBounties()
  const { data: children } = useChildBounties()
  const { data: issuance } = useActiveIssuance()
  const head = useHead()
  const [tab, setTab] = useState<Tab>('referenda')
  const [sort, setSort] = useState<Sort>('state')
  const [modal, setModal] = useState<Modal | null>(null)

  const signers = voters(accounts)
  const canSign = signers !== null
  const running = [...(referenda ?? [])].sort(SORTS[sort])
  const board = bounties ?? []
  // A spend already paid leaves a record behind that clears itself, and there
  // is nothing anybody can do about one whose window has shut
  const booked = (spends ?? []).filter(
    (spend) => spendState(spend, head?.number ?? 0) !== 'paid',
  )
  // Only a spend the window has opened on is anybody's to claim
  const ready = booked.filter((spend) => spendState(spend, head?.number ?? 0) === 'ready')
  // One tab over both, since a deposit is a deposit whatever is holding it
  const owed = [...(settled ?? []), ...(preimages ?? [])]
  const close = () => setModal(null)

  const counts: Record<Tab, number> = {
    referenda: running.length,
    spends: booked.length,
    bounties: board.length,
    deposits: owed.length,
  }

  const actions = {
    onVote: (referendum: Referendum) => setModal({ kind: 'vote', referendum }),
    onRemoveVote: (referendum: Referendum) => setModal({ kind: 'removeVote', referendum }),
    onDeposit: (referendum: Referendum) => setModal({ kind: 'deposit', referendum }),
    onEdit: (referendum: Referendum) => setModal({ kind: 'editText', referendum }),
  }

  // The row keeps every button whatever the tab shows, so idle carries the
  // reason one has nothing to do
  const pill = (label: string, icon: ReactNode, opens: Modal, idle: string | null = null) => (
    <ToolButton
      icon={icon}
      label={label}
      disabled={!canSign || idle !== null}
      title={canSign ? (idle ?? undefined) : 'No account here can sign'}
      onClick={() => setModal(opens)}
    />
  )

  return (
    <>
      <section className={`${SHELL} flex flex-wrap items-center gap-3 pt-6 pb-1.5`}>
        <Tabs
          value={tab}
          options={TABS.map((option) => ({ ...option, count: counts[option.id] }))}
          onChange={setTab}
        />
        {tab === 'referenda' && (
          <Select
            value={sort}
            onValueChange={(value) => setSort(value as Sort)}
            options={SORT_OPTIONS}
            label="Sort"
            className={PILL}
          />
        )}
        <div className="ml-auto flex flex-wrap gap-2 max-[560px]:ml-0">
          {pill('Referendum', <Plus />, { kind: 'propose' })}
          {pill('Bounty', <Plus />, { kind: 'proposeBounty' })}
          {pill(
            'Batch vote',
            <Vote />,
            { kind: 'voteAll' },
            running.length > 1 ? null : 'Too few running to vote at once',
          )}
          {pill(
            'Claim every ready spend',
            <Coins />,
            { kind: 'claimAll' },
            ready.length > 0 ? null : 'No spend is ready to claim',
          )}
          {pill(
            'Return every deposit',
            <LockOpen />,
            { kind: 'returnAll' },
            owed.length > 0 ? null : 'Nothing to hand back',
          )}
          <ToolLink
            href={explorerGovernance(network)}
            target="_blank"
            rel="noopener"
            icon={<ArrowUpRight />}
            label="Browse every referendum"
          />
        </div>
      </section>

      <main className={`${SHELL} grow pt-1.5 pb-16`}>
        {tab === 'referenda' &&
          (isPending ? (
            <Empty>Reading the chain…</Empty>
          ) : running.length === 0 ? (
            <Empty>
              Nothing is running. A referendum here asks the treasury to pay somebody, and any
              account whose identity a registrar has checked may open one.
            </Empty>
          ) : (
            <section aria-label="Running referenda" className="grid gap-2.5">
              {running.map((referendum) => (
                <ReferendumCard
                  key={referendum.index}
                  referendum={referendum}
                  tracks={tracks}
                  height={head?.number ?? 0}
                  issuance={issuance}
                  canSign={canSign}
                  mine={mine}
                  {...actions}
                />
              ))}
            </section>
          ))}

        {tab === 'spends' &&
          (booked.length === 0 ? (
            <Empty>
              Nothing to claim. A referendum that passed books its payment here, and somebody has to
              claim it before the window shuts.
            </Empty>
          ) : (
            <section aria-label="Approved spends" className="grid gap-2.5">
              {booked.map((spend) => (
                <SpendCard
                  key={spend.index}
                  spend={spend}
                  height={head?.number ?? 0}
                  canSign={canSign}
                  onPayout={(chosen) => setModal({ kind: 'payout', spend: chosen })}
                />
              ))}
            </section>
          ))}

        {tab === 'bounties' &&
          (board.length === 0 ? (
            <Empty>
              No bounties. A bounty sets treasury money aside for a job, and a curator hands it over
              once the job is done.
            </Empty>
          ) : (
            <section aria-label="Bounties" className="grid gap-2.5">
              {board.map((bounty) => (
                <BountyCard
                  key={bounty.index}
                  bounty={bounty}
                  height={head?.number ?? 0}
                  mine={accounts.map((account) => account.address)}
                  canSign={canSign}
                  children={(children ?? []).filter(
                    (child: ChildBounty) => child.parent === bounty.index,
                  )}
                  onAct={(chosen, call) => setModal({ kind: 'bounty', target: chosen, call })}
                  onChildAct={(chosen, call) => setModal({ kind: 'bounty', target: chosen, call })}
                />
              ))}
            </section>
          ))}

        {tab === 'deposits' &&
          (owed.length === 0 ? (
            <Empty>
              Nothing to hand back. A referendum that is over, or a preimage nobody points at any
              more, still holds its deposit until somebody frees it.
            </Empty>
          ) : (
            <section aria-label="Deposits to return" className="grid gap-2.5">
              {(settled ?? []).map((entry) => (
                <SettledCard
                  key={entry.index}
                  settled={entry}
                  canSign={canSign}
                  onRefundSubmission={({ index, submission }) =>
                    submission &&
                    setModal({
                      kind: 'refund',
                      poll: index,
                      held: submission,
                      call: 'refundSubmission',
                    })
                  }
                  onRefundDecision={({ index, decision }) =>
                    decision &&
                    setModal({ kind: 'refund', poll: index, held: decision, call: 'refundDecision' })
                  }
                />
              ))}
              {(preimages ?? []).map((preimage) => (
                <PreimageCard
                  key={preimage.hash}
                  preimage={preimage}
                  canSign={canSign}
                  onClear={(chosen) => setModal({ kind: 'preimage', preimage: chosen })}
                />
              ))}
            </section>
          ))}
      </main>

      {signers && modal?.kind === 'vote' && (
        <VoteModal
          referendum={modal.referendum}
          accounts={signers}
          balances={balances}
          onClose={close}
        />
      )}

      {signers && modal?.kind === 'removeVote' && (
        <RemoveVoteModal referendum={modal.referendum} accounts={signers} onClose={close} />
      )}

      {signers && modal?.kind === 'deposit' && (
        <DepositModal referendum={modal.referendum} accounts={signers} onClose={close} />
      )}

      {signers && modal?.kind === 'editText' && (
        <EditTextModal
          referendum={modal.referendum}
          preimages={preimages ?? []}
          accounts={signers}
          onClose={close}
        />
      )}

      {signers && modal?.kind === 'refund' && (
        <RefundModal
          poll={modal.poll}
          held={modal.held}
          kind={modal.call}
          accounts={signers}
          onClose={close}
        />
      )}

      {signers && modal?.kind === 'bounty' && (
        <BountyModal
          target={modal.target}
          call={modal.call}
          accounts={signers}
          onClose={close}
        />
      )}

      {signers && modal?.kind === 'proposeBounty' && (
        <ProposeBountyModal accounts={signers} onClose={close} />
      )}

      {signers && modal?.kind === 'preimage' && (
        <PreimageModal preimage={modal.preimage} accounts={signers} onClose={close} />
      )}

      {signers && modal?.kind === 'payout' && (
        <PayoutModal spend={modal.spend} accounts={signers} onClose={close} />
      )}

      {signers && modal?.kind === 'voteAll' && (
        <VoteManyModal
          referenda={running}
          accounts={signers}
          balances={balances}
          onClose={close}
        />
      )}

      {signers && modal?.kind === 'claimAll' && (
        <ClaimAllModal spends={ready} accounts={signers} onClose={close} />
      )}

      {signers && modal?.kind === 'returnAll' && (
        <ReturnAllModal
          settled={settled ?? []}
          preimages={preimages ?? []}
          accounts={signers}
          onClose={close}
        />
      )}

      {signers && modal?.kind === 'propose' && <ProposeModal accounts={signers} onClose={close} />}
    </>
  )
}
