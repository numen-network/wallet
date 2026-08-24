import { useState } from 'react'
import { Button } from '@/ui/Button'
import { CopyIcon, EyeOffIcon } from '@/ui/icons'
import { Identicon } from '@/ui/Identicon'
import { Modal } from '@/ui/Modal'
import { Qr, QR_SIZE } from '@/ui/Qr'
import { copyAddress } from '@/ui/clipboard'
import type { Account } from './types'

function AddressBlock({ kind, address }: { kind: string; address: string }) {
  // Covering a code is for whoever is looking over your shoulder right now, so
  // it lasts as long as the dialog does and every account opens showing both
  const [hidden, setHidden] = useState(false)

  return (
    <div className="flex min-w-[150px] flex-1 flex-col items-center gap-[7px]">
      <div className="text-[10.5px] font-bold tracking-[0.08em] text-dim uppercase">
        {kind} address
      </div>
      <div className="rounded-[6px] border border-line bg-white p-2.5">
        {hidden ? (
          <div
            style={{ width: QR_SIZE, height: QR_SIZE }}
            className="grid place-items-center text-dim"
          >
            <EyeOffIcon className="size-9" />
          </div>
        ) : (
          <Qr text={address} />
        )}
      </div>
      <div className="font-mono text-[11px] leading-relaxed break-all text-lead">{address}</div>
      <Button
        type="button"
        className="px-2.5 py-1 text-[12.5px]"
        onClick={() => copyAddress(address)}
      >
        <CopyIcon />
        Copy
      </Button>
      {/* The heading says which address this is, the label has to say it again */}
      <button
        type="button"
        aria-label={`${hidden ? 'Show' : 'Hide'} the ${kind} QR code`}
        className="text-xs text-dim underline underline-offset-2 hover:text-lead"
        onClick={() => setHidden(!hidden)}
      >
        {hidden ? 'Show QR code' : 'Hide QR code'}
      </button>
    </div>
  )
}

export function ReceiveModal({ account, onClose }: { account: Account; onClose: () => void }) {
  return (
    <Modal title="Receive" submitLabel="Done" cancelLabel={null} onClose={onClose}>
      <div className="flex flex-col items-center gap-2.5 text-center">
        <Identicon address={account.address} size={54} />
        <div className="text-base font-bold">{account.name}</div>

        <div className="flex flex-wrap justify-center gap-3.5 self-stretch">
          <AddressBlock kind="Numen" address={account.address} />
          {account.evmAddress && <AddressBlock kind="EVM" address={account.evmAddress} />}
        </div>
      </div>
    </Modal>
  )
}
