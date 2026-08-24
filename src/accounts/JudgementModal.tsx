import { useState } from 'react'
import { useChain } from '@/chain/provider'
import { useRegistrars, useStanding } from '@/chain/queries'
import { botRegistrar, CHANNELS, isChecked, LABELS, pendingWith } from '@/chain/identity'
import { formatAmount } from '@/lib/balance'
import { VaultError } from '@/signing/vault'
import { FieldError, Modal } from '@/ui/Modal'
import { toast } from '@/ui/Toast'
import { AccountPassword, FeeLine, SignerField, useSigning } from './Authorize'
import { RegistrarField } from './RegistrarField'
import type { Account } from './types'

/**
 * A registrar checks that the handles an identity claims belong to whoever holds
 * the account. The wallet only pays for the check, the proving happens on the
 * registrar's own site, which is the only place the handles can be logged into.
 */
export function JudgementModal({
  account,
  signers,
  onClose,
}: {
  account: Account
  signers: Account[]
  onClose: () => void
}) {
  const { network } = useChain()
  const { data: standing } = useStanding(account.address)
  const registration = standing?.own ?? null
  const { data: registrars } = useRegistrars()
  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const [chosen, setChosen] = useState<number | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const pending = pendingWith(registration ?? null)
  // The automated one only takes the transfer riding the identity dialog, a
  // manual request to it would sit unjudged forever, so this list leaves it out
  const bot = botRegistrar(registrars ?? [])
  const askable = registrars?.filter((entry) => entry.index !== bot?.index)
  const registrar = askable?.find((entry) => entry.index === chosen) ?? askable?.[0] ?? null
  const claimed = CHANNELS.filter((channel) => registration?.info[channel])
  const checked = registration?.judgements.find((verdict) => isChecked(verdict.judgement))

  const operation =
    pending !== null
      ? ({ kind: 'cancelJudgement', registrar: pending } as const)
      : ({ kind: 'requestJudgement', registrar: registrar?.index ?? 0, maxFee: registrar?.fee ?? 0n } as const)

  const form = () => {
    setError('')

    if (!registration) {
      setError('Set an identity first, there is nothing to check yet')
      return false
    }
    if (pending === null && !registrar) {
      setError('This chain has no registrar to ask')
      return false
    }

    void send()
    return false
  }

  const send = async () => {
    setBusy(true)
    try {
      await submit(operation, password)
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
      title={pending === null ? 'Ask a registrar' : 'Withdraw the request'}
      submitLabel={busy ? 'Signing…' : pending === null ? 'Sign and send' : 'Withdraw it'}
      danger={pending !== null}
      disabled={busy}
      onClose={onClose}
      onSubmit={form}
    >
      {pending !== null ? (
        <p className="text-[13.5px] text-lead">
          Registrar {pending} is being paid to check this identity. Withdrawing takes the fee back
          and leaves the identity as it is.
        </p>
      ) : (
        <>
          <p className="text-[13.5px] text-lead">
            The registrar checks that the handles on this identity are yours, then records that on
            chain. The fee is reserved with this signature and only handed over when the judgement
            lands.
          </p>

          {claimed.length === 0 ? (
            <p className="mt-2.5 text-[12.5px] text-bad">
              This identity claims no X, Telegram or Discord handle, so there is nothing to check.
            </p>
          ) : (
            <p className="mt-2.5 text-[12.5px] text-dim">
              Claiming {claimed.map((channel) => LABELS[channel]).join(', ')}.
            </p>
          )}

          {checked && (
            <p className="mt-2.5 text-[12.5px] text-dim">
              Registrar {checked.registrar} has already checked this one.
            </p>
          )}

          {askable && registrar ? (
            <RegistrarField registrars={askable} value={registrar.index} onChange={setChosen} />
          ) : (
            <p className="mt-2.5 text-[12.5px] text-bad">
              No registrar takes a manual request on this chain, so there is nobody to ask here.
            </p>
          )}
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
