import { useId, type ReactNode } from 'react'
import { useChain } from '@/chain/provider'
import { useFacts, useRegistrars, useStanding, useSymbol } from '@/chain/queries'
import {
  botRegistrar,
  CONTACT,
  depositFor,
  EMPTY_IDENTITY,
  isChecked,
  isEmpty,
  LABELS,
  MAX_BYTES,
  named,
  overlong,
  pendingWith,
  PROFILE,
  type IdentityField,
  type IdentityInfo,
  type Registrar,
} from '@/chain/identity'
import type { Checks } from '@/chain/verify'
import { formatAmount } from '@/lib/balance'
import { cn } from '@/lib/cn'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  NOTE,
} from '@/components/ui/field'
import { useDraft } from '@/ui/draft'
import { LEDE, ModalFrame } from '@/ui/Modal'
import { TabBar, TabPanel, Tabs, type TabOption } from '@/ui/Tabs'
import { CallModal, CallPage, SignerField, useCall, useSigning } from './Authorize'
import { IdentityLine } from './IdentityLine'
import { RegistrarField } from './RegistrarField'
import type { Account } from './types'
import { VerifyIdentity } from './VerifyIdentity'

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
  avatar: string | null
  bio: string | null
  checks: Checks
}

const EMPTY_DRAFT: IdentityDraft = {
  mode: 'verify',
  info: null,
  chosen: null,
  ask: null,
  display: null,
  avatar: null,
  bio: null,
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
  const tabs = <TabBar options={MODES} className="w-fit" />
  const parts = { account, signers, tabs, draft, patch, sent, onClose }

  return (
    <Tabs value={draft.mode} onChange={(mode) => patch({ mode })}>
      <ModalFrame width={draft.mode === 'manual' ? 640 : 580} onClose={onClose}>
        <TabPanel value="verify">
          <VerifyIdentity {...parts} />
        </TabPanel>
        <TabPanel value="manual">
          <EditIdentity {...parts} />
        </TabPanel>
      </ModalFrame>
    </Tabs>
  )
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
 * Every field the chain holds, typed by hand. Asking a registrar to check it
 * rides the same signature.
 */
function EditIdentity({ account, signers, tabs, draft, patch, sent, onClose }: IdentityFormProps) {
  const { network } = useChain()
  const symbol = useSymbol()
  const { data: standing } = useStanding(account.address)
  const registration = standing?.own ?? null
  const { data: registrars } = useRegistrars()
  const { data: facts } = useFacts()
  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const { info, chosen, ask } = draft
  const call = useCall(onClose)
  const askId = useId()

  // The form owns the fields the moment somebody types, before that the chain does
  const current = info ?? registration?.info ?? EMPTY_IDENTITY
  const set = (field: IdentityField, value: string) =>
    patch({ info: { ...current, [field]: value } })

  // The automated one only takes the transfer riding the other tab, a manual
  // request to it would sit unjudged forever, so this list leaves it out
  const bot = botRegistrar(registrars ?? [], network.registrar)
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
    if (isEmpty(current)) {
      return call.refuse('Fill in at least one field, or clear the identity instead')
    }
    if (!named(current.display)) return call.refuse('The record needs a display name')

    const [long] = overlong(current)
    if (long) return call.refuse(`${LABELS[long]} is longer than ${MAX_BYTES[long]} bytes`)

    return call.run(submit(operation, call.password).then(sent), 'Identity sent')
  }

  const line = (field: IdentityField) => (
    <IdentityLine
      key={field}
      field={field}
      value={current[field]}
      onChange={(value) => set(field, value)}
    />
  )

  return (
    <CallPage
      title="On chain identity"
      submitLabel="Sign and send"
      busy={call.busy}
      aside={tabs}
      footNote={
        facts &&
        `${formatAmount(depositFor(current, facts.identityBasicDeposit, facts.identityByteDeposit), { precision: 2 })} ${symbol} deposit, returned when the identity is cleared`
      }
      from={signer.address}
      needsPassword={needsPassword}
      operation={wrap(operation)}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      {loses && (
        <p className="text-[12.5px] text-destructive">
          Changing any field drops the judgement this identity already has. It has to be checked
          again.
        </p>
      )}

      <p className={NOTE}>Anyone can read this.</p>
      {PROFILE.map(line)}
      {CONTACT.map(line)}

      {/* A chain with nobody to ask still takes an identity, it just cannot have
          one checked, and a form that stops here says none of that */}
      {askable?.length === 0 && (
        <p className={cn('mt-4', NOTE)}>
          No registrar takes a manual request on this chain. What goes on here is still public and
          still costs the deposit, there is simply nobody to ask about it from this tab.
        </p>
      )}
      {registrar && askable && (
        <FieldSet className="mt-4">
          <FieldLegend>Checking</FieldLegend>
          <RegistrarField
            registrars={askable}
            value={registrar.index}
            onChange={(next) => patch({ chosen: next })}
          />
          <Field orientation="horizontal" className="mt-2 items-start">
            <Checkbox
              id={askId}
              checked={asking}
              className="mt-0.5"
              onCheckedChange={(checked) => patch({ ask: checked === true })}
            />
            <FieldLabel htmlFor={askId}>Ask this registrar to check it in the same signature</FieldLabel>
          </Field>

          {/* The switch says what it does. This says where it leaves you. */}
          <FieldDescription>
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
          </FieldDescription>
        </FieldSet>
      )}

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />
    </CallPage>
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
  const call = useCall(onClose)

  const form = () => call.run(submit({ kind: 'clearIdentity' }, call.password))

  return (
    <CallModal
      title="Clear on chain identity"
      submitLabel="Clear it"
      busy={call.busy}
      danger
      from={signer.address}
      needsPassword={needsPassword}
      operation={wrap({ kind: 'clearIdentity' })}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      <p className={LEDE}>
        {account.name} goes back to being an address with nothing attached, and the{' '}
        {formatAmount(registration?.deposit ?? 0n, { precision: 2 })} {symbol} deposit is
        released. Anything that gates on a checked identity stops letting this account through.
      </p>

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />
    </CallModal>
  )
}
