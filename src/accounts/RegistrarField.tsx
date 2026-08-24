import type { Registrar } from '@/chain/identity'
import { useSymbol } from '@/chain/queries'
import { formatAmount } from '@/lib/balance'
import { AddressField } from './AddressField'


/**
 * Which registrar. A chain may carry twenty, each charging its own fee and
 * checking its own set of fields, so the one at the front of the list is a
 * default rather than the answer.
 */
export function RegistrarField({
  registrars,
  value,
  onChange,
}: {
  registrars: Registrar[]
  value: number
  onChange: (index: number) => void
}) {
  const symbol = useSymbol()

  // An address box draws its own label and its own box, so wrapping it in a
  // field drew both of them twice
  return (
    <AddressField
      label="Registrar"
      value={registrars.find((entry) => entry.index === value)?.account ?? ''}
      onChange={() => {}}
      onPick={(picked) => onChange(picked.index)}
      accounts={registrars.map((entry) => ({
        address: entry.account,
        name: `${entry.index} · ${formatAmount(entry.fee, { precision: 4 })} ${symbol}`,
        index: entry.index,
      }))}
      readOnly
    />
  )
}
