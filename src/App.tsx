import { useEffect, useMemo, useState } from 'react'
import { usingMock } from '@/chain'
import { EndpointModal } from '@/chain/EndpointModal'
import { RefusalModal } from '@/chain/RefusalModal'
import { useChain } from '@/chain/provider'
import { useBalances, useFacts, useHead, useReach } from '@/chain/queries'
import { quality, type Quality } from '@/chain/reach'
import { lockedOf, totalOf } from '@/chain/types'
import { addToMetaMask, metaMask, refusalMessage, wasRejected } from '@/evm/metamask'
import { formatAmount } from '@/lib/balance'
import { plural } from '@/lib/plural'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { CAPTION } from '@/components/ui/field'
import { Footer } from '@/ui/Footer'
import WalletMetamask from '@web3icons/react/icons/wallets/WalletMetamask'
import {
  type LucideIcon,
  Plus,
  RefreshCw,
  Signature,
  SignalHigh,
  SignalLow,
  SignalMedium,
  SignalZero,
} from 'lucide-react'
import { ConfirmModal, PromptModal } from '@/ui/PromptModal'
import { Select } from '@/ui/Select'
import { SHELL } from '@/ui/shell'
import { TabBar, TabPanel, Tabs, type TabOption } from '@/ui/Tabs'
import { Tip } from '@/ui/Tip'
import { ToolButton } from '@/ui/ToolButton'
import { ToastHost, toast, toastProblem } from '@/ui/Toast'
import { AccountBoard } from '@/accounts/AccountBoard'
import { AddAccountModal } from '@/accounts/AddAccountModal'
import { FromJsonModal } from '@/accounts/FromJsonModal'
import { ActivityView } from '@/accounts/ActivityView'
import { BackupModal } from '@/accounts/BackupModal'
import { DelegateModal, UndelegateModal } from '@/accounts/DelegateModal'
import { DeriveModal } from '@/accounts/DeriveModal'
import { ClearIdentityModal, IdentityModal } from '@/accounts/IdentityModal'
import { JudgementModal } from '@/accounts/JudgementModal'
import { AddProxyModal, RemoveProxyModal } from '@/accounts/ProxyModal'
import { ForgetModal } from '@/accounts/ForgetModal'
import { MultisigModal } from '@/accounts/MultisigModal'
import { PasswordModal } from '@/accounts/PasswordModal'
import { PendingModal } from '@/accounts/PendingModal'
import { ProxiedModal } from '@/accounts/ProxiedModal'
import { QuitSubModal, SubsModal } from '@/accounts/SubsModal'
import { SignModal } from '@/accounts/SignModal'
import { VestingModal } from '@/accounts/VestingModal'
import { BringInModal } from '@/accounts/BringInModal'
import { ReceiveModal } from '@/accounts/ReceiveModal'
import { JudgeModal, SetFeeModal } from '@/accounts/JudgeModal'
import { SendModal } from '@/accounts/SendModal'
import { UnlockModal } from '@/accounts/UnlockModal'
import { GovernanceView } from '@/governance/GovernanceView'
import { isSystemGroup, UNGROUPED_ID } from '@/accounts/layout'
import { useAccountsStore } from '@/accounts/store'
import { useAccounts } from '@/accounts/useAccounts'
import { signersFor, type Account } from '@/accounts/types'
import type { CardAction } from '@/accounts/AccountCard'

type Modal =
  | { kind: 'add' }
  | { kind: 'fromJson' }
  | { kind: 'multisig' }
  | { kind: 'proxied' }
  | { kind: 'send'; address: string }
  | { kind: 'receive'; address: string }
  | { kind: 'renameAccount'; address: string }
  | { kind: 'changePassword'; address: string }
  | { kind: 'backup'; address: string }
  | { kind: 'identity'; address: string }
  | { kind: 'judgement'; address: string }
  | { kind: 'clearIdentity'; address: string }
  | { kind: 'quitSub'; address: string }
  | { kind: 'derive'; address: string }
  | { kind: 'delegate'; address: string }
  | { kind: 'undelegate'; address: string }
  | { kind: 'addProxy'; address: string }
  | { kind: 'removeProxy'; address: string }
  | { kind: 'unlock'; address: string }
  | { kind: 'pending'; address: string }
  | { kind: 'subs'; address: string }
  | { kind: 'vesting'; address: string }
  | { kind: 'judge'; address: string }
  | { kind: 'setFee'; address: string }
  | { kind: 'sign'; address?: string }
  | { kind: 'bringIn'; address: string }
  | { kind: 'endpoint' }
  | { kind: 'forget'; address: string }
  | { kind: 'newGroup' }
  | { kind: 'renameGroup'; id: string }
  | { kind: 'deleteGroup'; id: string }

/** How much of the signal is lit, in what colour, and what to call it. */
const GRADE: Record<Quality, { lit: LucideIcon; tint: string; word: string }> = {
  good: { lit: SignalHigh, tint: 'text-good', word: 'good link' },
  fair: { lit: SignalMedium, tint: 'text-warn', word: 'a slow link' },
  poor: { lit: SignalLow, tint: 'text-destructive', word: 'a bad link' },
}

const SIGNAL_BOX = '-2.5 2 24 24'

/**
 * The lit bars over all of them faint, so what is missing reads as clearly as
 * what is there. The box hangs off centre because the glyph does, Lucide draws
 * the bars into the bottom left of it and centring the box would leave them low
 * and left of whatever sits beside them.
 */
function SignalBars({ lit: Lit, className }: { lit: LucideIcon; className: string }) {
  const layer = 'col-start-1 row-start-1 size-full'

  return (
    <span className={cn('grid', className)}>
      <SignalHigh viewBox={SIGNAL_BOX} className={cn(layer, 'opacity-25')} strokeWidth={2.6} />
      <Lit viewBox={SIGNAL_BOX} className={layer} strokeWidth={2.6} />
    </span>
  )
}

/** Which node the wallet talks to, whether it shipped with one or was told. */
function EndpointPicker({ onAdd }: { onAdd: () => void }) {
  const { network, networks, setNetwork } = useChain()
  const head = useHead()
  const { data: reach } = useReach()
  // The mock issues blocks too, so an arriving head proves nothing about a node
  const connected = !usingMock && head !== null
  const grade = connected && reach ? quality(reach) : null
  // The pill has room for the bars and a number, the rest of it goes on hover
  const health = reach
    ? `, ${GRADE[grade ?? 'poor'].word}, ${plural(reach.peers, 'peer')}${
        reach.syncing ? ', still catching up' : ''
      }`
    : ''

  return (
    <>
      <Select
        value={network.id}
        onValueChange={setNetwork}
        options={networks.map((option) => ({ value: option.id, label: option.name }))}
        label="RPC endpoint"
        hint={usingMock ? 'Nothing is connected, balances are invented' : `${network.rpc}${health}`}
        variant="pill"
      >
        <SignalBars
          lit={grade ? GRADE[grade].lit : SignalZero}
          className={`size-3.5 shrink-0 ${grade ? GRADE[grade].tint : 'text-dim'}`}
        />
        {reach && <span className="text-dim tabular-nums">{Math.round(reach.ms)} ms</span>}
      </Select>

      <Tip text="Add an endpoint">
        <Button type="button" variant="ghost" size="icon" aria-label="Add an endpoint" onClick={onAdd}>
          <Plus />
        </Button>
      </Tip>

      {usingMock && (
        <Tip text="No node is attached. Every balance on this page is made up">
          <Badge variant="destructive">
            mock data
          </Badge>
        </Tip>
      )}
    </>
  )
}

/**
 * The EVM side of Numen is MetaMask's job. One click hands it the network so
 * the wallet never has to carry a second signing stack.
 */
function MetaMaskButton() {
  const { network } = useChain()
  const { data: facts } = useFacts()
  const [present, setPresent] = useState(false)

  useEffect(() => setPresent(metaMask() !== null), [])
  if (!present || !facts) return null

  const add = () =>
    addToMetaMask(network, facts).then(
      () => toast(`${network.name} added to MetaMask`),
      (error: unknown) => {
        if (!wasRejected(error)) toastProblem(refusalMessage(error, network))
      },
    )

  return <ToolButton icon={<WalletMetamask className="size-5" />} label="Add to MetaMask" onClick={add} />
}

type View = 'accounts' | 'governance' | 'activity'

/**
 * Three pages is not enough to be worth a router, and a wallet that puts its
 * address in the URL is a wallet that leaks which account somebody holds.
 */
const VIEWS: TabOption<View>[] = [
  { id: 'accounts', label: 'Accounts' },
  { id: 'governance', label: 'Governance' },
  { id: 'activity', label: 'Activity' },
]

function Stat({ label, planck, lead = false }: { label: string; planck: bigint; lead?: boolean }) {
  const { data: facts } = useFacts()

  return (
    <div>
      <div className={CAPTION}>{label}</div>
      <div
        className={`mt-1 font-mono font-semibold tracking-tight ${
          lead ? 'text-3xl max-[560px]:text-2xl' : 'text-xl text-muted-foreground'
        }`}
      >
        {formatAmount(planck, { precision: 2 })}
        <span className={`ml-1 font-semibold ${lead ? 'text-sm text-muted-foreground' : 'text-[11px] text-dim'}`}>
          {facts?.symbol ?? ''}
        </span>
      </div>
    </div>
  )
}

export function App() {
  const { accounts, byAddress, groups, connectExtension } = useAccounts()
  const store = useAccountsStore()
  const [modal, setModal] = useState<Modal | null>(null)
  const [view, setView] = useState<View>('accounts')

  const addresses = useMemo(() => accounts.map((account) => account.address), [accounts])
  const balances = useBalances(addresses)
  const facts = useFacts()

  const summary = accounts.reduce(
    (totals, account) => {
      const balance = balances[account.address]
      if (!balance) return totals
      return {
        total: totals.total + totalOf(balance),
        transferable: totals.transferable + balance.transferable,
        locked: totals.locked + balance.locked,
        reserved: totals.reserved + balance.reserved,
      }
    },
    { total: 0n, transferable: 0n, locked: 0n, reserved: 0n },
  )

  const selected =
    modal && 'address' in modal && modal.address ? byAddress.get(modal.address) : undefined
  const signers = selected ? signersFor(selected, accounts) : []
  const targetGroup =
    modal && 'id' in modal ? store.layout.groups.find((group) => group.id === modal.id) : undefined

  const close = () => setModal(null)

  const deleteGroup = (id: string) => {
    store.removeGroup(id)
    toast('Group deleted')
    close()
  }

  // Stable, so a card can skip re-rendering while a drag reflows the board
  const open = useMemo(
    () => (action: CardAction, account: Account) =>
      setModal({ kind: action, address: account.address }),
    [],
  )

  return (
    <Tabs value={view} onChange={setView}>
      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <div className={`${SHELL} flex flex-wrap items-center gap-3 py-2.5`}>
          <div className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight">
            <img src="/logo.svg" width={22} height={22} alt="" />
            Numen Wallet
          </div>

          <EndpointPicker onAdd={() => setModal({ kind: 'endpoint' })} />

          <span className="flex-1" />

          <TabBar options={VIEWS} />
          <MetaMaskButton />
        </div>
      </header>

      {facts.isError ? (
        <main className={`${SHELL} grow pt-20`}>
          <Empty className="mx-auto mt-0 max-w-md border-solid">
            <EmptyHeader>
              <EmptyTitle className="font-bold">This endpoint answers for a different chain.</EmptyTitle>
              <EmptyDescription>{(facts.error as Error).message}</EmptyDescription>
              <EmptyDescription>Pick another endpoint from the header.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </main>
      ) : (
        <>
          <TabPanel value="governance">
            <GovernanceView accounts={accounts} balances={balances} />
          </TabPanel>

          <TabPanel value="activity">
            <ActivityView accounts={accounts} />
          </TabPanel>

          <TabPanel value="accounts">
      <section className={`${SHELL} flex flex-wrap items-end gap-10 pt-6 pb-1.5 max-[560px]:gap-6`}>
        <Stat label="Total balance" planck={summary.total} lead />
        <Stat label="Transferable" planck={summary.transferable} />
        <Stat label="Locked" planck={summary.locked} />
        <Stat label="Reserved" planck={summary.reserved} />

        <div className="ml-auto flex flex-wrap gap-2 max-[560px]:ml-0">
          <ToolButton
            icon={<Plus />}
            label="Account"
            onClick={() => setModal({ kind: 'add' })}
          />
          <ToolButton
            icon={<RefreshCw />}
            label="From JSON"
            onClick={() => setModal({ kind: 'fromJson' })}
          />
          <ToolButton
            icon={<Plus />}
            label="Multisig"
            onClick={() => setModal({ kind: 'multisig' })}
          />
          <ToolButton
            icon={<Plus />}
            label="Proxied"
            onClick={() => setModal({ kind: 'proxied' })}
          />
          <ToolButton
            icon={<Signature />}
            label="Sign/Verify"
            onClick={() => setModal({ kind: 'sign' })}
          />
          <ToolButton
            icon={<Plus />}
            label="Group"
            onClick={() => setModal({ kind: 'newGroup' })}
          />
        </div>
      </section>

      <main className={`${SHELL} grow pt-1.5 pb-16`}>
        {/* A group the user just made has to show up, even with nothing in it */}
        {accounts.length === 0 && store.layout.groups.length === 1 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No accounts yet.</EmptyTitle>
              <EmptyDescription>
                Create a key here, import one you already have, connect a browser extension, or
                just watch an address without holding its key.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" onClick={() => setModal({ kind: 'add' })}>
                <Plus />
                Add account
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <AccountBoard
            groups={groups}
            byAddress={byAddress}
            balances={balances}
            open={open}
            onRenameGroup={(group) => setModal({ kind: 'renameGroup', id: group.id })}
            onDeleteGroup={(group) =>
              group.accounts.length === 0
                ? deleteGroup(group.id)
                : setModal({ kind: 'deleteGroup', id: group.id })
            }
          />
        )}
      </main>
          </TabPanel>
        </>
      )}

      <Footer />

      {modal?.kind === 'add' && (
        <AddAccountModal connectExtension={connectExtension} onClose={close} />
      )}

      {modal?.kind === 'fromJson' && <FromJsonModal onClose={close} />}

      {modal?.kind === 'multisig' && <MultisigModal accounts={accounts} onClose={close} />}

      {modal?.kind === 'proxied' && <ProxiedModal accounts={accounts} onClose={close} />}

      {modal?.kind === 'send' && selected && (
        <SendModal
          account={selected}
          accounts={accounts}
          balance={balances[selected.address]}
          signers={signers}
          onClose={close}
        />
      )}


      {modal?.kind === 'pending' && selected && (
        <PendingModal
          account={selected}
          accounts={accounts}
          signers={signers}
          onClose={close}
        />
      )}

      {modal?.kind === 'subs' && selected && (
        <SubsModal
          account={selected}
          accounts={accounts}
          signers={signers}
          onClose={close}
        />
      )}

      {modal?.kind === 'quitSub' && selected && (
        <QuitSubModal account={selected} signers={signers} onClose={close} />
      )}

      {modal?.kind === 'sign' && (
        <SignModal accounts={accounts} initial={modal.address} onClose={close} />
      )}

      {modal?.kind === 'vesting' && selected && (
        <VestingModal
          account={selected}
          accounts={accounts}
          signers={signers}
          balance={balances[selected.address]}
          onClose={close}
        />
      )}

      {modal?.kind === 'judge' && selected && (
        <JudgeModal
          account={selected}
          accounts={accounts}
          signers={signers}
          onClose={close}
        />
      )}

      {modal?.kind === 'setFee' && selected && (
        <SetFeeModal
          account={selected}
          signers={signers}
          onClose={close}
        />
      )}

      {modal?.kind === 'bringIn' && selected && (
        <BringInModal account={selected} accounts={accounts} onClose={close} />
      )}

      {modal?.kind === 'receive' && selected && (
        <ReceiveModal account={selected} onClose={close} />
      )}

      {modal?.kind === 'renameAccount' && selected && (
        <PromptModal
          title="Rename this account"
          label="Name"
          initial={selected.name}
          submitLabel="Save"
          onClose={close}
          onSubmit={(name) => store.renameAccount(selected.address, name)}
        />
      )}

      {modal?.kind === 'changePassword' && selected && (
        <PasswordModal account={selected} onClose={close} />
      )}

      {modal?.kind === 'backup' && selected && (
        <BackupModal account={selected} onClose={close} />
      )}

      {modal?.kind === 'identity' && selected && (
        <IdentityModal
          account={selected}
          signers={signers}
          onClose={close}
        />
      )}

      {modal?.kind === 'judgement' && selected && (
        <JudgementModal
          account={selected}
          signers={signers}
          onClose={close}
        />
      )}

      {modal?.kind === 'clearIdentity' && selected && (
        <ClearIdentityModal
          account={selected}
          signers={signers}
          onClose={close}
        />
      )}

      {modal?.kind === 'derive' && selected && (
        <DeriveModal account={selected} onClose={close} />
      )}

      {modal?.kind === 'delegate' && selected && (
        <DelegateModal
          account={selected}
          accounts={accounts}
          signers={signers}
          balance={balances[selected.address]}
          onClose={close}
        />
      )}

      {modal?.kind === 'undelegate' && selected && (
        <UndelegateModal
          account={selected}
          signers={signers}
          onClose={close}
        />
      )}

      {modal?.kind === 'addProxy' && selected && (
        <AddProxyModal
          account={selected}
          accounts={accounts}
          signers={signers}
          onClose={close}
        />
      )}

      {modal?.kind === 'removeProxy' && selected && (
        <RemoveProxyModal
          account={selected}
          signers={signers}
          onClose={close}
        />
      )}

      {modal?.kind === 'unlock' && selected && (
        <UnlockModal
          account={selected}
          signers={signers}
          onClose={close}
        />
      )}

      {modal?.kind === 'endpoint' && <EndpointModal onClose={close} />}

      {modal?.kind === 'forget' && selected && (
        <ForgetModal account={selected} onClose={close} />
      )}

      {modal?.kind === 'newGroup' && (
        <PromptModal
          title="New group"
          label="Name"
          submitLabel="Create"
          onClose={close}
          onSubmit={(name) => store.addGroup(name)}
        />
      )}

      {modal?.kind === 'renameGroup' && targetGroup && (
        <PromptModal
          title="Rename group"
          label="Name"
          initial={targetGroup.name}
          submitLabel="Save"
          onClose={close}
          onSubmit={(name) => store.renameGroup(targetGroup.id, name)}
        />
      )}

      {modal?.kind === 'deleteGroup' && targetGroup && !isSystemGroup(targetGroup) && (
        <ConfirmModal
          title="Delete group"
          submitLabel="Delete"
          onClose={close}
          onConfirm={() => deleteGroup(targetGroup.id)}
        >
          {plural(targetGroup.accounts.length, 'account')} will move to{' '}
          {store.layout.groups.find((group) => group.id === UNGROUPED_ID)?.name}.
        </ConfirmModal>
      )}

      <RefusalModal />
      <ToastHost />
    </Tabs>
  )
}
