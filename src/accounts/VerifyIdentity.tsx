import { useEffect, useState } from 'react'
import { IDENTITY_CHECK_FEE } from '@/chain/config'
import {
  botRegistrar,
  byteLength,
  carriedBy,
  checkedBy,
  depositFor,
  dropped,
  FIELD_MAX_BYTES,
  identityFrom,
  LABELS,
  type Proven,
} from '@/chain/identity'
import { useChain } from '@/chain/provider'
import { useFacts, useRegistrars, useStanding, useSymbol } from '@/chain/queries'
import {
  alive,
  minutesLeft,
  PROVIDER_NAMES,
  PROVIDERS,
  verify,
  VerifyError,
  type Provider,
} from '@/chain/verify'
import { formatAmount } from '@/lib/balance'
import { VaultError } from '@/signing/vault'
import { Button, IconButton } from '@/ui/Button'
import { Facts, type Fact } from '@/ui/Facts'
import { TrashIcon } from '@/ui/icons'
import { FieldError, Modal } from '@/ui/Modal'
import { toast } from '@/ui/Toast'
import { AccountPassword, FeeLine, SignerField, useSigning } from './Authorize'
import type { IdentityFormProps } from './IdentityModal'
import { IdentityLine } from './IdentityLine'

const list = new Intl.ListFormat('en', { type: 'conjunction' })

/** Half a minute, so a row never shows a minute that has already gone. */
const TICK_MS = 30_000

/**
 * The wall clock, read afresh each render and nudged so the renders keep
 * coming. A sign in dies on its own while the dialog sits open, and both the
 * rows and the bill have to notice that without a click.
 */
function useNow(every: number): number {
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => tick((count) => count + 1), every)
    return () => clearInterval(timer)
  }, [every])
  return Date.now()
}

/**
 * Signing in proves a handle and the dialog holds it, since a proof is spent by
 * one judgement and every channel has to ride the same signature. That
 * signature pays the site's judge one price per sign in, a transfer the judge
 * matches against this very extrinsic. The other tab is for whoever wants a
 * record holding more than handles and a name.
 */
export function VerifyIdentity({
  account,
  signers,
  tabs,
  draft,
  patch,
  sent,
  onClose,
}: IdentityFormProps) {
  const { network } = useChain()
  const symbol = useSymbol()
  const { data: standing } = useStanding(account.address)
  const { data: registrars } = useRegistrars()
  const { data: facts } = useFacts()
  const registration = standing?.own ?? null
  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<Provider | 'signing' | null>(null)
  // A channel that will not prove answers in its own row, the signature
  // answers under the password
  const [failed, setFailed] = useState<Partial<Record<Provider, string>>>({})
  // Dropping a checked handle is an intent for this signature alone, so it
  // dies with the dialog instead of riding the draft
  const [removed, setRemoved] = useState<Partial<Record<Provider, boolean>>>({})
  const [error, setError] = useState('')

  const now = useNow(TICK_MS)

  // The form owns the name the moment somebody types, before that the chain does
  const display = draft.display ?? registration?.info.display ?? ''
  const named = display.trim() !== ''
  const checks = alive(draft.checks, now)
  const loses = dropped(registration ?? null)
  const stuck =
    (needsPassword && password === '') || byteLength(display) > FIELD_MAX_BYTES || !named

  // Which registrar is the robot is read off the chain, it is the one declaring
  // the channels it checks, and the declaration also picks the buttons here
  const registrar = botRegistrar(registrars ?? [])
  const providers = PROVIDERS.filter((provider) => checkedBy(registrar).includes(provider))

  // A handle the bot already stands behind opens proved and rides for free,
  // only a sign in past what the chain holds is on the bill
  const carried = carriedBy(registration, registrar)
  const fresh = providers.filter((provider) => {
    const check = checks[provider]
    return check !== undefined && check.handle !== carried[provider]
  })
  const worn: Proven = {
    telegram: checks.telegram?.handle ?? (removed.telegram ? '' : (carried.telegram ?? '')),
    discord: checks.discord?.handle ?? (removed.discord ? '' : (carried.discord ?? '')),
  }
  const proven = PROVIDERS.filter((provider) => worn[provider] !== '').length
  const emptied =
    proven === 0 && PROVIDERS.some((provider) => removed[provider] && carried[provider])
  const cost = IDENTITY_CHECK_FEE * BigInt(fresh.length)
  const record = identityFrom(display, worn)

  // The judgement fee is the chain's own rail. Filing while a paid request
  // still stands would break the whole batch, so the open request rides
  // instead of a second filing
  const asked =
    registration?.judgements.some(
      (verdict) => verdict.registrar === registrar?.index && verdict.judgement === 'FeePaid',
    ) ?? false

  // What the form would sign, quoted by the bill and the fee whether or not a
  // channel has been proved yet. The two states with nothing to quote say so
  // in place of the bill
  const operation =
    registrar !== undefined && !emptied
      ? ({
          kind: 'registerIdentity',
          info: record,
          registrar: asked ? null : { index: registrar.index, maxFee: registrar.fee },
          pay: { to: registrar.account, amount: cost },
        } as const)
      : null

  // Signing needs a channel proved, quoting the price of one does not
  const signable = operation !== null && proven > 0

  // Every coin the record costs, in one place. The sign fee goes to the
  // site's judge for the checks, the judgement fee is the chain collecting
  // what the registrar declared, the reserve rides the record
  const bill: Fact[] = [
    {
      name: 'Sign fee',
      value: `${fresh.length} × ${formatAmount(IDENTITY_CHECK_FEE, { precision: 4 })} = ${formatAmount(cost, { precision: 4 })} ${symbol}`,
    },
    ...(registrar !== undefined && !asked
      ? [
          {
            name: 'Judgement',
            value: `${formatAmount(registrar.fee, { precision: 4 })} ${symbol}`,
          },
        ]
      : []),
    ...(facts
      ? [
          {
            name: 'Reserve',
            value: `${formatAmount(depositFor(record, facts.identityBasicDeposit, facts.identityByteDeposit), { precision: 2 })} ${symbol}`,
          },
        ]
      : []),
  ]

  const run = async (provider: Provider) => {
    setFailed((was) => ({ ...was, [provider]: undefined }))
    setError('')
    setBusy(provider)
    try {
      const outcome = await verify(network, provider, account.address)
      const handle = outcome.proven[provider]
      if (!handle) throw new VerifyError('The site proved nothing for this channel')
      patch({
        checks: {
          ...checks,
          [provider]: { handle, expiresAt: outcome.expiresAt },
        },
      })
      setRemoved((was) => ({ ...was, [provider]: false }))
    } catch (problem) {
      const why = problem instanceof Error ? problem.message : 'Nothing was proved'
      setFailed((was) => ({ ...was, [provider]: why }))
    } finally {
      setBusy(null)
    }
  }

  // One press takes back one layer, the sign in held here before the handle the
  // chain stands behind, so what goes is what the row says is riding
  const remove = (provider: Provider) => {
    if (checks[provider]) patch({ checks: { ...draft.checks, [provider]: undefined } })
    else setRemoved((was) => ({ ...was, [provider]: true }))
  }

  const send = async () => {
    // Enter reaches the form whether or not the button is drawn
    if (!operation || !signable) return

    // A sign in that expired while the dialog sat open would be paid for and
    // never judged, so the moment of signing rechecks what the price bought
    const standing = alive(draft.checks)
    if (fresh.some((provider) => standing[provider] === undefined)) {
      patch({ checks: standing })
      setError('A sign in expired, verify that channel again')
      return
    }

    setError('')
    setBusy('signing')
    try {
      await submit(operation, password)
      toast('Identity sent')
      sent()
      onClose()
    } catch (problem) {
      if (problem instanceof VaultError) setError(problem.message)
      else setError(problem instanceof Error ? problem.message : 'The identity was refused')
    } finally {
      setBusy(null)
    }
  }

  const form = () => {
    void send()
    return false
  }

  return (
    <Modal
      title="On chain identity"
      submitLabel={signable ? (busy === 'signing' ? 'Signing…' : 'Sign and send') : null}
      cancelLabel="Close"
      disabled={stuck || busy !== null}
      aside={tabs}
      onClose={onClose}
      onSubmit={form}
    >
      {loses.length > 0 && (
        <p className="mb-3 text-[12.5px] text-bad">
          This replaces what is on chain now, so {list.format(loses.map((field) => LABELS[field]))}{' '}
          {loses.length === 1 ? 'goes' : 'go'} with it.
        </p>
      )}

      <IdentityLine field="display" value={display} onChange={(next) => patch({ display: next })} />
      {proven > 0 && !named && <FieldError>The record needs a display name</FieldError>}

      {/* One channel a row, and the two states beside the button answer
          different questions. What the chain stands behind outlives this
          dialog, while a sign in held here is good for an hour */}
      {providers.length > 0 && (
        <ul className="mt-4 grid gap-2.5">
          {providers.map((provider) => {
            const name = PROVIDER_NAMES[provider]
            const held = checks[provider]
            const stood = carried[provider]
            const riding = worn[provider] !== ''
            const trouble = failed[provider]
            const state = held
              ? `Signed in as ${held.handle}, ${minutesLeft(held.expiresAt, now)} min left`
              : draft.checks[provider]
                ? 'The sign in expired'
                : stood && removed[provider]
                  ? 'Comes off the record when you sign'
                  : 'Not signed in'
            return (
              <li key={provider} className="flex items-center gap-3.5">
                {/* Half the row apiece, so the states line up in a column */}
                <Button
                  type="button"
                  variant={riding ? 'secondary' : 'primary'}
                  className="w-1/2 shrink-0"
                  disabled={busy !== null}
                  onClick={() => void run(provider)}
                >
                  {busy === provider ? `Waiting for ${name}…` : `Verify with ${name}`}
                </Button>
                <div className="min-w-0 flex-1 text-[12.5px] leading-[1.5]">
                  <p className={`truncate ${stood && riding ? 'text-good' : 'text-dim'}`}>
                    {stood ? `Checked on chain as ${stood}` : 'Never checked'}
                  </p>
                  <p className={trouble ? 'text-bad' : 'truncate text-dim'}>{trouble ?? state}</p>
                </div>
                {riding && (
                  <IconButton
                    type="button"
                    aria-label={`Remove ${name}`}
                    disabled={busy !== null}
                    onClick={() => remove(provider)}
                  >
                    <TrashIcon />
                  </IconButton>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {registrar === undefined ? (
        <p className="mt-3 text-[12.5px] text-dim">
          Nobody on this chain checks sign ins automatically yet.
        </p>
      ) : emptied ? (
        <p className="mt-3.5 text-[12.5px] text-lead">
          Every channel is off this record, so there is nothing left to sign. Clear on chain
          identity in the account menu takes the whole identity down.
        </p>
      ) : (
        <div className="mt-3.5">
          <Facts rows={bill} />
        </div>
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
      {operation && <FeeLine from={signer.address} operation={wrap(operation)} />}
    </Modal>
  )
}
