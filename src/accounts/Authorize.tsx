import { useState, type ReactNode } from 'react'
import { useChain } from '@/chain/provider'
import { CACHES, useFeesEstimate, useRefresh, useSymbol, type Cache, type Charge } from '@/chain/queries'
import { ChainError } from '@/chain/refusal'
import type { Operation } from '@/chain/types'
import { cn } from '@/lib/cn'
import { formatAmount } from '@/lib/balance'
import type { WalletAccount } from '@/signing/types'
import { unlockKey } from '@/signing/vault'
import { ModalFrame, ModalPage, type ModalPageProps, type ModalProps } from '@/ui/Modal'
import { Field } from '@/ui/Field'
import { FieldError, NOTE } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useReopen, type Fields } from '@/ui/reopen'
import { AddressField } from './AddressField'
import { useJobsStore, type Part } from './jobs'
import { useCallsStore } from './calls'
import { otherSignatories } from './multisig'
import { useSessionStore } from './session'
import { needsPassword, type Account } from './types'

/**
 * The parts every dialog that ends in a signature needs. polkadot-js apps gives
 * them a screen of their own, this wallet keeps them at the foot of the form
 * they belong to, but they are the same parts either way and belong in one file.
 */

export function AccountPassword({
  value,
  note,
  onChange,
}: {
  value: string
  /** What this particular password is about to unlock. */
  note?: string
  onChange: (password: string) => void
}) {
  return (
    <Field label="Account password">
      <Input
        type="password"
        value={value}
        autoComplete="current-password"
        placeholder={note}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  )
}

interface CallProps {
  /** Whoever puts their name to it, which is who pays the fee. */
  from: string
  needsPassword: boolean
  /**
   * Null while the form has nothing worth quoting a fee on. Several where the
   * chain takes it in more than one transaction, and the fee is all of them.
   */
  operation: Operation | Operation[] | null
  password: string
  onPassword: (password: string) => void
  /** What this particular password is about to unlock. */
  note?: string
  error: string
  /**
   * What each of several accounts pays, for a dialog that signs as all of
   * them. The fee is the lot, in place of `from` and `operation`.
   */
  charges?: Charge[]
}

/**
 * A dialog that ends in a signature. Only the form differs between them, so the
 * password, the refusal and the fee live here rather than at the foot of every
 * one.
 */
export function CallModal({ width, ...page }: CallProps & Omit<ModalProps, 'footer' | 'fee'>) {
  return (
    <ModalFrame width={width} onClose={page.onClose}>
      <CallPage {...page} />
    </ModalFrame>
  )
}

/** One page of a CallModal, for a dialog whose tabs share a frame. */
export function CallPage({
  from,
  needsPassword,
  operation,
  password,
  onPassword,
  note = 'Unlocks this account for one signature',
  error,
  charges,
  children,
  ...page
}: CallProps & Omit<ModalPageProps, 'footer' | 'fee'>) {
  const priced =
    charges ?? (operation && [operation].flat().map((call) => ({ from, operation: call })))

  return (
    <ModalPage
      {...page}
      footer={
        <>
          {needsPassword && <AccountPassword value={password} note={note} onChange={onPassword} />}
          <FieldError>{error}</FieldError>
        </>
      }
      fee={priced && <FeeLine charges={priced} />}
    >
      {children}
    </ModalPage>
  )
}

/** What the chain would charge for this call, as the form has it so far. */
function FeeLine({ charges }: { charges: Charge[] }) {
  const symbol = useSymbol()
  const fee = useFeesEstimate(charges)
  const accounts = new Set(charges.map((charge) => charge.from)).size

  return (
    <p className="text-[11.5px] text-muted-foreground">
      {fee === undefined
        ? 'Estimating fee…'
        : `Estimated fee ${formatAmount(fee, { precision: 6 })} ${symbol}${accounts > 1 ? ` for ${accounts} accounts` : ''}`}
    </p>
  )
}

/**
 * The password a dialog collects, the refusal it has to show, and whether a
 * submit is still in the air. The three go together and go the same way in
 * every dialog, so they are kept here rather than in each one.
 */
export function useCall(onClose?: () => void) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const launch = useLaunch()

  return {
    password,
    setPassword,
    error,
    setError,
    busy,
    /** Keeps the dialog open and says why in the footer. */
    refuse(message: string) {
      setError(message)
      return false
    },
    /**
     * Sends what the form came to and closes the dialog once it is signed,
     * leaving the rest to a notice in the corner. Returns false, which is what
     * a form hands back to stay open while it signs.
     */
    run(sending: Sending | Sending[], options: LaunchOptions = {}) {
      setError('')
      setBusy(true)
      launch([sending].flat(), options)
        .then(() => onClose?.())
        .catch((problem: unknown) => setError(problem instanceof Error ? problem.message : String(problem)))
        .finally(() => setBusy(false))
      return false
    },
  }
}

/** A call on its way, which settles once it is signed. */
export type Sending = Promise<Part>

export interface LaunchOptions {
  /** Runs once anything is signed, such as dropping a draft the form no longer needs. */
  sent?: () => void
  /** What to change in the form when it comes back on the calls that failed. */
  again?: (failed: Part[]) => Fields
}

/** A call that never got as far as a signature, and which one it was. */
export class Unsent extends Error {
  readonly part: Part

  constructor(message: string, part: Omit<Part, 'error'>) {
    super(message)
    this.name = 'Unsent'
    this.part = { ...part, error: message }
  }
}

/**
 * Hands whatever got signed to a notice of its own, which follows it on chain
 * and can bring the dialog back if any of it fails. Throws when nothing was
 * signed at all, since then the form is still the place to put it right.
 */
export function useLaunch() {
  const start = useJobsStore((state) => state.start)
  const finish = useJobsStore((state) => state.finish)
  const scope = useReopen()

  return async (sending: Sending[], { sent, again }: LaunchOptions = {}) => {
    // Read now, since the dialog is gone by the time anything fails
    const fields = scope?.snapshot()
    const settled = await Promise.allSettled(sending)
    const parts = settled.map((result) => {
      if (result.status === 'fulfilled') return result.value
      if (result.reason instanceof Unsent) return result.reason.part
      throw result.reason
    })
    if (parts.every((part) => part.error)) throw new Error(parts[0]?.error ?? 'Nothing was sent')

    sent?.()
    const id = start({
      parts,
      retry: scope ? (failed) => scope.reopen({ ...fields, ...again?.(failed) }, id) : undefined,
    })
    // The failure this dialog was reopened for is settled once its retry is out
    if (scope?.retrying) finish(scope.retrying)
  }
}

/** The key is decrypted here and nowhere else, for the length of one call. */
export function signerFor(account: Account, password: string): WalletAccount {
  return account.signing ?? unlockKey(account.address, password)
}

/**
 * The call as this account has to make it. A multisig sends one signature
 * towards it, a proxied account sends somebody else's, and everything else
 * makes the call itself.
 */
export function through(account: Account, signer: Account, call: Operation): Operation {
  if (account.multisig) {
    return {
      kind: 'multisigApprove',
      threshold: account.multisig.threshold,
      others: otherSignatories(account.multisig.signatories, signer.address),
      multisig: account.address,
      call,
    }
  }

  return account.proxied ? { kind: 'asProxy', real: account.address, call } : call
}

/**
 * Who puts their name to this account's calls, and what a call has to be
 * wrapped in to get there. A multisig gathers signatures and a proxied account
 * borrows one, so both pick a signatory. Anything that signs for itself picks
 * nobody and the wrapping falls away, which is why every dialog can ask for
 * this without knowing which kind of account it was handed.
 */
export function useSigning(account: Account, signers: Account[]) {
  const bench = account.multisig || account.proxied ? signers : []
  const [signing, setSigning] = useState(bench[0]?.address ?? account.address)
  const signer = bench.find((entry) => entry.address === signing) ?? bench[0] ?? account
  const send = useSubmit(signer)

  return {
    signer,
    bench,
    choose: setSigning,
    /** The call as the signer makes it, which is what a fee is quoted on. */
    wrap: (call: Operation) => through(account, signer, call),
    submit: (call: Operation, password: string) => send(through(account, signer, call), password),
    /** The call as it stands, for one that already names the multisig it goes through. */
    send,
    /** The password belongs to whoever signs, which is rarely the account. */
    needsPassword: needsPassword(signer),
  }
}

/** Nothing at all where the account signs for itself. */
export function SignerField({
  account,
  signer,
  bench,
  onChange,
  note,
}: {
  account: Account
  signer: Account
  bench: Account[]
  onChange: (address: string) => void
  /** What signing for this account means here. Null where the dialog has said it already. */
  note?: ReactNode
}) {
  if (bench.length === 0) return null

  const says =
    note !== undefined
      ? note
      : account.multisig
        ? `One of ${account.multisig.threshold} signatures. Nothing runs until the rest are in, and starting it holds a small deposit from this account until it does.`
        : 'This account registered the one above as a proxy, so the chain runs the call as this account.'

  return (
    <>
      <AddressField
        label="Signing as"
        value={signer.address}
        onChange={onChange}
        accounts={bench}
        readOnly
      />
      {says && <p className={cn('mt-1.5', NOTE)}>{says}</p>}
    </>
  )
}

/** What a settled call leaves out of date, since the next screen would read it. */
const STALE: Partial<Record<Operation['kind'], Cache[]>> = {
  delegate: ['voting'],
  undelegate: ['voting'],
  addProxy: ['proxies'],
  removeProxy: ['proxies'],
  registerIdentity: ['identity'],
  clearIdentity: ['identity'],
  setSubs: ['subs', 'identity'],
  quitSub: ['identity', 'subs'],
  vest: ['vesting'],
  vestOther: ['vesting'],
  vestedTransfer: ['vesting'],
  proposeBounty: ['bounties'],
  acceptCurator: ['bounties'],
  awardBounty: ['bounties'],
  claimBounty: ['bounties'],
  unassignCurator: ['bounties'],
  extendBounty: ['bounties'],
  addChild: ['bounties'],
  proposeChildCurator: ['bounties'],
  acceptChildCurator: ['bounties'],
  awardChild: ['bounties'],
  claimChild: ['bounties'],
  unassignChildCurator: ['bounties'],
  closeChild: ['bounties'],
  requestJudgement: ['identity'],
  provideJudgement: ['identity'],
  cancelJudgement: ['identity'],
  setFee: ['registrars'],
  setKeys: ['validators'],
  lockStake: ['validators'],
  requestExit: ['validators'],
  vote: ['referenda', 'locks', 'voting'],
  removeVote: ['referenda', 'locks', 'voting'],
  removeOtherVote: ['locks'],
  unlock: ['locks'],
  decisionDeposit: ['referenda'],
  payout: ['spends'],
  refundSubmission: ['settled'],
  refundDecision: ['settled'],
  unnotePreimage: ['preimages'],
  multisigApprove: ['pending'],
  // The wallet is holding bytes somebody else built, so the last signature on
  // one of these may have run anything at all
  multisigApproveData: [...CACHES],
  multisigCancel: ['pending'],
  propose: ['referenda'],
}

/**
 * A call that carries other calls leaves stale whatever they would have left
 * stale on their own. A batch runs its list and a multisig or a proxy runs the
 * one inside, so the wrapping says nothing about what the screens have to read
 * again.
 */
function staleFor(operation: Operation): Cache[] {
  const own = STALE[operation.kind] ?? []
  if (operation.kind === 'batch') return [...new Set(operation.calls.flatMap(staleFor))]
  if (operation.kind === 'multisigApprove' || operation.kind === 'asProxy') {
    return [...new Set([...own, ...staleFor(operation.call)])]
  }
  return own
}

/**
 * Signs, submits, and writes the walk into this tab's log. It settles once the
 * call is signed, which is where a dialog has no more to say, and the log
 * follows the rest. Waiting for finality behind a frozen form is a minute of
 * nothing on a chain that takes ten seconds a block.
 */
export function useSubmit(account: Account) {
  const send = useSend()
  return (operation: Operation, password: string) => send(account, operation, password)
}

/** useSubmit for a dialog that signs as several accounts, named at each send. */
export function useSend() {
  const { repository } = useChain()
  const record = useSessionStore((state) => state.record)
  const encode = useSessionStore((state) => state.encode)
  const remember = useCallsStore((state) => state.remember)
  const advance = useSessionStore((state) => state.advance)
  const fail = useSessionStore((state) => state.fail)
  const refresh = useRefresh()

  return (account: Account, operation: Operation, password: string): Sending =>
    new Promise((resolve, reject) => {
      const part = { address: account.address, operation }
      const refuse = (problem: unknown, fallback: string) =>
        reject(new Unsent(problem instanceof Error ? problem.message : fallback, part))

      let signing: WalletAccount
      try {
        signing = signerFor(account, password)
      } catch (problem) {
        refuse(problem, 'That account could not be opened')
        return
      }

      const id = record(account.address, operation)
      let signed = false

      // What the log shows in place of a hand written line per kind of call
      void repository
        .callData(operation)
        .then(({ name, args }) => encode(id, { name, args }))
        .catch(() => {})

      // The chain keeps only the hash of a multisig call, so the bytes are kept
      // here the moment they are built. Every other signatory has to be handed
      // them, and without them nobody can finish what this signature starts
      if (operation.kind === 'multisigApprove') {
        void repository
          .callData(operation.call)
          .then(({ hex, hash }) => remember(hash, hex))
          .catch(() => {})
      }

      repository
        .submit(signing, operation, (progress) => {
          advance(id, progress.stage, progress.hash)
          if (progress.stage === 'signed' && !signed) {
            signed = true
            resolve({ ...part, submission: id })
          }
        })
        // What a screen reads is only wrong once the chain has agreed
        .then(() => refresh(staleFor(operation)))
        .catch((problem: unknown) => {
          const message = problem instanceof Error ? problem.message : 'The chain refused it'
          fail(id, message, problem instanceof ChainError ? problem.detail : undefined)
          if (!signed) refuse(problem, message)
        })
    })
}
