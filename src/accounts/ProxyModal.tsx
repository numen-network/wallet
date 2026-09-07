import { AddressField } from './AddressField'
import { useState } from 'react'
import { useFacts, useProxies, useSymbol } from '@/chain/queries'
import { PROXY_TYPES, type Proxy, type ProxyType } from '@/chain/types'
import { cn } from '@/lib/cn'
import { resolveAddress } from '@/lib/address'
import { formatAmount } from '@/lib/balance'
import { NOTE } from '@/components/ui/field'
import { Empty } from '@/components/ui/empty'
import { Field, INSIDE } from '@/ui/Field'
import { Select } from '@/ui/Select'
import { CallModal, SignerField, useCall, useSigning } from './Authorize'
import type { Account } from './types'


const typeOptions = PROXY_TYPES.map((type) => ({ value: type.value, label: type.label }))

const proxyKey = (proxy: Proxy) => `${proxy.type}:${proxy.delegate}`

/**
 * A proxy is an account allowed to act for this one, filtered by type. The
 * chain reserves a deposit for holding the list, which is the part worth showing
 * since it dwarfs the fee.
 */
export function AddProxyModal({
  account,
  accounts,
  signers,
  onClose,
}: {
  account: Account
  accounts: Account[]
  signers: Account[]
  onClose: () => void
}) {
  const symbol = useSymbol()
  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const { data: held } = useProxies(account.address)
  const { data: facts } = useFacts()
  const [delegate, setDelegate] = useState('')
  const [type, setType] = useState<ProxyType>('Governance')
  const call = useCall(onClose)
  // Naming yourself as your own proxy is a call that does nothing
  const others = accounts.filter((entry) => entry.address !== account.address)

  // The base is charged once, the factor for every proxy on the list
  const deposit = !facts
    ? null
    : held?.length
      ? facts.proxyDepositFactor
      : facts.proxyDepositBase + facts.proxyDepositFactor

  const form = () => {
    const target = resolveAddress(delegate)
    if (!target) {
      call.setError('Enter the Numen or EVM address to act for this account')
      return false
    }
    if (facts && (held?.length ?? 0) >= facts.maxProxies) {
      call.setError(`This account already has ${facts.maxProxies} proxies`)
      return false
    }

    const proxy: Proxy = { delegate: target, type }
    return call.run(submit({ kind: 'addProxy', proxy }, call.password), 'Proxy sent')
  }

  return (
    <CallModal
      title="Add proxy"
      submitLabel="Sign and send"
      busy={call.busy}
      footNote={
        deposit !== null &&
        `${formatAmount(deposit, { precision: 2 })} ${symbol} held on deposit`
      }
      from={signer.address}
      needsPassword={needsPassword}
      operation={wrap({ kind: 'addProxy', proxy: { delegate: account.address, type } })}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      <AddressField
        label="Proxy account"
        value={delegate}
        onChange={setDelegate}
        accounts={others}
      />

      <Field label="Allowed to do">
        <Select
          value={type}
          onValueChange={(value) => setType(value as ProxyType)}
          options={typeOptions}
          label="Proxy type"
          className={INSIDE}
        />
      </Field>

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />

      <p className={cn('mt-3', NOTE)}>
        {deposit !== null && formatAmount(deposit, { precision: 2 })} {symbol} is reserved while this proxy
        stands, and returns when it is removed.
      </p>
    </CallModal>
  )
}

/** Takes one off the list, which is also what gives the deposit back. */
export function RemoveProxyModal({
  account,
  signers,
  onClose,
}: {
  account: Account
  signers: Account[]
  onClose: () => void
}) {
  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const { data: held, isPending } = useProxies(account.address)
  const [chosen, setChosen] = useState('')
  const call = useCall(onClose)

  const proxies = held ?? []
  const selected = proxies.find((proxy) => proxyKey(proxy) === chosen) ?? proxies[0]

  const form = () => {
    if (!selected) return false

    return call.run(submit({ kind: 'removeProxy', proxy: selected }, call.password))
  }

  return (
    <CallModal
      title="Remove proxy"
      submitLabel="Sign and send"
      busy={call.busy}
      disabled={!selected}
      from={signer.address}
      needsPassword={proxies.length > 0 && needsPassword}
      operation={selected ? wrap({ kind: 'removeProxy', proxy: selected }) : null}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      {proxies.length === 0 ? (
        <Empty className="mt-0 p-6">
          {isPending ? 'Reading the chain…' : `Nothing acts for ${account.name}.`}
        </Empty>
      ) : (
        <>
          <AddressField
            label="Proxy"
            value={selected?.delegate ?? ''}
            onChange={() => {}}
            onPick={(picked) => setChosen(picked.key)}
            accounts={proxies.map((proxy) => ({
              address: proxy.delegate,
              name: proxy.type,
              key: proxyKey(proxy),
            }))}
            readOnly
          />

          <SignerField account={account} signer={signer} bench={bench} onChange={choose} />

        </>
      )}
    </CallModal>
  )
}
