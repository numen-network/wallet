import { AddressField } from './AddressField'
import { useState } from 'react'
import { useFacts, useProxies, useSymbol } from '@/chain/queries'
import { PROXY_TYPES, type Proxy, type ProxyType } from '@/chain/types'
import { resolveAddress, shorten } from '@/lib/address'
import { formatAmount } from '@/lib/balance'
import { VaultError } from '@/signing/vault'
import { Field, FieldError, Input, Modal, INSIDE } from '@/ui/Modal'
import { Select } from '@/ui/Select'
import { toast } from '@/ui/Toast'
import { AccountPassword, FeeLine, SignerField, useSigning } from './Authorize'
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
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Naming yourself as your own proxy is a call that does nothing
  const others = accounts.filter((entry) => entry.address !== account.address)

  // The base is charged once, the factor for every proxy on the list
  const deposit = !facts
    ? null
    : held?.length
      ? facts.proxyDepositFactor
      : facts.proxyDepositBase + facts.proxyDepositFactor

  const form = () => {
    setError('')

    const target = resolveAddress(delegate)
    if (!target) {
      setError('Enter the Numen or EVM address to act for this account')
      return false
    }
    if (facts && (held?.length ?? 0) >= facts.maxProxies) {
      setError(`This account already has ${facts.maxProxies} proxies`)
      return false
    }

    void send({ delegate: target, type })
    return false
  }

  const send = async (proxy: Proxy) => {
    setBusy(true)
    try {
      await submit({ kind: 'addProxy', proxy }, password)
      toast('Proxy sent')
      onClose()
    } catch (problem) {
      if (problem instanceof VaultError) setError(problem.message)
      else setError(problem instanceof Error ? problem.message : 'The proxy could not be added')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Add proxy"
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy}
      footNote={
        deposit !== null &&
        `${formatAmount(deposit, { precision: 2 })} ${symbol} held on deposit`
      }
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

      {needsPassword && (
        <AccountPassword
          value={password}
          note="Unlocks this account for one signature"
          onChange={setPassword}
        />
      )}
      <FieldError>{error}</FieldError>

      <p className="mt-3 text-[12.5px] text-dim">
        {deposit !== null && formatAmount(deposit, { precision: 2 })} {symbol} is reserved while this proxy
        stands, and returns when it is removed.
      </p>
      <FeeLine
        from={signer.address}
        operation={wrap({ kind: 'addProxy', proxy: { delegate: account.address, type } })}
      />
    </Modal>
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
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const proxies = held ?? []
  const selected = proxies.find((proxy) => proxyKey(proxy) === chosen) ?? proxies[0]

  const form = () => {
    setError('')
    if (!selected) return false

    void send(selected)
    return false
  }

  const send = async (proxy: Proxy) => {
    setBusy(true)
    try {
      await submit({ kind: 'removeProxy', proxy }, password)
      toast('Sent')
      onClose()
    } catch (problem) {
      if (problem instanceof VaultError) setError(problem.message)
      else setError(problem instanceof Error ? problem.message : 'The proxy could not be removed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Remove proxy"
      submitLabel={busy ? 'Signing…' : 'Sign and send'}
      disabled={busy || !selected}
      onClose={onClose}
      onSubmit={form}
    >
      {proxies.length === 0 ? (
        <p className="text-[13.5px] text-lead">
          {isPending ? 'Reading the chain…' : `Nothing acts for ${account.name}.`}
        </p>
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

          {needsPassword && (
            <AccountPassword
              value={password}
              note="Unlocks this account for one signature"
              onChange={setPassword}
            />
          )}
          <FieldError>{error}</FieldError>

          {selected && (
            <FeeLine
              from={signer.address}
              operation={wrap({ kind: 'removeProxy', proxy: selected })}
            />
          )}
        </>
      )}
    </Modal>
  )
}
