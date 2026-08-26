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
import { Button, IconButton } from '@/ui/Button'
import { Footer } from '@/ui/Footer'
import { PlusIcon, SignalIcon, SignatureIcon, SyncIcon } from '@/ui/icons'
import { ConfirmModal, PromptModal } from '@/ui/PromptModal'
import { PILL, Select } from '@/ui/Select'
import { SHELL } from '@/ui/shell'
import { Tabs, type TabOption } from '@/ui/Tabs'
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
  | { kind: 'sign' }
  | { kind: 'bringIn'; address: string }
  | { kind: 'endpoint' }
  | { kind: 'forget'; address: string }
  | { kind: 'newGroup' }
  | { kind: 'renameGroup'; id: string }
  | { kind: 'deleteGroup'; id: string }

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

/** How much of the signal is lit, in what colour, and what to call it. */
const GRADE: Record<Quality, { bars: number; tint: string; word: string }> = {
  good: { bars: 3, tint: 'text-good', word: 'good link' },
  fair: { bars: 2, tint: 'text-warn', word: 'a slow link' },
  poor: { bars: 1, tint: 'text-bad', word: 'a bad link' },
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
        title={usingMock ? 'Nothing is connected, balances are invented' : `${network.rpc}${health}`}
        className={PILL}
      >
        <SignalIcon
          level={grade ? GRADE[grade].bars : 0}
          className={`size-3.5 shrink-0 ${grade ? GRADE[grade].tint : 'text-dim'}`}
        />
        {reach && <span className="text-dim tabular-nums">{Math.round(reach.ms)} ms</span>}
      </Select>

      <IconButton type="button" aria-label="Add an endpoint" title="Add an endpoint" onClick={onAdd}>
        <PlusIcon />
      </IconButton>

      {usingMock && (
        <span
          title="No node is attached. Every balance on this page is made up"
          className="rounded-full border border-bad px-2 py-[2px] text-[10px] font-bold tracking-[0.06em] text-bad uppercase"
        >
          mock data
        </span>
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

  return (
    <Button type="button" className="px-2.5 py-1 text-xs" onClick={add}>
      Add to MetaMask
    </Button>
  )
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
      <div className="text-[11px] font-bold tracking-[0.09em] text-dim uppercase">{label}</div>
      <div
        className={`mt-1 font-mono font-semibold tracking-tight ${
          lead ? 'text-3xl max-[560px]:text-2xl' : 'text-xl text-lead'
        }`}
      >
        {formatAmount(planck, { precision: 2 })}
        <span className={`ml-1 font-semibold ${lead ? 'text-sm text-lead' : 'text-[11px] text-dim'}`}>
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

  const selected = modal && 'address' in modal ? byAddress.get(modal.address) : undefined
  const targetGroup =
    modal && 'id' in modal ? store.layout.groups.find((group) => group.id === modal.id) : undefined

  const close = () => setModal(null)

  const deleteGroup = (id: string) => {
    store.removeGroup(id)
    toast('Group deleted')
    close()
  }

  // Stable, so a card can skip re-rendering while a drag reflows the board
  const actions = useMemo(
    () => ({
    onSend: (account: Account) => setModal({ kind: 'send', address: account.address }),
    onReceive: (account: Account) => setModal({ kind: 'receive', address: account.address }),
    onRename: (account: Account) => setModal({ kind: 'renameAccount', address: account.address }),
    onForget: (account: Account) => setModal({ kind: 'forget', address: account.address }),
    onChangePassword: (account: Account) =>
      setModal({ kind: 'changePassword', address: account.address }),
    onBackup: (account: Account) => setModal({ kind: 'backup', address: account.address }),
    onIdentity: (account: Account) => setModal({ kind: 'identity', address: account.address }),
    onJudgement: (account: Account) => setModal({ kind: 'judgement', address: account.address }),
    onClearIdentity: (account: Account) =>
      setModal({ kind: 'clearIdentity', address: account.address }),
    onQuitSub: (account: Account) => setModal({ kind: 'quitSub', address: account.address }),
    onDerive: (account: Account) => setModal({ kind: 'derive', address: account.address }),
    onDelegate: (account: Account) => setModal({ kind: 'delegate', address: account.address }),
    onUndelegate: (account: Account) => setModal({ kind: 'undelegate', address: account.address }),
    onAddProxy: (account: Account) => setModal({ kind: 'addProxy', address: account.address }),
    onRemoveProxy: (account: Account) =>
      setModal({ kind: 'removeProxy', address: account.address }),
    onUnlock: (account: Account) => setModal({ kind: 'unlock', address: account.address }),
    onPending: (account: Account) => setModal({ kind: 'pending', address: account.address }),
    onSubs: (account: Account) => setModal({ kind: 'subs', address: account.address }),
    onVesting: (account: Account) => setModal({ kind: 'vesting', address: account.address }),
    onJudge: (account: Account) => setModal({ kind: 'judge', address: account.address }),
    onSetFee: (account: Account) => setModal({ kind: 'setFee', address: account.address }),
    onBringIn: (account: Account) => setModal({ kind: 'bringIn', address: account.address }),
    }),
    [],
  )

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-panel">
        <div className={`${SHELL} flex flex-wrap items-center gap-3 py-2.5`}>
          <div className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight">
            <img src="/logo.svg" width={22} height={22} alt="" />
            Numen Wallet
          </div>

          <EndpointPicker onAdd={() => setModal({ kind: 'endpoint' })} />

          <span className="flex-1" />

          <Tabs value={view} options={VIEWS} onChange={setView} />
          <MetaMaskButton />
        </div>
      </header>

      {facts.isError && (
        <main className={`${SHELL} grow pt-20`}>
          <div className="mx-auto max-w-md rounded-[6px] border-[1.5px] border-line-strong p-10 text-center">
            <p className="text-sm font-bold text-lead">This endpoint answers for a different chain.</p>
            <p className="mt-2 text-[13px] text-dim">{(facts.error as Error).message}</p>
            <p className="mt-2 text-[13px] text-dim">Pick another endpoint from the header.</p>
          </div>
        </main>
      )}

      {!facts.isError && view === 'governance' && <GovernanceView accounts={accounts} balances={balances} />}

      {!facts.isError && view === 'activity' && <ActivityView accounts={accounts} />}

      {!facts.isError && view === 'accounts' && (
        <>
      <section className={`${SHELL} flex flex-wrap items-end gap-10 pt-6 pb-1.5 max-[560px]:gap-6`}>
        <Stat label="Total balance" planck={summary.total} lead />
        <Stat label="Transferable" planck={summary.transferable} />
        <Stat label="Locked" planck={summary.locked} />
        <Stat label="Reserved" planck={summary.reserved} />

        <div className="ml-auto flex flex-wrap gap-2 max-[560px]:ml-0">
          <ToolButton
            icon={<PlusIcon />}
            label="Account"
            onClick={() => setModal({ kind: 'add' })}
          />
          <ToolButton
            icon={<SyncIcon />}
            label="From JSON"
            onClick={() => setModal({ kind: 'fromJson' })}
          />
          <ToolButton
            icon={<PlusIcon />}
            label="Multisig"
            onClick={() => setModal({ kind: 'multisig' })}
          />
          <ToolButton
            icon={<PlusIcon />}
            label="Proxied"
            onClick={() => setModal({ kind: 'proxied' })}
          />
          <ToolButton
            icon={<SignatureIcon />}
            label="Sign/Verify"
            onClick={() => setModal({ kind: 'sign' })}
          />
          <ToolButton
            icon={<PlusIcon />}
            label="Group"
            onClick={() => setModal({ kind: 'newGroup' })}
          />
        </div>
      </section>

      <main className={`${SHELL} grow pt-1.5 pb-16`}>
        {/* A group the user just made has to show up, even with nothing in it */}
        {accounts.length === 0 && store.layout.groups.length === 1 ? (
          <div className="mt-6 rounded-[6px] border-[1.5px] border-dashed border-line-strong p-12 text-center">
            <p className="text-sm text-lead">No accounts yet.</p>
            <p className="mx-auto mt-1 max-w-[420px] text-[13px] text-dim">
              Create a key here, import one you already have, connect a browser extension, or just
              watch an address without holding its key.
            </p>
            <Button
              type="button"
              variant="primary"
              className="mt-4"
              onClick={() => setModal({ kind: 'add' })}
            >
              <PlusIcon />
              Add account
            </Button>
          </div>
        ) : (
          <AccountBoard
            groups={groups}
            byAddress={byAddress}
            balances={balances}
            actions={actions}
            onRenameGroup={(group) => setModal({ kind: 'renameGroup', id: group.id })}
            onDeleteGroup={(group) =>
              group.accounts.length === 0
                ? deleteGroup(group.id)
                : setModal({ kind: 'deleteGroup', id: group.id })
            }
          />
        )}
      </main>
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
          signers={signersFor(selected, accounts)}
          onClose={close}
        />
      )}


      {modal?.kind === 'pending' && selected && (
        <PendingModal
          account={selected}
          accounts={accounts}
          signers={signersFor(selected, accounts)}
          onClose={close}
        />
      )}

      {modal?.kind === 'subs' && selected && (
        <SubsModal
          account={selected}
          accounts={accounts}
          signers={signersFor(selected, accounts)}
          onClose={close}
        />
      )}

      {modal?.kind === 'quitSub' && selected && (
        <QuitSubModal account={selected} signers={signersFor(selected, accounts)} onClose={close} />
      )}

      {modal?.kind === 'sign' && <SignModal accounts={accounts} onClose={close} />}

      {modal?.kind === 'vesting' && selected && (
        <VestingModal
          account={selected}
          accounts={accounts}
          signers={signersFor(selected, accounts)}
          balance={balances[selected.address]}
          onClose={close}
        />
      )}

      {modal?.kind === 'judge' && selected && (
        <JudgeModal
          account={selected}
          accounts={accounts}
          signers={signersFor(selected, accounts)}
          onClose={close}
        />
      )}

      {modal?.kind === 'setFee' && selected && (
        <SetFeeModal
          account={selected}
          signers={signersFor(selected, accounts)}
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
          signers={signersFor(selected, accounts)}
          onClose={close}
        />
      )}

      {modal?.kind === 'judgement' && selected && (
        <JudgementModal
          account={selected}
          signers={signersFor(selected, accounts)}
          onClose={close}
        />
      )}

      {modal?.kind === 'clearIdentity' && selected && (
        <ClearIdentityModal
          account={selected}
          signers={signersFor(selected, accounts)}
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
          signers={signersFor(selected, accounts)}
          balance={balances[selected.address]}
          onClose={close}
        />
      )}

      {modal?.kind === 'undelegate' && selected && (
        <UndelegateModal
          account={selected}
          signers={signersFor(selected, accounts)}
          onClose={close}
        />
      )}

      {modal?.kind === 'addProxy' && selected && (
        <AddProxyModal
          account={selected}
          accounts={accounts}
          signers={signersFor(selected, accounts)}
          onClose={close}
        />
      )}

      {modal?.kind === 'removeProxy' && selected && (
        <RemoveProxyModal
          account={selected}
          signers={signersFor(selected, accounts)}
          onClose={close}
        />
      )}

      {modal?.kind === 'unlock' && selected && (
        <UnlockModal
          account={selected}
          signers={signersFor(selected, accounts)}
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
    </>
  )
}
