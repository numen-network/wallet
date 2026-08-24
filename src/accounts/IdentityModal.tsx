import { useState, type ReactNode } from 'react'
import { useFacts, useRegistrars, useStanding, useSymbol } from '@/chain/queries'
import {
  botRegistrar,
  checkedBy,
  depositFor,
  EMPTY_IDENTITY,
  FIELD_MAX_BYTES,
  isChecked,
  isEmpty,
  LABELS,
  overlong,
  pendingWith,
  unchecked,
  type IdentityField,
  type IdentityInfo,
  type Registrar,
} from '@/chain/identity'
import type { Checks } from '@/chain/verify'
import { formatAmount } from '@/lib/balance'
import { VaultError } from '@/signing/vault'
import { useDraft } from '@/ui/draft'
import { FieldError, Modal } from '@/ui/Modal'
import { Tabs, type TabOption } from '@/ui/Tabs'
import { toast } from '@/ui/Toast'
import { AccountPassword, FeeLine, SignerField, useSigning } from './Authorize'
import { IdentityLine } from './IdentityLine'
import { RegistrarField } from './RegistrarField'
import type { Account } from './types'
import { VerifyIdentity } from './VerifyIdentity'

const HEADING = 'mt-4 text-[11px] font-bold tracking-[0.07em] text-faint uppercase'

type Mode = 'verify' | 'manual'

const MODES: TabOption<Mode>[] = [
  { id: 'verify', label: 'Automatic' },
  { id: 'manual', label: 'Manual' },
]

/**
 * Both tabs of the dialog, since which tab you were on is part of what closing
 * it by accident loses. Every field is null while the chain's own answer is
 * still the one showing. Checks are sign ins already proved and not yet signed,
 * which a misclick would otherwise send somebody back through OAuth for.
 */
export interface IdentityDraft {
  mode: Mode
  info: IdentityInfo | null
  chosen: number | null
  ask: boolean | null
  display: string | null
  checks: Checks
}

const EMPTY_DRAFT: IdentityDraft = {
  mode: 'verify',
  info: null,
  chosen: null,
  ask: null,
  display: null,
  checks: {},
}

/**
 * One way in, two ways to fill it. Verifying is the one that ends in a checked
 * identity, so it leads. The form behind the other tab holds everything a bot
 * has no way to prove.
 */
export function IdentityModal({
  account,
  signers,
  onClose,
}: {
  account: Account
  signers: Account[]
  onClose: () => void
}) {
  // Keyed by account, so the same dialog opened on somebody else starts blank
  const [draft, patch, sent] = useDraft(`identity:${account.address}`, EMPTY_DRAFT)
  const tabs = (
    <Tabs
      value={draft.mode}
      options={MODES}
      onChange={(mode) => patch({ mode })}
      className="w-fit"
    />
  )

  const parts = { account, signers, tabs, draft, patch, sent, onClose }
  return draft.mode === 'verify' ? <VerifyIdentity {...parts} /> : <EditIdentity {...parts} />
}

export interface IdentityFormProps {
  account: Account
  signers: Account[]
  tabs: ReactNode
  draft: IdentityDraft
  patch: (fields: Partial<IdentityDraft>) => void
  /** Drops the draft, once there is nothing left to come back to. */
  sent: () => void
  onClose: () => void
}

/**
 * What an account says about itself on chain, sorted by what the registrar has
 * said it will check. That is all the split means.
 */
function EditIdentity({ account, signers, tabs, draft, patch, sent, onClose }: IdentityFormProps) {
  const symbol = useSymbol()
  const { data: standing } = useStanding(account.address)
  const registration = standing?.own ?? null
  const { data: registrars } = useRegistrars()
  const { data: facts } = useFacts()
  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const { info, chosen, ask } = draft
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // The form owns the fields the moment somebody types, before that the chain does
  const current = info ?? registration?.info ?? EMPTY_IDENTITY
  const set = (field: IdentityField, value: string) =>
    patch({ info: { ...current, [field]: value } })

  // The automated one only takes the transfer riding the other tab, a manual
  // request to it would sit unjudged forever, so this list leaves it out
  const bot = botRegistrar(registrars ?? [])
  const askable = registrars?.filter((entry) => entry.index !== bot?.index)

  // The first is where the list starts, not a decision anybody made
  const registrar: Registrar | undefined =
    askable?.find((entry) => entry.index === chosen) ?? askable?.[0]
  const pending = pendingWith(registration ?? null)
  const waiting = pending !== null
  // Asking again is the point of editing a checked identity, so it leads
  const asking = (ask ?? !waiting) && registrar !== undefined
  const loses = registration?.judgements.some((verdict) => isChecked(verdict.judgement)) ?? false

  const operation = {
    kind: 'registerIdentity',
    info: current,
    registrar: asking && registrar ? { index: registrar.index, maxFee: registrar.fee } : null,
  } as const

  const form = () => {
    setError('')

    if (isEmpty(current)) {
      setError('Fill in at least one field, or clear the identity instead')
      return false
    }

    const [long] = overlong(current)
    if (long) {
      setError(`${LABELS[long]} is longer than ${FIELD_MAX_BYTES} bytes`)
      return false
    }

    void send()
    return false
  }

  const send = async () => {
    setBusy(true)
    try {
      await submit(operation, password)
      toast('Identity sent')
      sent()
      onClose()
    } catch (problem) {
      if (problem instanceof VaultError) setError(problem.message)
      else setError(problem instanceof Error ? problem.message : 'The identity was refused')
    } finally {
      setBusy(false)
    }
  }

  const checked = checkedBy(registrar)
  const line = (field: IdentityField) => (
    <IdentityLine
      key={field}
      field={field}
      value={current[field]}
      onChange={(value) => set(field, value)}
    />
  )

  return (
    <Modal
      title="On chain identity"
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      width={640}
      aside={tabs}
      footNote={
        facts &&
        `${formatAmount(depositFor(current, facts.identityBasicDeposit, facts.identityByteDeposit), { precision: 2 })} ${symbol} deposit, returned when the identity is cleared`
      }
      onClose={onClose}
      onSubmit={form}
    >
      {loses && (
        <p className="text-[12.5px] text-bad">
          Changing any field drops the judgement this identity already has. It has to be checked
          again.
        </p>
      )}

      <p className="text-[12.5px] text-dim">Anyone can read this.</p>
      {line('display')}

      {checked.length > 0 && <p className={HEADING}>Checked by this registrar</p>}
      {checked.map(line)}

      {checked.length > 0 && <p className={HEADING}>Not checked by this registrar</p>}
      {unchecked(registrar).map(line)}

      {/* A chain with nobody to ask still takes an identity, it just cannot have
          one checked, and a form that stops here says none of that */}
      {askable?.length === 0 && (
        <p className="mt-4 text-[12.5px] text-dim">
          No registrar takes a manual request on this chain. What goes on here is still public and
          still costs the deposit, there is simply nobody to ask about it from this tab.
        </p>
      )}
      {registrar && askable && (
        <>
          <p className={HEADING}>Checking</p>
          <RegistrarField
            registrars={askable}
            value={registrar.index}
            onChange={(next) => patch({ chosen: next })}
          />
          <label className="mt-2 flex cursor-pointer items-start gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={asking}
              className="mt-0.5 accent-accent"
              onChange={(event) => patch({ ask: event.target.checked })}
            />
            <span>Ask this registrar to check it in the same signature</span>
          </label>

          {/* The switch says what it does. This says where it leaves you. */}
          <p className="mt-1.5 text-[12.5px] text-dim">
            {asking ? (
              <>
                The request goes on chain beside it, and the{' '}
                {formatAmount(registrar.fee, { precision: 4 })} {symbol} is paid whatever the
                registrar decides. Both calls land together or neither does.
              </>
            ) : waiting ? (
              <>
                Registrar {pending} was already asked, and a paid request outlives an edit, so what
                you write here is what it looks at.
              </>
            ) : (
              <>
                No request goes on chain. Asking later is another signature, at whatever the
                registrar charges then.
              </>
            )}
          </p>
        </>
      )}

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />

      {needsPassword && (
        <AccountPassword
          value={password}
          note="Unlocks this account for one signature"
          onChange={setPassword}
        />
      )}
      <FieldError>{error}</FieldError>
      <FeeLine from={signer.address} operation={wrap(operation)} />
    </Modal>
  )
}

/** Takes the identity down and the deposit back. Every judgement goes with it. */
export function ClearIdentityModal({
  account,
  signers,
  onClose,
}: {
  account: Account
  signers: Account[]
  onClose: () => void
}) {
  const symbol = useSymbol()
  const { data: standing } = useStanding(account.address)
  const registration = standing?.own ?? null
  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const form = () => {
    setError('')
    void send()
    return false
  }

  const send = async () => {
    setBusy(true)
    try {
      await submit({ kind: 'clearIdentity' }, password)
      toast('Sent')
      onClose()
    } catch (problem) {
      if (problem instanceof VaultError) setError(problem.message)
      else setError(problem instanceof Error ? problem.message : 'The chain kept the identity')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Clear on chain identity"
      submitLabel={busy ? 'Signing…' : 'Clear it'}
      danger
      disabled={busy}
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-lead">
        {account.name} goes back to being an address with nothing attached, and the{' '}
        {formatAmount(registration?.deposit ?? 0n, { precision: 2 })} {symbol} deposit is
        released. Anything that gates on a checked identity stops letting this account through.
      </p>

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />

      {needsPassword && (
        <AccountPassword
          value={password}
          note="Unlocks this account for one signature"
          onChange={setPassword}
        />
      )}
      <FieldError>{error}</FieldError>

      <FeeLine from={signer.address} operation={wrap({ kind: 'clearIdentity' })} />
    </Modal>
  )
}
