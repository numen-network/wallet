import { AddressField } from '@/accounts/AddressField'
import { RegistrarField } from '@/accounts/RegistrarField'
import { SORTS, trackLabel, type Motion } from '@/chain/governance'
import { suffixProblem, type Registrar, type UsernameAuthority } from '@/chain/identity'
import { useReferenda, useTracks } from '@/chain/queries'
import { resolveAddress, shorten } from '@/lib/address'
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
