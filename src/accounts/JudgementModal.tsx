import { useState } from 'react'
import { useChain } from '@/chain/provider'
import type { Operation } from '@/chain/types'
import { useRegistrars, useStanding } from '@/chain/queries'
import { botRegistrar, CHANNELS, isChecked, LABELS, pendingWith } from '@/chain/identity'
import { cn } from '@/lib/cn'
import { NOTE } from '@/components/ui/field'
import { LEDE } from '@/ui/Modal'
import { CallModal, SignerField, useCall, useSigning } from './Authorize'
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
  const call = useCall(onClose)

  const pending = pendingWith(registration ?? null)
  // The automated one only takes the transfer riding the identity dialog, a
  // manual request to it would sit unjudged forever, so this list leaves it out
  const bot = botRegistrar(registrars ?? [], network.registrar)
  const askable = registrars?.filter((entry) => entry.index !== bot?.index)
  const registrar = askable?.find((entry) => entry.index === chosen) ?? askable?.[0] ?? null
  const claimed = CHANNELS.filter((channel) => registration?.info[channel])
  const checked = registration?.judgements.find((verdict) => isChecked(verdict.judgement))

  const operation: Operation | null =
    pending !== null
      ? { kind: 'cancelJudgement', registrar: pending }
      : registrar
        ? { kind: 'requestJudgement', registrar: registrar.index, maxFee: registrar.fee }
        : null

  const form = () => {
    if (!registration) return call.refuse('Set an identity first, there is nothing to check yet')
    if (!operation) return call.refuse('This chain has no registrar to ask')

    return call.run(submit(operation, call.password))
  }

  return (
    <CallModal
      title={pending === null ? 'Ask a registrar' : 'Withdraw the request'}
      submitLabel={pending === null ? 'Sign and send' : 'Withdraw it'}
      busy={call.busy}
      danger={pending !== null}
      from={signer.address}
      needsPassword={needsPassword}
      operation={operation && wrap(operation)}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      {pending !== null ? (
        <p className={LEDE}>
          Registrar {pending} is being paid to check this identity. Withdrawing takes the fee back
          and leaves the identity as it is.
        </p>
      ) : (
        <>
          <p className={LEDE}>
            The registrar checks that the handles on this identity are yours, then records that on
            chain. The fee is reserved with this signature and only handed over when the judgement
            lands.
          </p>

          {claimed.length === 0 ? (
            <p className="mt-2.5 text-[12.5px] text-destructive">
              This identity claims no X, Telegram or Discord handle, so there is nothing to check.
            </p>
          ) : (
            <p className={cn('mt-2.5', NOTE)}>
              Claiming {claimed.map((channel) => LABELS[channel]).join(', ')}.
            </p>
          )}

          {checked && (
            <p className={cn('mt-2.5', NOTE)}>
              Registrar {checked.registrar} has already checked this one.
            </p>
          )}

          {askable && registrar ? (
            <RegistrarField registrars={askable} value={registrar.index} onChange={setChosen} />
          ) : (
            <p className="mt-2.5 text-[12.5px] text-destructive">
              No registrar takes a manual request on this chain, so there is nobody to ask here.
            </p>
          )}
        </>
      )}

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />
    </CallModal>
  )
}
