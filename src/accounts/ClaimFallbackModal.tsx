import { useStranded, useSymbol } from '@/chain/queries'
import type { Operation } from '@/chain/types'
import { Card } from '@/components/ui/card'
import { DECIMALS } from '@/chain/config'
import { fallbackAccount, reviveAddress, shorten } from '@/lib/address'
import { formatAmount } from '@/lib/balance'
import { Facts } from '@/ui/Facts'
import { LEDE } from '@/ui/Modal'
import { AddressField } from './AddressField'
import { CallModal, SignerField, useCall, useSigning } from './Authorize'
import type { Account } from './types'

/**
 * Moves what reached the account's H160 before the chain mapped it. The chain
 * kept it at the H160 padded with 0xEE, which the account reaches through
 * dispatch_as_fallback_account.
 */
export function ClaimFallbackModal({
  account,
  signers,
  onClose,
}: {
  account: Account
  signers: Account[]
  onClose: () => void
}) {
  const symbol = useSymbol()
  const { data: stranded } = useStranded(account.address)
  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)
  const call = useCall(onClose)

  const operation: Operation = { kind: 'claimFallback', to: account.address }

  const form = () => {
    if (!stranded) return call.refuse(`Nothing is waiting at this account's EVM address`)
    return call.run(submit(operation, call.password))
  }

  return (
    <CallModal
      title="Claim"
      submitLabel="Sign and claim"
      busy={call.busy}
      from={signer.address}
      needsPassword={needsPassword}
      operation={wrap(operation)}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      onClose={onClose}
      onSubmit={form}
    >
      <p className={LEDE}>
        Someone paid this account's EVM address before the account existed. Claiming moves the
        funds here.
      </p>

      <AddressField
        label="To"
        value={account.address}
        onChange={() => {}}
        accounts={[account]}
        readOnly
      />

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />

      <Card variant="muted" size="sm" className="mt-2.5">
        <Facts
          rows={[
            { name: 'EVM address', value: shorten(reviveAddress(account.address)) },
            { name: 'held at', value: shorten(fallbackAccount(account.address)) },
            {
              name: 'amount',
              value:
                stranded === undefined
                  ? 'reading…'
                  : `${formatAmount(stranded, { precision: DECIMALS, pad: false })} ${symbol}`,
            },
          ]}
        />
      </Card>
    </CallModal>
  )
}
