import { AddressField } from '@/accounts/AddressField'
import { AmountField } from '@/accounts/AmountField'
import { RegistrarField } from '@/accounts/RegistrarField'
import { awaitsGovernance, type Bounty } from '@/chain/bounties'
import { SORTS, trackLabel, type Motion } from '@/chain/governance'
import { suffixProblem, type Registrar, type UsernameAuthority } from '@/chain/identity'
import { useReferenda, useSymbol, useTracks } from '@/chain/queries'
import { resolveAddress, shorten } from '@/lib/address'
import { amountProblem, formatAmount, parseAmount } from '@/lib/balance'
import { cn } from '@/lib/cn'
import { NOTE } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Field, INSIDE } from '@/ui/Field'
import { Select } from '@/ui/Select'
import type { Voters } from './Voter'

/** The call a form reads as, or what it still needs before it can be sent. */
export type Reading = { motion: Motion; problem: null } | { motion: null; problem: string }

export const ready = (motion: Motion): Reading => ({ motion, problem: null })

export const missing = (problem: string): Reading => ({ motion: null, problem })

/** A running referendum, named the way the list names it. */
export function PollField({ value, onChange }: { value: string; onChange: (poll: string) => void }) {
  const { data: referenda } = useReferenda()
  const { data: tracks } = useTracks()
  const options = [...(referenda ?? [])].sort(SORTS.newest).map((referendum) => ({
    value: String(referendum.index),
    label: `#${referendum.index} ${referendum.title ?? trackLabel(tracks, referendum.track)}`,
  }))

  return (
    <Field label="Referendum">
      <Select
        value={value}
        onValueChange={onChange}
        options={options}
        label="Referendum"
        className={INSIDE}
      />
    </Field>
  )
}

export type IdentityAct = Extract<
  Motion['kind'],
  'addRegistrar' | 'removeRegistrar' | 'addUsernameAuthority' | 'removeUsernameAuthority'
>

export interface IdentityDraft {
  act: IdentityAct
  account: string
  registrar: number | null
  suffix: string
  allocation: string
}

const ACTS: { value: IdentityAct; label: string }[] = [
  { value: 'addRegistrar', label: 'Add a registrar' },
  { value: 'removeRegistrar', label: 'Remove a registrar' },
  { value: 'addUsernameAuthority', label: 'Add a username authority' },
  { value: 'removeUsernameAuthority', label: 'Remove a username authority' },
]

const U32_MAX = 4_294_967_295

export function readIdentity(
  draft: IdentityDraft,
  maxSuffixLength: number,
  authorities: UsernameAuthority[],
): Reading {
  const target = resolveAddress(draft.account)

  switch (draft.act) {
    case 'addRegistrar':
      return target
        ? ready({ kind: 'addRegistrar', account: target })
        : missing('Give it the account to add')
    case 'removeRegistrar':
      return draft.registrar === null
        ? missing('Pick the registrar to remove')
        : ready({ kind: 'removeRegistrar', registrar: draft.registrar })
    case 'addUsernameAuthority': {
      if (!target) return missing('Give it the account to add')
      const problem = suffixProblem(draft.suffix, maxSuffixLength)
      if (problem) return missing(problem)
      const allocation = Number(draft.allocation)
      if (!/^\d+$/.test(draft.allocation) || allocation > U32_MAX) {
        return missing('Give it a whole number of usernames it may hand out')
      }
      return ready({ kind: 'addUsernameAuthority', authority: target, suffix: draft.suffix, allocation })
    }
    case 'removeUsernameAuthority': {
      const held = authorities.find((entry) => entry.suffix === draft.suffix)
      return held
        ? ready({ kind: 'removeUsernameAuthority', authority: held.account, suffix: held.suffix })
        : missing('Pick the authority to remove')
    }
  }
}

export function IdentityFields({
  draft,
  accounts,
  registrars,
  authorities,
  maxSuffixLength,
  onChange,
}: {
  draft: IdentityDraft
  accounts: Voters
  registrars: Registrar[]
  authorities: UsernameAuthority[]
  maxSuffixLength: number | undefined
  onChange: (next: Partial<IdentityDraft>) => void
}) {
  const adding = draft.act === 'addRegistrar' || draft.act === 'addUsernameAuthority'

  return (
    <>
      <Field label="Change">
        <Select
          value={draft.act}
          onValueChange={(act) => onChange({ act: act as IdentityAct })}
          options={ACTS}
          label="Change"
          className={INSIDE}
        />
      </Field>

      {adding && (
        <AddressField
          label="Account"
          value={draft.account}
          onChange={(account) => onChange({ account })}
          accounts={accounts}
        />
      )}

      {draft.act === 'removeRegistrar' && (
        <RegistrarField
          registrars={registrars}
          value={draft.registrar}
          onChange={(registrar) => onChange({ registrar })}
        />
      )}

      {draft.act === 'addUsernameAuthority' && (
        <>
          <Field
            label="Suffix"
            aside={maxSuffixLength === undefined ? null : `up to ${maxSuffixLength} characters`}
          >
            <Input
              value={draft.suffix}
              placeholder="numen"
              autoComplete="off"
              onChange={(event) => onChange({ suffix: event.target.value })}
            />
          </Field>
          <Field label="Allocation">
            <Input
              value={draft.allocation}
              inputMode="numeric"
              placeholder="Usernames it may hand out"
              autoComplete="off"
              onChange={(event) => onChange({ allocation: event.target.value })}
            />
          </Field>
        </>
      )}

      {draft.act === 'removeUsernameAuthority' && (
        <Field label="Authority">
          <Select
            value={draft.suffix}
            onValueChange={(suffix) => onChange({ suffix })}
            options={authorities.map((entry) => ({
              value: entry.suffix,
              label: `${entry.suffix} · ${shorten(entry.account)}`,
            }))}
            label="Authority"
            className={INSIDE}
          />
        </Field>
      )}
    </>
  )
}

export interface BountyDraft {
  bounty: number | null
  curator: string
  fee: string
}

/**
 * The bounty's state picks the call. A proposed one can be funded with no
 * curator yet. A funded one only needs its curator.
 */
export function readBounty(draft: BountyDraft, bounties: Bounty[]): Reading {
  const bounty = bounties.find((entry) => entry.index === draft.bounty && awaitsGovernance(entry))
  if (!bounty) return missing('Pick the bounty')
  if (bounty.state === 'proposed' && draft.curator === '' && draft.fee === '') {
    return ready({ kind: 'approveBounty', bounty: bounty.index })
  }

  const curator = resolveAddress(draft.curator)
  if (!curator) return missing('Give it the account that would curate it')
  const problem = amountProblem(draft.fee, 0n)
  if (problem) return missing(problem)
  // pallet_bounties refuses this as InvalidFee, but only once the referendum enacts
  const fee = parseAmount(draft.fee)
  if (fee >= bounty.value) return missing('The curator fee has to be less than what the bounty pays')

  const kind = bounty.state === 'proposed' ? 'approveBountyWithCurator' : 'proposeCurator'
  return ready({ kind, bounty: bounty.index, curator, fee })
}

export function BountyFields({
  draft,
  accounts,
  bounties,
  onChange,
}: {
  draft: BountyDraft
  accounts: Voters
  bounties: Bounty[]
  onChange: (next: Partial<BountyDraft>) => void
}) {
  const symbol = useSymbol()
  const open = bounties.filter(awaitsGovernance)
  const picked = open.find((entry) => entry.index === draft.bounty)

  return (
    <>
      <Field label="Bounty">
        <Select
          value={draft.bounty === null ? '' : String(draft.bounty)}
          onValueChange={(next) => onChange({ bounty: Number(next) })}
          options={open.map((entry) => ({
            value: String(entry.index),
            label: `#${entry.index} ${entry.description || 'unnamed'}`,
            detail: `${formatAmount(entry.value, { precision: 0 })} ${symbol}`,
          }))}
          label="Bounty"
          className={INSIDE}
        />
      </Field>

      <AddressField
        label="Curator"
        value={draft.curator}
        onChange={(curator) => onChange({ curator })}
        accounts={accounts}
        clearable
      />
      <AmountField label="Curator fee" value={draft.fee} onChange={(fee) => onChange({ fee })} />

      <p className={cn('mt-2.5', NOTE)}>
        The fee comes out of what the bounty pays, and the account named has to accept before it
        is theirs.
        {picked?.state === 'proposed' &&
          ' Leave the curator and fee empty to fund it now and name one in a later referendum.'}
      </p>
    </>
  )
}
