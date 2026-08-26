import { useState } from 'react'
import { useChain } from '@/chain/provider'
import {
  useFeeEstimate,
  useRefreshIdentity,
  useRefreshSubs,
  useRefreshBounties,
  useRefreshVesting,
  useRefreshLocks,
  useRefreshProxies,
  useRefreshReferenda,
  useRefreshPending,
  useRefreshPreimages,
  useRefreshRegistrars,
  useRefreshSettled,
  useRefreshSpends,
  useSymbol,
} from '@/chain/queries'
import { useRefusalStore } from '@/chain/RefusalModal'
import { ChainError, ShownError } from '@/chain/refusal'
import type { Operation } from '@/chain/types'
import { formatAmount } from '@/lib/balance'
import type { WalletAccount } from '@/signing/types'
import { unlockKey } from '@/signing/vault'
import { Field, Input } from '@/ui/Modal'
import { toast, toastProblem, toastSettled, toastWorking } from '@/ui/Toast'
import { AddressField } from './AddressField'
import { describe, SETTLED, WORKING } from './activity'
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

/** What the chain would charge for this call, as the form has it so far. */
export function FeeLine({ from, operation }: { from: string; operation: Operation }) {
  const symbol = useSymbol()
  const { data: fee } = useFeeEstimate(from, operation)

  return (
    <p className="mt-3 text-[12.5px] text-lead">
      {fee === undefined
        ? 'Estimating fee…'
        : `Estimated fee ${formatAmount(fee, { precision: 6 })} ${symbol}`}
    </p>
  )
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
}: {
  account: Account
  signer: Account
  bench: Account[]
  onChange: (address: string) => void
}) {
  if (bench.length === 0) return null

  return (
    <>
      <AddressField
        label="Signing as"
        value={signer.address}
        onChange={onChange}
        accounts={bench}
        readOnly
      />
      <p className="mt-1.5 text-[12.5px] text-dim">
        {account.multisig
          ? `One of ${account.multisig.threshold} signatures. Nothing runs until the rest are in, and starting it holds a small deposit from this account until it does.`
          : 'This account registered the one above as a proxy, so the chain runs the call as this account.'}
      </p>
    </>
  )
}

const CACHES = [
  'proxies',
  'identity',
  'subs',
  'vesting',
  'bounties',
  'referenda',
  'spends',
  'settled',
  'preimages',
  'pending',
  'locks',
  'registrars',
] as const

type Cache = (typeof CACHES)[number]

/** What a settled call leaves out of date, since the next screen would read it. */
const STALE: Partial<Record<Operation['kind'], Cache[]>> = {
  addProxy: ['proxies'],
  removeProxy: ['proxies'],
  registerIdentity: ['identity'],
  clearIdentity: ['identity'],
  setSubs: ['subs', 'identity'],
  quitSub: ['identity', 'subs'],
  vest: ['vesting'],
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
  vote: ['referenda', 'locks'],
  removeVote: ['referenda', 'locks'],
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
 * Signs, submits, and writes the walk into this tab's log. It resolves once the
 * call is out on the network, which is where a dialog has no more to say, and
 * follows the rest on its own. Waiting for finality behind a frozen form is a
 * minute of nothing on a chain that takes ten seconds a block.
 */
export function useSubmit(account: Account) {
  const { repository } = useChain()
  const symbol = useSymbol()
  const record = useSessionStore((state) => state.record)
  const encode = useSessionStore((state) => state.encode)
  const remember = useCallsStore((state) => state.remember)
  const advance = useSessionStore((state) => state.advance)
  const fail = useSessionStore((state) => state.fail)
  const raise = useRefusalStore((state) => state.raise)
  const refresh: Record<Cache, () => void> = {
    proxies: useRefreshProxies(),
    identity: useRefreshIdentity(),
    subs: useRefreshSubs(),
    vesting: useRefreshVesting(),
    bounties: useRefreshBounties(),
    referenda: useRefreshReferenda(),
    spends: useRefreshSpends(),
    settled: useRefreshSettled(),
    preimages: useRefreshPreimages(),
    pending: useRefreshPending(),
    locks: useRefreshLocks(),
    registrars: useRefreshRegistrars(),
  }

  return (operation: Operation, password: string) =>
    new Promise<void>((resolve, reject) => {
      let signing: WalletAccount
      try {
        signing = signerFor(account, password)
      } catch (problem) {
        reject(problem instanceof Error ? problem : new Error('That account could not be opened'))
        return
      }

      const id = record(account.address, operation)
      const { title } = describe(operation, symbol)
      toastWorking(id, title, WORKING.signed)
      let out = false

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
          toastWorking(id, title, WORKING[progress.stage])
          if (progress.stage === 'broadcast') {
            out = true
            resolve()
          }
        })
        .then(() => {
          toastSettled(id)
          // What a screen reads is only wrong once the chain has agreed
          for (const cache of staleFor(operation)) refresh[cache]()
          toast(SETTLED[operation.kind])
        })
        .catch((problem: unknown) => {
          const message = problem instanceof Error ? problem.message : 'The chain refused it'
          toastSettled(id)
          fail(id, message)
          // A toast is gone before a refusal like this can be read, let alone acted on
          if (problem instanceof ChainError) {
            raise({ message, detail: problem.detail })
            if (!out) reject(new ShownError())
            return
          }

          if (out) toastProblem(message)
          else reject(problem instanceof Error ? problem : new Error(message))
        })
    })
}
