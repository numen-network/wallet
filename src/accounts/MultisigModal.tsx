import { useMemo, useState } from 'react'
import { shorten } from '@/lib/address'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'
import { Field, FieldError, Input, Modal } from '@/ui/Modal'
import { toast } from '@/ui/Toast'
import { AddressField } from './AddressField'
import { GroupField } from './GroupField'
import { UNGROUPED_ID } from './layout'
import { deriveMultisig } from './multisig'
import { useAccountsStore } from './store'
import type { Account } from './types'

/** The floor for a multisig, so the rows never fall below what one needs. */
const LEAST = 2

export function MultisigModal({ accounts, onClose }: { accounts: Account[]; onClose: () => void }) {
  const layout = useAccountsStore((s) => s.layout)
  const addMultisig = useAccountsStore((s) => s.addMultisig)
  const moveAccount = useAccountsStore((s) => s.moveAccount)

  const [name, setName] = useState('')
  const [rows, setRows] = useState<string[]>(Array(LEAST).fill(''))
  const [threshold, setThreshold] = useState('2')
  const [groupId, setGroupId] = useState(UNGROUPED_ID)
  const [error, setError] = useState('')

  const derived = useMemo(() => deriveMultisig(rows, Number(threshold)), [rows, threshold])

  const setRow = (index: number, value: string) =>
    setRows(rows.map((entry, at) => (at === index ? value : entry)))

  const submit = () => {
    if (!derived) {
      setError('Enter at least two different signatory addresses and a threshold within their count')
      return false
    }
    if (layout.multisig.some((entry) => entry.address === derived.address)) {
      setError('That multisig is already in the wallet')
      return false
    }

    addMultisig({
      address: derived.address,
      name: name.trim() || 'Multisig',
      threshold: Number(threshold),
      signatories: derived.signatories,
    })
    moveAccount(derived.address, groupId, Number.MAX_SAFE_INTEGER)
    toast('Multisig added')
  }

  return (
    <Modal title="Add multisig" submitLabel="Add" onClose={onClose} onSubmit={submit}>
      <Field label="Name">
        <Input
          value={name}
          maxLength={40}
          placeholder="Multisig"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      {/* One box per signatory, since a set of addresses is a list rather than a
          paragraph, and each one is worth an identicon and a name */}
      <p className="caption mt-4">Signatories</p>

      {rows.map((row, index) => (
        <div key={index} className="mt-1.5 grid grid-cols-[1fr_28px] items-start gap-x-2">
          <AddressField
            label={`Signatory ${index + 1}`}
            value={row}
            onChange={(next) => setRow(index, next)}
            accounts={accounts}
            className="w-full"
            labelled={false}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove signatory ${index + 1}`}
            disabled={rows.length <= LEAST}
            onClick={() => setRows(rows.filter((_, at) => at !== index))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}

      <div className="mt-3">
        <Button type="button" variant="outline" onClick={() => setRows([...rows, ''])}>
          <Plus />
          Add signatory
        </Button>
      </div>

      <Field label="Threshold">
        <Input
          value={threshold}
          inputMode="numeric"
          onChange={(event) => setThreshold(event.target.value.replace(/\D/g, ''))}
        />
      </Field>

      <GroupField value={groupId} onChange={setGroupId} />

      <p className="mt-3 text-[12.5px] text-muted-foreground">
        {derived ? (
          <>
            Address <span className="font-mono">{shorten(derived.address)}</span>, spendable by any{' '}
            {threshold} of {derived.signatories.length}
          </>
        ) : (
          'The address appears once the signatories and threshold add up'
        )}
      </p>
      <p className="mt-1 text-[12.5px] text-dim">
        Sending starts with one signatory here and runs once enough of the others have signed.
        A multisig with no signatory here only holds and receives.
      </p>

      <FieldError>{error}</FieldError>
    </Modal>
  )
}
