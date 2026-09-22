import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CAPTION } from '@/components/ui/field'
import { Copy, EyeOff } from 'lucide-react'
import { Identicon } from '@/ui/Identicon'
import { Modal } from '@/ui/Modal'
import { Qr, QR_SIZE } from '@/ui/Qr'
import { copyText } from '@/ui/clipboard'
import type { Token } from '@/chain/types'
import type { Account } from './types'

function AddressBlock({ kind, address }: { kind: string; address: string }) {
  // Covering a code is for whoever is looking over your shoulder right now, so
  // it lasts as long as the dialog does and every account opens showing both
  const [hidden, setHidden] = useState(false)

  return (
    <div className="flex min-w-[150px] flex-1 flex-col items-center gap-[7px]">
      <div className={CAPTION}>{kind} address</div>
      <div className="rounded-lg border border-border bg-white p-2.5">
        {hidden ? (
          <div
            style={{ width: QR_SIZE, height: QR_SIZE }}
            className="grid place-items-center text-dim"
          >
            <EyeOff className="size-9" />
          </div>
        ) : (
          <Qr text={address} />
        )}
      </div>
      <div className="font-mono text-[11px] leading-relaxed break-all text-muted-foreground">{address}</div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => copyText(address)}
      >
        <Copy />
        Copy
      </Button>
      {/* The heading says which address this is, the label has to say it again */}
      <Button
        type="button"
        variant="link"
        size="sm"
        aria-label={`${hidden ? 'Show' : 'Hide'} the ${kind} QR code`}
        onClick={() => setHidden(!hidden)}
      >
        {hidden ? 'Show QR code' : 'Hide QR code'}
      </Button>
    </div>
  )
}

export function ReceiveModal({
  account,
  token,
  onClose,
}: {
  account: Account
  /** A token, which only the EVM address can receive, so the Numen one is left out. */
  token?: Token | undefined
  onClose: () => void
}) {
  return (
    <Modal
      title={token ? `Receive ${token.symbol}` : 'Receive'}
      submitLabel="Done"
      cancelLabel={null}
      onClose={onClose}
    >
      <div className="flex flex-col items-center gap-2.5 text-center">
        <Identicon address={account.address} size={54} />
        <div className="text-base font-bold">{account.name}</div>

        <div className="flex flex-wrap justify-center gap-3.5 self-stretch">
          {!token && <AddressBlock kind="Numen" address={account.address} />}
          {account.evmAddress && <AddressBlock kind="EVM" address={account.evmAddress} />}
        </div>
      </div>
    </Modal>
  )
}
