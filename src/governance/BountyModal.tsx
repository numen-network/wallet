import { useState } from 'react'
import { AccountPassword, FeeLine } from '@/accounts/Authorize'
import type { Bounty, ChildBounty } from '@/chain/bounties'
import { useSymbol } from '@/chain/queries'
import type { Operation } from '@/chain/types'
import { resolveAddress } from '@/lib/address'
import { amountInput, AmountError, formatAmount, parseAmount } from '@/lib/balance'
import { VaultError } from '@/signing/vault'
import { Field, FieldError, Input, Modal } from '@/ui/Modal'
import { toast } from '@/ui/Toast'
import { useVoter, VoterField, type Voters } from './Voter'
import { AddressField } from '@/accounts/AddressField'

/** What the form has to ask for on top of the account signing it. */
type Wants = 'nothing' | 'beneficiary' | 'piece' | 'curator'

interface Ask {
  title: string
  note: string
  wants: Wants
}

const ASKS: Record<string, Ask> = {
  accept: {
    title: 'Take on the bounty',
    note: 'Taking it on holds a deposit worked out from the fee, and it comes back when the bounty is awarded or you stand down before anybody complains.',
    wants: 'nothing',
  },
  award: {
    title: 'Award the bounty',
    note: 'The beneficiary is paid after a delay, and the curator fee comes out of the total rather than on top of it.',
    wants: 'beneficiary',
  },
  claim: {
    title: 'Pay out the bounty',
    note: 'The delay is up. Anybody may sign this, and the money goes to the beneficiary either way.',
    wants: 'nothing',
  },
  unassign: {
    title: 'Stand down as curator',
    note: 'The bounty goes back to looking for a curator. Standing down after the update was due costs the deposit.',
    wants: 'nothing',
  },
  extend: {
    title: 'Extend the bounty',
    note: 'Puts the next update off, which is what keeps a bounty from looking abandoned.',
    wants: 'nothing',
  },
  addChild: {
    title: 'Split off a piece',
    note: 'A child bounty comes out of what the parent holds, and the parent curator names who runs it. Nothing here waits on governance.',
    wants: 'piece',
  },
  propose: {
    title: 'Name a curator',
    note: 'The fee comes out of what the child bounty pays, and the account named has to accept before it is theirs.',
    wants: 'curator',
  },
  close: {
    title: 'Close the child bounty',
    note: 'What it holds goes back to the parent bounty. One already awarded cannot be closed.',
    wants: 'nothing',
  },
}

export type BountyCall = keyof typeof ASKS

/**
 * Everything a curator or a beneficiary does about a bounty or a piece of one.
 * They are one call each, so the dialog is the same dialog with a different
 * question on it.
 */
export function BountyModal({
  target,
  call,
  accounts,
  onClose,
}: {
  /** The bounty, or the child and the parent it came out of. */
  target: Bounty | ChildBounty
  call: BountyCall
  accounts: Voters
  onClose: () => void
}) {
  const symbol = useSymbol()
  const ask = ASKS[call]!
  const child = 'parent' in target ? target : null
  const bounty = child ? child.parent : (target as Bounty).index

  const [address, setAddress] = useState(target.curator ?? accounts[0].address)
  const [beneficiary, setBeneficiary] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [curator, setCurator] = useState('')
  const [fee, setFee] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const voter = useVoter(accounts, address)
  const account = voter.account

  // A fee is quoted against a call the form may not have filled in yet, so the
  // probe carries the signer wherever an address is still to be typed
  const build = (target: string, planck: bigint): Operation => {
    switch (call) {
      case 'accept':
        return child
          ? { kind: 'acceptChildCurator', bounty, child: child.index }
          : { kind: 'acceptCurator', bounty }
      case 'award':
        return child
          ? { kind: 'awardChild', bounty, child: child.index, beneficiary: target }
          : { kind: 'awardBounty', bounty, beneficiary: target }
      case 'claim':
        return child
          ? { kind: 'claimChild', bounty, child: child.index }
          : { kind: 'claimBounty', bounty }
      case 'unassign':
        return child
          ? { kind: 'unassignChildCurator', bounty, child: child.index }
          : { kind: 'unassignCurator', bounty }
      case 'extend':
        return { kind: 'extendBounty', bounty }
      case 'addChild':
        return { kind: 'addChild', bounty, value: planck, description }
      case 'propose':
        return {
          kind: 'proposeChildCurator',
          bounty,
          child: child?.index ?? 0,
          curator: target,
          fee: planck,
        }
      default:
        return { kind: 'closeChild', bounty, child: child?.index ?? 0 }
    }
  }

  let typed = 0n
  try {
    typed = parseAmount(call === 'propose' ? fee : amount)
  } catch {
    typed = 0n
  }
  const probe = build(address, typed)

  const form = () => {
    setError('')

    if (ask.wants === 'beneficiary') {
      const paid = resolveAddress(beneficiary)
      if (!paid) {
        setError('Enter the Numen or EVM address it would go to')
        return false
      }
      void send(build(paid, 0n))
      return false
    }

    if (ask.wants === 'piece') {
      if (description.trim() === '') {
        setError('Say what the piece is for, since that is all the list shows')
        return false
      }
      try {
        if (parseAmount(amount) <= 0n) throw new AmountError('Enter an amount')
      } catch (problem) {
        setError(problem instanceof AmountError ? problem.message : 'Enter an amount')
        return false
      }
      void send(build(address, parseAmount(amount)))
      return false
    }

    if (ask.wants === 'curator') {
      const named = resolveAddress(curator)
      if (!named) {
        setError('Enter the Numen or EVM address that would run it')
        return false
      }
      let asked = 0n
      try {
        asked = parseAmount(fee)
      } catch {
        setError('Enter the fee it would take')
        return false
      }
      void send(build(named, asked))
      return false
    }

    void send(probe)
    return false
  }

  const send = async (operation: Operation) => {
    setBusy(true)
    try {
      await voter.submit(operation, password)
      toast('Sent')
      onClose()
    } catch (problem) {
      if (problem instanceof VaultError) setError(problem.message)
      else setError(problem instanceof Error ? problem.message : 'The chain refused it')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={ask.title}
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      footNote={`${child ? `Bounty ${bounty}.${child.index}` : `Bounty ${bounty}`}, ${formatAmount(target.value, { precision: 0 })} ${symbol}`}
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-lead">{ask.note}</p>

      <VoterField accounts={accounts} voter={voter} onChange={setAddress} />

      {ask.wants === 'beneficiary' && (
        <AddressField
          label="Paid to"
          value={beneficiary}
          onChange={setBeneficiary}
          accounts={accounts}
        />
      )}

      {ask.wants === 'piece' && (
        <>
          <Field label="What it is for">
            <Input
              value={description}
              placeholder="Write the faucet a status page"
              autoComplete="off"
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <Field label="Amount">
            <Input
              value={amount}
              inputMode="decimal"
              placeholder={`0.0 ${symbol}`}
              autoComplete="off"
              onChange={(event) => setAmount(amountInput(event.target.value))}
            />
          </Field>
        </>
      )}

      {ask.wants === 'curator' && (
        <>
          <AddressField
          label="Curated by"
          value={curator}
          onChange={setCurator}
          accounts={accounts}
        />
          <Field label="Their fee">
            <Input
              value={fee}
              inputMode="decimal"
              placeholder={`0.0 ${symbol}`}
              autoComplete="off"
              onChange={(event) => setFee(amountInput(event.target.value))}
            />
          </Field>
        </>
      )}

      {voter.needsPassword && (
        <AccountPassword
          value={password}
          note="Unlocks this account for one signature"
          onChange={setPassword}
        />
      )}
      <FieldError>{error}</FieldError>

      <FeeLine from={voter.signer.address} operation={voter.wrap(probe)} />
    </Modal>
  )
}

/** Anybody may put a bounty up, and holds a bond until governance funds it or throws it out. */
export function ProposeBountyModal({
  accounts,
  onClose,
}: {
  accounts: Voters
  onClose: () => void
}) {
  const symbol = useSymbol()
  const [address, setAddress] = useState(accounts[0].address)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const voter = useVoter(accounts, address)
  const account = voter.account

  let asked = 0n
  try {
    asked = amount ? parseAmount(amount) : 0n
  } catch {
    asked = 0n
  }
  const operation = { kind: 'proposeBounty' as const, value: asked, description }

  const form = () => {
    setError('')

    if (description.trim() === '') {
      setError('Say what the bounty is for, since that is all the list shows')
      return false
    }

    try {
      if (parseAmount(amount) <= 0n) throw new AmountError('Enter an amount')
    } catch (problem) {
      setError(problem instanceof AmountError ? problem.message : 'Enter an amount')
      return false
    }

    void send()
    return false
  }

  const send = async () => {
    setBusy(true)
    try {
      await voter.submit(operation, password)
      toast('Sent')
      onClose()
    } catch (problem) {
      if (problem instanceof VaultError) setError(problem.message)
      else setError(problem instanceof Error ? problem.message : 'The chain refused it')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Propose a bounty"
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      onClose={onClose}
      onSubmit={form}
    >
      <p className="text-[13.5px] text-lead">
        A bounty is work the treasury pays for once somebody has done it. Proposing one holds a
        bond until governance funds it or throws it out, and governance puts the curator on it.
      </p>

      <VoterField accounts={accounts} voter={voter} onChange={setAddress} />

      <Field label="What it is for">
        <Input
          value={description}
          placeholder="Port the explorer to mobile"
          autoComplete="off"
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>

      <Field label="Amount">
        <Input
          value={amount}
          inputMode="decimal"
          placeholder={`0.0 ${symbol}`}
          autoComplete="off"
          onChange={(event) => setAmount(amountInput(event.target.value))}
        />
      </Field>

      {voter.needsPassword && (
        <AccountPassword
          value={password}
          note="Unlocks this account for one signature"
          onChange={setPassword}
        />
      )}
      <FieldError>{error}</FieldError>

      <FeeLine from={voter.signer.address} operation={voter.wrap(operation)} />
    </Modal>
  )
}
