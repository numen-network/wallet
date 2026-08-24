import { memo, type ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { AccountBalance } from '@/chain/types'
import { lockedOf, totalOf, ZERO_BALANCE } from '@/chain/types'
import { backing, labelOf, pendingWith, type Standing } from '@/chain/identity'
import { IdentityVerdict } from './IdentityVerdict'
import { useRegistrars, useStanding, useSymbol } from '@/chain/queries'
import { shorten, shortenEvm } from '@/lib/address'
import { formatAmount } from '@/lib/balance'
import { useChain } from '@/chain/provider'
import { metaMask } from '@/evm/metamask'
import { Button } from '@/ui/Button'
import { CopyButton } from '@/ui/CopyButton'
import { DECIMALS, explorerAccount } from '@/chain/config'
import {
  AwardIcon,
  BanIcon,
  BranchIcon,
  BringInIcon,
  CoinsIcon,
  DelegateIcon,
  DriveIcon,
  ExplorerIcon,
  EyeIcon,
  IdIcon,
  KeyIcon,
  MultisigIcon,
  PencilIcon,
  PiggyIcon,
  ProxiedIcon,
  PuzzleIcon,
  SaveIcon,
  SealIcon,
  TrashIcon,
  UnlockIcon,
} from '@/ui/icons'
import { Identicon } from '@/ui/Identicon'
import { Menu, type MenuSection } from '@/ui/Menu'
import { canSend, type Account } from './types'

export interface CardActions {
  onSend: (account: Account) => void
  onReceive: (account: Account) => void
  onRename: (account: Account) => void
  onForget: (account: Account) => void
  onBackup: (account: Account) => void
  onChangePassword: (account: Account) => void
  onIdentity: (account: Account) => void
  onJudgement: (account: Account) => void
  onJudge: (account: Account) => void
  onSetFee: (account: Account) => void
  onClearIdentity: (account: Account) => void
  onQuitSub: (account: Account) => void
  onDerive: (account: Account) => void
  onDelegate: (account: Account) => void
  onUndelegate: (account: Account) => void
  onAddProxy: (account: Account) => void
  onRemoveProxy: (account: Account) => void
  onUnlock: (account: Account) => void
  onPending: (account: Account) => void
  onSubs: (account: Account) => void
  onVesting: (account: Account) => void
  onBringIn: (account: Account) => void
}

interface CardProps extends CardActions {
  account: Account
  balance: AccountBalance | undefined
}

/** What kind of account this is, when it is not simply one the wallet can sign for. */
const WATCHING = { icon: <EyeIcon />, label: 'watch' }

const BADGES: Partial<Record<Account['source'], { icon: ReactNode; label: string }>> = {
  keystore: { icon: <DriveIcon />, label: 'local' },
  extension: { icon: <PuzzleIcon />, label: 'extension' },
  multisig: { icon: <MultisigIcon className="size-3" />, label: 'multisig' },
  proxied: { icon: <ProxiedIcon className="size-3" />, label: 'proxied' },
  watch: WATCHING,
}

/** One pill on the name row, saying where the account came from. */
function Badge({ icon, label, title }: { icon: ReactNode; label: string; title?: string | undefined }) {
  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line-strong px-[7px] py-0.5 text-[10px] font-bold tracking-[0.06em] text-lead uppercase"
    >
      {icon}
      {label}
    </span>
  )
}

const CANNOT_SEND: Partial<Record<Account['source'], string>> = {
  multisig: 'No signatory of this multisig is in this wallet',
  proxied: 'The account it acts through is not in this wallet',
  watch: 'Watch only account',
}

/**
 * Text somebody may want to pick out by hand. The card is one big drag handle,
 * and a drag and a selection are the same gesture, so whatever a person reads
 * has to opt out of the drag to become selectable at all.
 */
const PICKABLE = 'cursor-text select-text'

/**
 * What the chain says this account is, which is not what the wallet calls it.
 * The verdict is the whole point, so it leads, and whether the account clears
 * the standard governance and validator entry gate on hangs off the same mark.
 */
function IdentityMark({ standing }: { standing: Standing }) {
  // A flex gap counts elements rather than their width, so an account no
  // registrar has ever seen would leave an empty span here and push the address
  // out of line with the name above it
  if (!backing(standing)) return null

  const name = labelOf(standing)

  return (
    <span data-nodrag className={`flex min-w-0 shrink items-center gap-1 ${PICKABLE}`}>
      <IdentityVerdict standing={standing} />
      {/* Four cards to a row leaves a long name truncated, so it is reachable */}
      {name && (
        <span title={name} className="truncate text-[12.5px] font-semibold">
          {name}
        </span>
      )}
    </span>
  )
}

/** Only the EVM row is labelled, the Numen address is the one the card is about. */
function AddressRow({
  kind,
  label,
  full,
  short,
  explorer,
  children,
}: {
  kind: string
  label?: string
  full: string
  short: string
  explorer?: string
  children?: ReactNode
}) {
  return (
    <div className="mt-px flex items-center gap-1.5 text-lead">
      {children}
      {label && (
        <span className="shrink-0 text-[9.5px] font-semibold tracking-[0.07em] text-dim uppercase">
          {label}
        </span>
      )}
      <span data-nodrag className={`shrink-0 font-mono text-[12.5px] ${PICKABLE}`}>
        {short}
      </span>
      <CopyButton text={full} label={`Copy ${kind} address`} />
      {explorer && (
        // A new tab, since the wallet has nothing to index history with and no
        // business holding a worse copy of what the explorer already shows
        <a
          data-nodrag
          href={explorer}
          target="_blank"
          rel="noopener"
          title="View on the explorer"
          aria-label="View on the explorer"
          className="grid place-items-center rounded p-0.5 text-dim hover:text-ink"
        >
          <ExplorerIcon />
        </a>
      )}
    </div>
  )
}

function CardBody({
  account,
  balance,
  onSend,
  onReceive,
  onRename,
  onForget,
  onBackup,
  onChangePassword,
  onIdentity,
  onJudgement,
  onJudge,
  onSetFee,
  onClearIdentity,
  onQuitSub,
  onDerive,
  onDelegate,
  onUndelegate,
  onAddProxy,
  onRemoveProxy,
  onUnlock,
  onPending,
  onSubs,
  onVesting,
  onBringIn,
}: CardProps) {
  const { network } = useChain()
  const symbol = useSymbol()
  const { data: standing } = useStanding(account.address)
  const { data: registrars } = useRegistrars()
  // An account whose balance has not landed yet reads as an empty one, since
  // that is what an empty account looks like and a dash only reads as broken
  const holdings = balance ?? ZERO_BALANCE
  const local = account.source === 'keystore'
  const badge = BADGES[account.source]
  // A multisig or a proxied account nobody here can sign for is watched and
  // nothing else. The menu says as much by leaving items out, which reads as
  // missing rather than as locked, so the card says it in a word
  const watched = account.source !== 'watch' && !canSend(account)
  // The menu writes to this account's own record, so a parent's is no answer here
  const identity = standing?.own ?? null
  const asked = pendingWith(identity) !== null
  // Without MetaMask nothing can sign the EVM side, so the door stays shut
  const evm = metaMask() !== null
  // Which registrar this account is, if the chain lists it as one
  const seat = registrars?.find((entry) => entry.account === account.address)

  // Everything the chain records about who holds this account, its own and
  // anybody else's. An account with none of it gets no heading for it
  const identityItems = [
    ...(canSend(account)
      ? [
          {
            label: identity ? 'Edit the on chain identity' : 'Set an on chain identity',
            icon: <IdIcon />,
            onSelect: () => onIdentity(account),
          },
        ]
      : []),
    ...(canSend(account) && identity
      ? [
          {
            label: asked ? 'Withdraw the request' : 'Ask a registrar',
            icon: <SealIcon className="size-3.5" />,
            onSelect: () => onJudgement(account),
          },
          {
            label: 'Sub accounts',
            icon: <AwardIcon />,
            onSelect: () => onSubs(account),
          },
          {
            label: 'Clear on chain identity',
            icon: <TrashIcon />,
            onSelect: () => onClearIdentity(account),
          },
        ]
      : []),
    // A parent has no say in being dropped, and a multisig gets named a sub as
    // easily as anything else, so this one takes whoever can sign for it
    ...(canSend(account) && standing?.sub
      ? [
          {
            label: 'Reject the parent identity',
            icon: <BanIcon />,
            onSelect: () => onQuitSub(account),
          },
        ]
      : []),
  ]

  // The other side of the counter, judging and pricing the work. Only an
  // account the chain has on its registrar list gets the heading
  const registrarItems = seat
    ? [
        {
          label: 'Judge an identity',
          icon: <SealIcon className="size-3.5" />,
          onSelect: () => onJudge(account),
        },
        {
          label: 'Set the judgement fee',
          icon: <CoinsIcon />,
          onSelect: () => onSetFee(account),
        },
      ]
    : []

  const menu: MenuSection[] = [
    {
      label: 'Account',
      items: [
        { label: 'Rename this account', icon: <PencilIcon />, onSelect: () => onRename(account) },
        ...(local
          ? [
              {
                label: 'Change password',
                icon: <KeyIcon className="size-3.5" />,
                onSelect: () => onChangePassword(account),
              },
              {
                label: 'Create a backup file',
                icon: <SaveIcon />,
                onSelect: () => onBackup(account),
              },
            ]
          : []),
        ...(account.multisig
          ? [
              {
                label: 'Multisig approvals',
                icon: <MultisigIcon className="size-3.5" />,
                onSelect: () => onPending(account),
              },
            ]
          : []),
        ...(local
          ? [
              {
                label: 'Derive an account',
                icon: <BranchIcon />,
                onSelect: () => onDerive(account),
              },
            ]
          : []),
        ...(canSend(account)
          ? [
              {
                label: 'Vesting',
                icon: <PiggyIcon />,
                onSelect: () => onVesting(account),
              },
            ]
          : []),
      ],
    },
    ...(evm
      ? [
          {
            label: 'EVM',
            items: [
              {
                label: 'Bring in from MetaMask',
                icon: <BringInIcon />,
                onSelect: () => onBringIn(account),
              },
            ],
          },
        ]
      : []),
    ...(identityItems.length > 0 ? [{ label: 'Identity', items: identityItems }] : []),
    ...(registrarItems.length > 0 ? [{ label: 'Registrar', items: registrarItems }] : []),
    ...(canSend(account)
      ? [
          {
            label: 'Delegate',
            items: [
              {
                label: 'Delegate votes',
                icon: <DelegateIcon />,
                onSelect: () => onDelegate(account),
              },
              {
                label: 'Take a delegation back',
                icon: <DelegateIcon />,
                onSelect: () => onUndelegate(account),
              },
              {
                label: 'Add proxy',
                icon: <ProxiedIcon />,
                onSelect: () => onAddProxy(account),
              },
              {
                label: 'Remove proxy',
                icon: <ProxiedIcon />,
                onSelect: () => onRemoveProxy(account),
              },
              {
                label: 'Release vote locks',
                icon: <UnlockIcon />,
                onSelect: () => onUnlock(account),
              },
            ],
          },
        ]
      : []),
    {
      items: [
        {
          label: 'Forget this account',
          icon: <TrashIcon />,
          danger: true,
          onSelect: () => onForget(account),
        },
      ],
    },
  ]

  return (
    <>
      <div className="flex items-center gap-2.5">
        <Identicon address={account.address} />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-[7px]">
            <span data-nodrag className={`truncate text-[15px] font-semibold ${PICKABLE}`}>
              {account.name}
            </span>
            {badge && <Badge {...badge} />}
            {watched && <Badge {...WATCHING} title={CANNOT_SEND[account.source]} />}
          </div>

          <AddressRow
            kind="Numen"
            full={account.address}
            short={shorten(account.address)}
            explorer={explorerAccount(network, account.address)}
          >
            {standing && <IdentityMark standing={standing} />}
          </AddressRow>
          {account.evmAddress && (
            <AddressRow
              kind="EVM"
              label="EVM"
              full={account.evmAddress}
              short={shortenEvm(account.evmAddress)}
            />
          )}
        </div>


        <Menu label="Account menu" sections={menu} />
      </div>

      <div className="mt-3">
        {/* What the account holds, to the planck. The split under it is rounded
            for reading, and says so */}
        <div data-nodrag className={`font-mono text-xl font-semibold tracking-tight ${PICKABLE}`}>
          {formatAmount(totalOf(holdings), { precision: DECIMALS, pad: false })}
          <span className="ml-1 text-[11.5px] font-bold tracking-wide">{symbol}</span>
        </div>
        {/* The three the total is made of, the way the explorer splits it. A
            freeze and a deposit are not the same thing and do not come back the
            same way, so one figure over both says less than it looks */}
        <div data-nodrag className={`mt-0.5 flex flex-wrap gap-x-2 text-xs text-lead ${PICKABLE}`}>
          <span>transferable {formatAmount(holdings.transferable, { approx: true })}</span>
          <span>locked {formatAmount(holdings.locked, { approx: true })}</span>
          <span>reserved {formatAmount(holdings.reserved, { approx: true })}</span>
        </div>
      </div>

      <div className="mt-auto flex gap-2 pt-3">
        <Button
          type="button"
          data-nodrag
          variant="primary"
          className="flex-1"
          disabled={!canSend(account)}
          title={canSend(account) ? undefined : CANNOT_SEND[account.source]}
          onClick={() => onSend(account)}
        >
          Send
        </Button>
        <Button type="button" data-nodrag className="flex-1" onClick={() => onReceive(account)}>
          Receive
        </Button>
      </div>
    </>
  )
}

/**
 * Dragging re-renders every sortable on every pointer move, since that is how
 * dnd-kit hands out the transforms. None of what a card draws depends on the
 * drag, so the body sits behind a memo and only the article moves.
 */
export const AccountCardBody = memo(CardBody)

const CARD =
  'flex flex-col rounded-[6px] border border-line bg-panel p-3.5 shadow-card transition-colors select-none touch-pan-y'

export function AccountCard(props: CardProps) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.account.address,
    data: { type: 'card' },
  })

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...listeners}
      className={`${CARD} cursor-grab hover:border-line-strong hover:shadow-hover ${
        isDragging ? 'opacity-35 outline-[1.5px] outline-dashed outline-accent -outline-offset-2' : ''
      }`}
    >
      <AccountCardBody {...props} />
    </article>
  )
}

/** What follows the pointer during a drag. */
export function AccountCardGhost(props: CardProps) {
  return (
    <article className={`${CARD} cursor-grabbing shadow-lift`}>
      <AccountCardBody {...props} />
    </article>
  )
}
