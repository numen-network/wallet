import { useEffect, useState } from 'react'
import { useChain } from '@/chain/provider'
import { usePending, useSymbol } from '@/chain/queries'
import type { Pending, ReadCall } from '@/chain/types'
import { shorten } from '@/lib/address'
import { formatAmount } from '@/lib/balance'
import { VaultError } from '@/signing/vault'
import { Button } from '@/ui/Button'
import { CopyButton } from '@/ui/CopyButton'
import { Facts } from '@/ui/Facts'
import { Field, FieldError, Input, Modal } from '@/ui/Modal'
import { toast } from '@/ui/Toast'
import { AddressField } from './AddressField'
import { describe } from './activity'
import { AccountPassword, useSubmit } from './Authorize'
import { readAgainst, useCallsStore } from './calls'
import { otherSignatories } from './multisig'
import { needsPassword, type Account } from './types'

/**
 * What this multisig has started and not finished.
 *
 * The chain keeps the hash of a waiting call and nothing else, so a signatory
 * on another device sees a hash until somebody hands them the bytes behind it.
 * Nothing here signs a call it has not read, which is the whole reason the
 * bytes travel at all.
 */
export function PendingModal({
  account,
  signers,
  accounts,
  onClose,
}: {
  account: Account
  signers: Account[]
  /** Everything the wallet holds, so a signatory it knows is named rather than shortened. */
  accounts: Account[]
  onClose: () => void
}) {
  const symbol = useSymbol()
  const { data: pending, isPending } = usePending([account.address])
  const calls = useCallsStore((state) => state.calls)
  const [signing, setSigning] = useState(signers[0]?.address ?? account.address)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const signer = signers.find((entry) => entry.address === signing) ?? signers[0] ?? account
  const submit = useSubmit(signer)
  const threshold = account.multisig?.threshold ?? 0
  const waiting = pending ?? []
  const others = otherSignatories(account.multisig?.signatories ?? [], signer.address)
  const signatories = account.multisig?.signatories ?? []
  // A signatory this wallet holds has a name worth more than its address
  const name = (address: string) =>
    accounts.find((entry) => entry.address === address)?.name ?? 'Not in this wallet'

  const run = async (what: Promise<unknown>) => {
    setError('')
    setBusy(true)
    try {
      await what
      toast('Sent')
    } catch (problem) {
      if (problem instanceof VaultError) setError(problem.message)
      else setError(problem instanceof Error ? problem.message : 'The chain refused it')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Multisig approvals" submitLabel={null} cancelLabel="Close" onClose={onClose}>
      {isPending ? (
        <p className="text-[13.5px] text-lead">Reading the chain…</p>
      ) : waiting.length === 0 ? (
        <p className="text-[13.5px] text-lead">
          Nothing is waiting. A call this multisig starts shows up here until enough signatories
          have put their name to it.
        </p>
      ) : (
        <div className="grid gap-2.5">
          {waiting.map((call) => (
            <WaitingCall
              key={call.callHash}
              call={call}
              held={calls[call.callHash]}
              signatories={signatories}
              name={name}
              threshold={threshold}
              signed={call.approvals.includes(signer.address)}
              mine={call.depositor === signer.address}
              symbol={symbol}
              busy={busy}
              onSign={(hex, label) =>
                void run(
                  submit(
                    {
                      kind: 'multisigApproveData',
                      threshold,
                      others,
                      multisig: account.address,
                      hex,
                      label,
                    },
                    password,
                  ),
                )
              }
              onCancel={() =>
                void run(
                  submit(
                    {
                      kind: 'multisigCancel',
                      threshold,
                      others,
                      multisig: account.address,
                      callHash: call.callHash,
                    },
                    password,
                  ),
                )
              }
            />
          ))}
        </div>
      )}

      {signers.length > 1 && (
        <AddressField
          label="Signing as"
          value={signer.address}
          onChange={setSigning}
          accounts={signers}
          readOnly
        />
      )}

      {waiting.length > 0 && needsPassword(signer) && (
        <AccountPassword
          value={password}
          note="Unlocks this account for one signature"
          onChange={setPassword}
        />
      )}
      <FieldError>{error}</FieldError>
    </Modal>
  )
}

/**
 * One waiting call. Reading the bytes is what turns a hash into something worth
 * signing, so it is the only way here to a signature, and the bytes are checked
 * against the hash the chain named them by rather than taken on trust.
 */
function WaitingCall({
  call,
  held,
  signatories,
  name,
  threshold,
  signed,
  mine,
  symbol,
  busy,
  onSign,
  onCancel,
}: {
  call: Pending
  /** The bytes this wallet has for it, from starting it or being handed them. */
  held: string | undefined
  /** Everybody whose signature counts, in the order the multisig was built from. */
  signatories: string[]
  name: (address: string) => string
  threshold: number
  /** Whether the account about to sign has already signed this one. */
  signed: boolean
  mine: boolean
  symbol: string
  busy: boolean
  onSign: (hex: string, label: string) => void
  onCancel: () => void
}) {
  const { repository } = useChain()
  const remember = useCallsStore((state) => state.remember)
  const [typed, setTyped] = useState('')
  const [problem, setProblem] = useState('')
  const [reading, setReading] = useState(false)
  const [known, setKnown] = useState<{ hex: string; read: ReadCall } | null>(null)

  const check = async (hex: string, keep: boolean) => {
    setProblem('')
    setReading(true)
    try {
      const read = await readAgainst((data) => repository.readCall(data), hex, call.callHash)
      setKnown({ hex, read })
      if (keep) remember(call.callHash, hex)
    } catch (trouble) {
      setProblem(trouble instanceof Error ? trouble.message : 'Those bytes are not a call')
    } finally {
      setReading(false)
    }
  }

  // What this wallet already holds still gets read against the hash, since it
  // may have been kept before the chain moved on
  useEffect(() => {
    if (held) void check(held, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held, call.callHash])

  // Whole addresses, since this is the last look anybody gets before signing
  const said =
    known && (known.read.operation ? describe(known.read.operation, symbol, undefined, { whole: true }) : null)
  const enough = call.approvals.length + (signed ? 0 : 1) >= threshold

  return (
    <div className="rounded-[6px] border border-line bg-recess p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold">
          {call.approvals.length} of {threshold} signed
        </span>
        <span className="ml-auto text-[12px] text-dim">
          call hash <span className="font-mono">{call.callHash.slice(0, 12)}…</span>
        </span>
        <CopyButton text={call.callHash} label="Copy the call hash" />
      </div>

      {known ? (
        // The wallet's own words where it has them, and what the runtime calls
        // it where it does not. Either way the call is read out argument by
        // argument, since that is what is about to be signed
        <div className="mt-1.5 text-[13.5px]">
          <b className={`font-semibold ${said ? '' : 'font-mono'}`}>
            {said?.title ?? known.read.label}
          </b>
          <Facts rows={said?.fields ?? known.read.args} />
        </div>
      ) : (
        <p className="mt-1.5 text-[12.5px] text-dim">
          Nobody has shown this wallet what that hash stands for. Whoever started it can copy the
          call data across.
        </p>
      )}

      {/* Who is behind it, since a count of signatures says nothing about whose */}
      <ul className="mt-2 grid gap-1 text-[12.5px]">
        {signatories.map((address) => (
          <li key={address} className="flex items-baseline gap-2">
            <span className={call.approvals.includes(address) ? 'text-accent' : 'text-hint'}>
              {call.approvals.includes(address) ? '✓' : '·'}
            </span>
            <span className={call.approvals.includes(address) ? '' : 'text-dim'}>
              {name(address)}
            </span>
            <span className="ml-auto font-mono text-[11.5px] text-dim">{shorten(address)}</span>
            {address === call.depositor && (
              <span className="text-[10.5px] font-bold tracking-[0.06em] text-dim uppercase">
                started it
              </span>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-1.5 text-[12.5px] text-dim">
        Holding {formatAmount(call.deposit, { precision: 2 })} {symbol} from whoever started it,
        until it lands or is called off
      </p>

      {!known && (
        <>
          <Field label="Call data">
            <Input
              value={typed}
              spellCheck={false}
              className="font-mono text-[12.5px]"
              placeholder="0x…"
              onChange={(event) => setTyped(event.target.value)}
            />
          </Field>
          <Button
            type="button"
            className="mt-2"
            disabled={reading || typed.trim() === ''}
            onClick={() => void check(typed.trim(), true)}
          >
            Read it
          </Button>
        </>
      )}

      {problem && <p className="mt-1.5 text-[12.5px] text-bad">{problem}</p>}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {known && (!signed || call.approvals.length >= threshold) && (
          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={() => onSign(known.hex, said ? said.title : known.read.label)}
          >
            {signed ? 'Run it' : enough ? 'Sign and run it' : 'Add my signature'}
          </Button>
        )}
        {known && signed && call.approvals.length < threshold && (
          <span className="text-[12.5px] text-dim">
            You have signed this one. It runs once the rest have.
          </span>
        )}
        {known && (
          <CopyButton
            text={known.hex}
            label="Copy the call data"
            spelled
            className="rounded-[4px] border border-line-strong px-2.5 py-1.5"
          />
        )}
        {mine && (
          <Button type="button" disabled={busy} onClick={onCancel}>
            Call it off
          </Button>
        )}
      </div>
    </div>
  )
}
